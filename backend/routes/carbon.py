"""
Carbon Data Routes
Handles fetching and returning carbon intensity data
"""

from flask import Blueprint, request, jsonify
from datetime import datetime
import sys
import os

# Add src directory to path so we can import shared types
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

carbon_bp = Blueprint('carbon', __name__)

# Placeholder for carbon service (will be implemented in Phase 2)
# This currently returns mock data for demonstration


@carbon_bp.route('/carbon', methods=['GET'])
def get_carbon_data():
    """
    Get carbon intensity data for a specific zone
    
    Query Parameters:
        zone: Grid zone ID (e.g., 'IN', 'DE', 'FR')
        offset: Time offset in hours for simulation (optional)
    
    Returns:
        JSON: {
            zone: string,
            current: { datetime, carbonIntensity },
            history: [...],
            forecast: [...],
            isSimulated: boolean,
            error?: string
        }
    """
    zone = request.args.get('zone', 'IN')
    offset = request.args.get('offset', 0, type=float)
    
    # TODO: Call carbon_service.get_carbon_data(zone, offset)
    # For now, return a placeholder
    
    return jsonify({
        'success': True,
        'data': {
            'zone': zone,
            'current': {
                'datetime': datetime.utcnow().isoformat(),
                'carbonIntensity': 180,
            },
            'history': [],
            'forecast': [],
            'isSimulated': True,
            'error': 'Service implementation pending',
        },
        'timestamp': datetime.utcnow().isoformat(),
    }), 200


@carbon_bp.route('/windows', methods=['GET'])
def get_green_windows():
    """
    Get detected green windows for a zone
    
    Query Parameters:
        zone: Grid zone ID
        threshold: Carbon intensity threshold for green windows
    
    Returns:
        JSON: Array of green windows with scoring information
    """
    zone = request.args.get('zone', 'US-CA')
    threshold = request.args.get('threshold', 180, type=float)
    
    # TODO: Call carbon_service.detect_green_windows(zone, threshold)
    
    return jsonify({
        'success': True,
        'data': [],
        'timestamp': datetime.utcnow().isoformat(),
    }), 200
