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

from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

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
    # Database Path
    # -----------------------------------------------------------------------
    # THIS IS WHERE POSTGRESQL VS SQLITE IS DECIDED:
    #   - Set DATABASE_URL in backend/.env (see .env.example) to use
    #     PostgreSQL, e.g. postgresql://user:password@localhost:5432/ecotime
    #   - Leave it unset to keep using local SQLite (backend/ecotime.db) —
    #     no code change needed either way, this is purely env-driven.
    #
    # Flask-SQLAlchemy resolves a *relative* sqlite:/// URI against
    # app.instance_path (a hidden "instance/" subfolder), NOT the working
    # directory — a well-known surprise. Using an explicit absolute path
    # here guarantees the SQLite fallback is always backend/ecotime.db,
    # unambiguously, regardless of instance-folder resolution or CWD.
    _BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
    _default_db_path = f"sqlite:///{os.path.join(_BACKEND_DIR, 'ecotime.db')}"
    db_path = os.getenv("DATABASE_URL", _default_db_path)

    # Heroku / Railway export DATABASE_URL with the 'postgres://' scheme,
    # which SQLAlchemy 2.x rejects (requires 'postgresql://').
    if db_path.startswith("postgres://"):
        db_path = db_path.replace("postgres://", "postgresql://", 1)

    # -----------------------------------------------------------------------
    # Configuration
    # -----------------------------------------------------------------------
    config_name = config_name or os.getenv("FLASK_ENV", "development")

    _is_pg = db_path.startswith("postgresql://")
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
            SQLALCHEMY_DATABASE_URI=db_path,
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
            SQLALCHEMY_DATABASE_URI=db_path,
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