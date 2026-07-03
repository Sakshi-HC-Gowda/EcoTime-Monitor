"""
EcoTime Backend - Flask Application Entry Point
Main application factory and configuration
"""

from flask import Flask, jsonify
from flask_cors import CORS
from datetime import datetime
import os

def create_app(config_name: str = None) -> Flask:
    """
    Application factory for Flask app initialization
    
    Args:
        config_name: Configuration environment ('development', 'production', 'testing')
    
    Returns:
        Configured Flask application instance
    """
    app = Flask(__name__)
    
    # Configuration
    config_name = config_name or os.getenv('FLASK_ENV', 'development')
    
    if config_name == 'production':
        app.config.update(
            DEBUG=False,
            TESTING=False,
        )
    elif config_name == 'testing':
        app.config.update(
            DEBUG=True,
            TESTING=True,
            SQLALCHEMY_DATABASE_URI='sqlite:///:memory:',
        )
    else:  # development
        app.config.update(
            DEBUG=True,
            TESTING=False,
            SQLALCHEMY_DATABASE_URI='sqlite:///ecotime.db',
        )
    
    # Enable CORS for frontend communication
    CORS(app, resources={
        r"/api/*": {
            "origins": [
                "http://localhost:5173",  # Vite dev server
                "http://localhost:3000",  # Alternative dev
                "http://localhost:5000",  # Production build
            ],
            "methods": ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
        }
    })
    
    # ========================================================================
    # Blueprint Registration
    # ========================================================================
    
    from routes.carbon import carbon_bp
    from routes.activities import activities_bp
    from routes.optimizer import optimizer_bp
    
    app.register_blueprint(carbon_bp, url_prefix='/api')
    app.register_blueprint(activities_bp, url_prefix='/api')
    app.register_blueprint(optimizer_bp, url_prefix='/api')
    
    # ========================================================================
    # Health Check & Root Routes
    # ========================================================================
    
    @app.route('/api/health', methods=['GET'])
    def health_check():
        """Health check endpoint"""
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'version': '1.0.0',
        }), 200
    
    @app.route('/', methods=['GET'])
    def root():
        """Root endpoint"""
        return jsonify({
            'name': 'EcoTime Backend',
            'version': '1.0.0',
            'description': 'Carbon-aware scheduling optimization platform',
        }), 200
    
    # ========================================================================
    # Error Handlers
    # ========================================================================
    
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({
            'success': False,
            'error': 'Endpoint not found',
            'timestamp': datetime.utcnow().isoformat(),
        }), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'timestamp': datetime.utcnow().isoformat(),
        }), 500
    
    return app


if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=True)
