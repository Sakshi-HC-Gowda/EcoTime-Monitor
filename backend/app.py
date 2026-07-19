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
from flask_sqlalchemy import SQLAlchemy

# ---------------------------------------------------------------------------
# Shared SQLAlchemy instance (imported by models)
# ---------------------------------------------------------------------------
db = SQLAlchemy()

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
    db_path = os.getenv("DATABASE_URL", "sqlite:///ecotime.db")

    if config_name == "production":
        app.config.update(
            DEBUG=False,
            TESTING=False,
            SQLALCHEMY_DATABASE_URI=db_path,
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
            SQLALCHEMY_ENGINE_OPTIONS={"pool_pre_ping": True},
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
        )

    logger.info("Starting EcoTime backend [%s mode]", config_name)

    # -----------------------------------------------------------------------
    # Database Initialisation
    # -----------------------------------------------------------------------
    db.init_app(app)

    with app.app_context():
        # Import models so SQLAlchemy registers them before create_all()
        from models import activity  # noqa: F401
        db.create_all()
        logger.info("Database tables verified/created")

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

    app.register_blueprint(carbon_bp, url_prefix="/api")
    app.register_blueprint(activities_bp, url_prefix="/api")
    app.register_blueprint(optimizer_bp, url_prefix="/api")
    app.register_blueprint(forecast_bp, url_prefix="/api")

    logger.info("Blueprints registered: carbon, activities, optimizer, forecast")

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
    app.run(host="0.0.0.0", port=port, debug=True)
