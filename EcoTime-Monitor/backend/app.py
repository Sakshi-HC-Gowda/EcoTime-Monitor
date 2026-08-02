"""
EcoTime Backend — Flask Application Entry Point
================================================
Application factory with:
  - Environment-based configuration (dev / test / production)
  - CORS for all frontend origins
  - Modular blueprint registration
  - SQLAlchemy database initialisation
  - Structured logging
  - Health check + root endpoints
  - 404 / 500 error handlers
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from extensions import db

# Load backend/.env if present (e.g. DATABASE_URL for PostgreSQL).
# python-dotenv was already a declared dependency but was never actually
# invoked anywhere — a .env file silently did nothing before this line.
load_dotenv()

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SQLITE_DB = BASE_DIR / "instance" / "ecotime.db"


def _build_sqlite_uri() -> str:
    DEFAULT_SQLITE_DB.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{DEFAULT_SQLITE_DB.as_posix()}"


def _resolve_database_config(config_name: str, configured_uri: str | None) -> tuple[str, bool]:
    """Prefer PostgreSQL when available, but fall back to SQLite for local/dev runs."""
    if config_name == "testing":
        return "sqlite:///:memory:", False

    if configured_uri and configured_uri.startswith("postgres://"):
        configured_uri = configured_uri.replace("postgres://", "postgresql://", 1)

    if configured_uri and configured_uri.startswith("postgresql://"):
        try:
            engine = create_engine(
                configured_uri,
                connect_args={"connect_timeout": 2},
                pool_pre_ping=True,
            )
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Using PostgreSQL database from DATABASE_URL")
            return configured_uri, True
        except SQLAlchemyError as exc:
            logger.warning(
                "PostgreSQL connection unavailable (%s); falling back to local SQLite database",
                exc,
            )

    if configured_uri:
        logger.warning("DATABASE_URL was not usable for PostgreSQL; using local SQLite database")
    else:
        logger.warning("DATABASE_URL not set; using local SQLite database")

    return _build_sqlite_uri(), False


# ---------------------------------------------------------------------------
# Application Factory
# ---------------------------------------------------------------------------

def create_app(config_name: str | None = None) -> Flask:
    """
    Application factory for Flask app initialisation.

    Args:
        config_name: One of 'development', 'production', 'testing'.
                     Falls back to FLASK_ENV env var, then 'development'.

    Returns:
        Configured Flask application instance.
    """
    app = Flask(__name__)

    # -----------------------------------------------------------------------
    # Configuration
    # -----------------------------------------------------------------------
    config_name = config_name or os.getenv("FLASK_ENV", "development")
    database_uri, _is_pg = _resolve_database_config(
        config_name,
        os.getenv("DATABASE_URL"),
    )

    _pool_opts = {
        "pool_pre_ping": True,
        "pool_size": 10,
        "max_overflow": 20,
        "pool_recycle": 300,
    } if _is_pg else {}

    if config_name == "production":
        app.config.update(
            DEBUG=False,
            TESTING=False,
            SQLALCHEMY_DATABASE_URI=database_uri,
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
            SQLALCHEMY_ENGINE_OPTIONS=_pool_opts,
        )
    elif config_name == "testing":
        app.config.update(
            DEBUG=True,
            TESTING=True,
            SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
        )
    else:  # development (default)
        app.config.update(
            DEBUG=True,
            TESTING=False,
            SQLALCHEMY_DATABASE_URI=database_uri,
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
            SQLALCHEMY_ENGINE_OPTIONS=_pool_opts,
        )

    logger.info("Starting EcoTime backend [%s mode]", config_name)

    # -----------------------------------------------------------------------
    # Database Initialisation
    # -----------------------------------------------------------------------
    db.init_app(app)

    with app.app_context():
        # Import ALL models so SQLAlchemy registers them before create_all()
        from models import (  # noqa: F401
            activity, recommendation, activity_history, workload_profile,
            carbon_snapshot, current_status, system_setting, schedule_slot,
            execution_history, analytics_snapshot, carbon_forecast,
            notification, audit_log,
        )
        db.create_all()
        logger.info("Database tables verified/created (%s)",
                     "PostgreSQL" if _is_pg else "SQLite")

        # Apply non-destructive migrations for columns added after the
        # original tables were created (safe on both fresh and existing DBs).
        from migrations.migrate import run_migrations
        applied = run_migrations(db)
        if applied:
            logger.info("Migrations applied: %s", ", ".join(applied))

        # Seed default system settings (simulation config, operating status,
        # ML training status) — idempotent, safe to run every startup.
        from services.system_settings_service import seed_defaults
        seed_defaults()
        logger.info("System settings seeded")

        # Migrate existing SQLite data to PostgreSQL if ecotime.db is present
        from migrations.migrate_sqlite_to_pg import migrate_sqlite_data_to_pg
        migrated = migrate_sqlite_data_to_pg(db.session, db.engine)
        if any(migrated.values()):
            logger.info("Migrated SQLite data to PostgreSQL: %s", migrated)

    # -----------------------------------------------------------------------
    # Warm up the ML forecast model now (unpickling it is the slow part —
    # doing it here means the first real user request isn't the one that
    # pays that cost, which was causing the Forecast page — and anything
    # else queued behind it — to appear stuck for 30+ seconds).
    # -----------------------------------------------------------------------
    try:
        import time
        from forecast.predict import get_predictor
        _t0 = time.time()
        get_predictor()
        logger.info("ML forecast model warmed up in %.1fs", time.time() - _t0)
    except Exception:
        logger.exception("Forecast model warmup failed — will lazy-load on first request instead")

    # -----------------------------------------------------------------------
    # CORS
    # -----------------------------------------------------------------------
    CORS(app, resources={
        r"/api/*": {
            "origins": [
                "http://localhost:5173",   # Vite dev server (default)
                "http://localhost:5174",   # Vite fallback if 5173 is busy
                "http://localhost:5175",
                "http://localhost:5176",
                "http://localhost:3000",   # Alt dev
                "http://localhost:5000",   # Production build
                "http://127.0.0.1:5173",
                "http://127.0.0.1:5174",
                "http://127.0.0.1:5175",
            ],
            "methods": ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
        }
    })

    # -----------------------------------------------------------------------
    # Blueprint Registration
    # -----------------------------------------------------------------------
    from routes.carbon import carbon_bp
    from routes.activities import activities_bp
    from routes.optimizer import optimizer_bp
    from routes.forecast import forecast_bp
    from routes.analytics import analytics_bp

    app.register_blueprint(carbon_bp, url_prefix="/api")
    app.register_blueprint(activities_bp, url_prefix="/api")
    app.register_blueprint(optimizer_bp, url_prefix="/api")
    app.register_blueprint(forecast_bp, url_prefix="/api")
    app.register_blueprint(analytics_bp, url_prefix="/api")

    logger.info("Blueprints registered: carbon, activities, optimizer, forecast, analytics")

    # -----------------------------------------------------------------------
    # Health Check & Root
    # -----------------------------------------------------------------------

    @app.route("/api/health", methods=["GET"])
    def health_check():
        """Health check endpoint for load balancers and frontend."""
        from forecast.predict import get_predictor
        predictor = get_predictor()
        return jsonify({
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version": "2.0.0",
            "services": {
                "database": "connected",
                "ml_model": predictor._model_name,
                "ml_trained": predictor.is_trained(),
            },
        }), 200

    @app.route("/", methods=["GET"])
    def root():
        """Root info endpoint."""
        return jsonify({
            "name": "EcoTime Backend",
            "version": "2.0.0",
            "description": "Intelligent Carbon-Aware Digital Activity Optimizer",
            "endpoints": {
                "health": "/api/health",
                "carbon": "/api/carbon",
                "windows": "/api/windows",
                "zones": "/api/zones",
                "activities": "/api/activities",
                "scheduler": "/api/scheduler",
                "eco_score": "/api/eco-score",
                "forecast": "/api/forecast",
                "forecast_info": "/api/forecast/info",
                "ml_train": "/api/ml/train",
                "config": "/api/config/simulation",
                "analytics": "/api/analytics",
                "dashboard": "/api/dashboard",
                "history": "/api/history",
                "recommendations": "/api/recommendations",
                "status": "/api/status",
                "carbon_snapshots": "/api/carbon-snapshots",
                "activity_workload": "/api/activities/<id>/workload",
            },
        }), 200

    # -----------------------------------------------------------------------
    # Error Handlers
    # -----------------------------------------------------------------------

    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({
            "success": False,
            "error": "Bad request",
            "detail": str(error),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }), 400

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({
            "success": False,
            "error": "Endpoint not found",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }), 404

    @app.errorhandler(405)
    def method_not_allowed(error):
        return jsonify({
            "success": False,
            "error": "Method not allowed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }), 405

    @app.errorhandler(500)
    def internal_error(error):
        logger.exception("Unhandled internal error: %s", error)
        return jsonify({
            "success": False,
            "error": "Internal server error",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }), 500

    return app


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app = create_app()
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True, threaded=True)