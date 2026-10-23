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

from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.exceptions import RequestEntityTooLarge
from extensions import db

# Load backend/.env regardless of the directory used to start Flask.
load_dotenv(Path(__file__).resolve().with_name(".env"))

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
    # Configuration
    # -----------------------------------------------------------------------
    config_name = config_name or os.getenv("FLASK_ENV", "development")
    database_url = (
        os.getenv("TEST_DATABASE_URL", "sqlite:///:memory:")
        if config_name == "testing"
        else os.getenv("DATABASE_URL")
    )
    secret_key = os.getenv("SECRET_KEY")
    if not secret_key:
        if config_name in {"production", "prod"}:
            raise RuntimeError("SECRET_KEY is required in production.")
        secret_key = "ecotime-development-only-secret-key"

    if not database_url:
        if config_name == "testing":
            database_url = "sqlite:///:memory:"
        else:
            raise RuntimeError(
                "DATABASE_URL is not configured. Add it to backend/.env before starting EcoTime."
            )
    if config_name == "testing":
        valid_database_prefixes = ("postgresql://", "postgresql+psycopg2://", "sqlite://")
    else:
        valid_database_prefixes = ("postgresql://", "postgresql+psycopg2://")
    if not database_url.startswith(valid_database_prefixes):
        raise RuntimeError("DATABASE_URL must use a PostgreSQL URL outside testing.")
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace(
            "postgresql://", "postgresql+psycopg2://", 1
        )

    app.config.update(
        SECRET_KEY=secret_key,
        JWT_SECRET_KEY=secret_key,
        DEBUG=config_name == "development",
        TESTING=config_name == "testing",
        SQLALCHEMY_DATABASE_URI=database_url,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        MAX_CONTENT_LENGTH=101 * 1024 * 1024,
        SQLALCHEMY_ENGINE_OPTIONS={
            "pool_pre_ping": True,
            "pool_recycle": 1800,
        },
        DATABASE_AVAILABLE=False,
    )

    jwt = JWTManager(app)

    @jwt.expired_token_loader
    def expired_token(_jwt_header, _jwt_payload):
        return jsonify({
            "success": False,
            "error": "Authentication token has expired",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }), 401

    @jwt.invalid_token_loader
    def invalid_token(_reason):
        return jsonify({
            "success": False,
            "error": "Authentication token is invalid",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }), 401

    @jwt.unauthorized_loader
    def missing_token(_reason):
        return jsonify({
            "success": False,
            "error": "Authentication required",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }), 401
    app.config["JWT_TOKEN_LOCATION"] = ["headers"]
    app.config["JWT_HEADER_NAME"] = "Authorization"
    app.config["JWT_HEADER_TYPE"] = "Bearer"
    logger.info("Starting EcoTime backend [%s mode]", config_name)

    # -----------------------------------------------------------------------
    # Database Initialisation
    # -----------------------------------------------------------------------
    db.init_app(app)

    with app.app_context():
        # Import models so SQLAlchemy registers them before create_all()
        from models import (  # noqa: F401
            Activity,
            ActivityHistory,
            AnalyticsRecommendation,
            Organization,
            OrganizationMember,
            Role,
            SimulationConfig,
            User,
            UploadRegistration,
        )
        try:
            # Flask-SQLAlchemy delegates to SQLAlchemy's safe table check:
            # create_all() creates only absent tables and never drops data.
            db.create_all()
            _ensure_organization_ownership_schema()
            _migrate_legacy_idle_activities()
            db.session.execute(text("SELECT 1"))
            db.session.commit()
            app.config["DATABASE_AVAILABLE"] = True
            logger.info("Database ready; tables verified/created")
        except SQLAlchemyError as error:
            db.session.rollback()
            logger.error("Database unavailable: %s", error)

    # -----------------------------------------------------------------------
    # CORS
    # -----------------------------------------------------------------------
    CORS(app, resources={
        r"/api/*": {
            "origins": [
                "http://localhost:5173",   # Vite dev server
                "http://localhost:3000",   # Alt dev
                "http://localhost:5000",   # Production build
                "http://127.0.0.1:5173",
            ],
            "methods": ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "Idempotency-Key"],
        }
    })

    # -----------------------------------------------------------------------
    # Blueprint Registration
    # -----------------------------------------------------------------------
    from routes.auth import auth_bp
    from routes.carbon import carbon_bp
    from routes.activities import activities_bp
    from routes.optimizer import optimizer_bp
    from routes.forecast import forecast_bp
    from routes.organizations import organizations_bp
    from routes.upload import upload_bp

    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(carbon_bp, url_prefix="/api")
    app.register_blueprint(activities_bp, url_prefix="/api")
    app.register_blueprint(optimizer_bp, url_prefix="/api")
    app.register_blueprint(forecast_bp, url_prefix="/api")
    app.register_blueprint(organizations_bp, url_prefix="/api")
    app.register_blueprint(upload_bp, url_prefix="/api")

    logger.info("Blueprints registered: auth, carbon, activities, optimizer, forecast, organizations, upload")

    # -----------------------------------------------------------------------
    # Health Check & Root
    # -----------------------------------------------------------------------

    @app.route("/api/health", methods=["GET"])
    def health_check():
        """Health check endpoint for load balancers and frontend."""
        from forecast.predict import get_predictor
        predictor = get_predictor()
        database_available = app.config["DATABASE_AVAILABLE"]
        return jsonify({
            "status": "healthy" if database_available else "degraded",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version": "2.0.0",
            "services": {
                "database": "connected" if database_available else "unavailable",
                "ml_model": predictor._model_name,
                "ml_trained": predictor.is_trained(),
            },
        }), 200 if database_available else 503

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
                "upload": "/api/upload",
                "upload_status": "/api/uploads/<id>",
                "upload_history": "/api/activities/<id>/uploads",
                "eco_score": "/api/eco-score",
                "forecast": "/api/forecast",
                "forecast_info": "/api/forecast/info",
                "ml_train": "/api/ml/train",
                "config": "/api/config/simulation",
                "analytics_recommendations": "/api/analytics/recommendations",
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

    @app.errorhandler(RequestEntityTooLarge)
    def request_too_large(_error):
        return jsonify({
            "success": False,
            "error": "Upload request exceeds the 100 MiB limit",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }), 413

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


def _ensure_organization_ownership_schema() -> None:
    """Add tenant and scheduling-bound columns without guessing legacy ownership."""
    if db.engine.dialect.name != "postgresql":
        return

    db.session.execute(text(
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS organization_id INTEGER"
    ))
    db.session.execute(text(
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS earliest_start TIMESTAMP WITH TIME ZONE"
    ))
    db.session.execute(text(
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS scheduled_start_time TIMESTAMP WITH TIME ZONE"
    ))
    db.session.execute(text(
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS expected_end_time TIMESTAMP WITH TIME ZONE"
    ))
    db.session.execute(text(
        "ALTER TABLE upload_registrations ADD COLUMN IF NOT EXISTS scheduled_end_time TIMESTAMP WITH TIME ZONE"
    ))
    db.session.execute(text(
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS execution_start_time TIMESTAMP WITH TIME ZONE"
    ))
    db.session.execute(text(
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS deadline TIMESTAMP WITH TIME ZONE"
    ))
    db.session.execute(text(
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128)"
    ))
    db.session.execute(text(
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS request_fingerprint VARCHAR(64)"
    ))
    db.session.execute(text(
        "ALTER TABLE upload_registrations ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128)"
    ))
    db.session.execute(text(
        "ALTER TABLE upload_registrations ADD COLUMN IF NOT EXISTS request_fingerprint VARCHAR(64)"
    ))
    db.session.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_activities_org_idempotency_key "
        "ON activities (organization_id, idempotency_key)"
    ))
    db.session.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_uploads_org_idempotency_key "
        "ON upload_registrations (organization_id, idempotency_key)"
    ))
    db.session.execute(text(
        "ALTER TABLE analytics_recommendations "
        "ADD COLUMN IF NOT EXISTS organization_id INTEGER"
    ))

    db.session.execute(text(
        "UPDATE analytics_recommendations recommendation SET organization_id = activity.organization_id "
        "FROM activities activity "
        "WHERE recommendation.activity_id = activity.id "
        "AND recommendation.organization_id IS NULL"
    ))

    db.session.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_activities_organization_id "
        "ON activities (organization_id)"
    ))
    db.session.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_analytics_recommendations_organization_id "
        "ON analytics_recommendations (organization_id)"
    ))
    db.session.execute(text(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = "
        "'activities_organization_id_fkey') THEN "
        "ALTER TABLE activities ADD CONSTRAINT activities_organization_id_fkey "
        "FOREIGN KEY (organization_id) REFERENCES organizations(id); "
        "END IF; END $$"
    ))
    db.session.execute(text(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = "
        "'analytics_recommendations_organization_id_fkey') THEN "
        "ALTER TABLE analytics_recommendations ADD CONSTRAINT "
        "analytics_recommendations_organization_id_fkey "
        "FOREIGN KEY (organization_id) REFERENCES organizations(id); "
        "END IF; END $$"
    ))

    orphan_count = db.session.execute(text(
        "SELECT COUNT(*) FROM activities WHERE organization_id IS NULL"
    )).scalar_one()
    if orphan_count == 0:
        db.session.execute(text(
            "ALTER TABLE activities ALTER COLUMN organization_id SET NOT NULL"
        ))


def _migrate_legacy_idle_activities() -> None:
    """Move activities created by older versions into the Pending lifecycle state."""
    from models.activity import Activity
    from models.activity_history import ActivityHistory

    legacy_activities = Activity.query.filter_by(status="idle").with_for_update().all()
    if not legacy_activities:
        return

    now = datetime.now(timezone.utc)
    for activity in legacy_activities:
        previous_updated_at = activity.updated_at
        if previous_updated_at and previous_updated_at.tzinfo is None:
            previous_updated_at = previous_updated_at.replace(tzinfo=timezone.utc)
        db.session.add(ActivityHistory(
            activity_id=activity.id,
            previous_status="idle",
            new_status="pending",
            execution_time=(now - previous_updated_at).total_seconds() if previous_updated_at else None,
        ))
        activity.status = "pending"
        activity.updated_at = now
    logger.info("Migrated %d legacy idle activities to pending", len(legacy_activities))


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    try:
        app = create_app()
    except RuntimeError as error:
        logger.error("EcoTime startup configuration error: %s", error)
    else:
        port = int(os.getenv("PORT", 5000))
        app.run(host="0.0.0.0", port=port, debug=app.config["DEBUG"])
