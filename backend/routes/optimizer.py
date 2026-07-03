"""
Optimization & Scheduling Routes
Handles scheduling algorithms: greedy, knapsack, EcoScore
"""

from flask import Blueprint, request, jsonify
from datetime import datetime

optimizer_bp = Blueprint('optimizer', __name__)


@optimizer_bp.route('/scheduler', methods=['POST'])
def run_scheduler():
    """
    Run optimization algorithm to schedule tasks into green windows
    
    Request Body:
        {
            tasks: Task[],
            window: GreenWindow,
            method: 'greedy' | 'knapsack',
            baselineIntensity: number
        }
    
    Returns:
        JSON: {
            result: OptimizationResult,
            tasks: Task[] (with updated assignments)
        }
    """
    data = request.get_json()
    
    if not data or not all(k in data for k in ['tasks', 'window', 'method', 'baselineIntensity']):
        return jsonify({
            'success': False,
            'error': 'Missing required fields: tasks, window, method, baselineIntensity',
            'timestamp': datetime.utcnow().isoformat(),
        }), 400
    
    tasks = data.get('tasks', [])
    window = data.get('window', {})
    method = data.get('method', 'greedy')
    baseline_intensity = data.get('baselineIntensity', 380)
    
    # TODO: Call optimizer_service.schedule(tasks, window, method, baseline_intensity)
    
    # Placeholder response
    result = {
        'method': method,
        'windowId': window.get('id'),
        'selectedTasks': [],
        'totalSavedCo2': 0,
        'totalDuration': 0,
        'windowCapacity': window.get('duration', 0),
        'utilizationPercent': 0,
        'createdAt': datetime.utcnow().isoformat(),
    }
    
    return jsonify({
        'success': True,
        'data': {
            'result': result,
            'tasks': tasks,
        },
        'timestamp': datetime.utcnow().isoformat(),
    }), 200


@optimizer_bp.route('/eco-score', methods=['GET'])
def get_eco_score():
    """
    Calculate EcoScore for a task based on current grid conditions
    
    Query Parameters:
        taskId: Task identifier
        currentIntensity: Current grid carbon intensity
        baselineIntensity: Baseline for comparison
        peakIntensity: Peak intensity for scoring range
    
    Returns:
        JSON: EcoScore details with recommendation
    """
    task_id = request.args.get('taskId')
    current_intensity = request.args.get('currentIntensity', 180, type=float)
    baseline_intensity = request.args.get('baselineIntensity', 380, type=float)
    peak_intensity = request.args.get('peakIntensity', 800, type=float)
    
    if not task_id:
        return jsonify({
            'success': False,
            'error': 'Missing required parameter: taskId',
            'timestamp': datetime.utcnow().isoformat(),
        }), 400
    
    # TODO: Call optimizer_service.calculate_eco_score(task_id, current_intensity, baseline_intensity, peak_intensity)
    
    # Placeholder response
    eco_score = {
        'taskId': task_id,
        'carbonScore': 75,
        'flexibilityScore': 70,
        'priorityScore': 50,
        'ecoScore': 68.5,
        'recommendation': 'Schedule Automatically',
        'reason': 'Grid carbon intensity is moderate. Optimal to defer to a Green Window.',
    }
    
    return jsonify({
        'success': True,
        'data': eco_score,
        'timestamp': datetime.utcnow().isoformat(),
    }), 200


@optimizer_bp.route('/config/simulation', methods=['POST'])
def set_simulation_config():
    """
    Configure simulation parameters (zone, threshold, baseline, speed)
    
    Request Body:
        {
            zone?: string,
            apiKey?: string,
            lowCarbonThreshold?: number,
            baselineIntensity?: number,
            simulationSpeed?: number,
            isSimulating?: boolean
        }
    
    Returns:
        JSON: Updated configuration
    """
    data = request.get_json() or {}
    
    # TODO: Store configuration in session/database
    
    config = {
        'zone': data.get('zone', 'IN'),
        'lowCarbonThreshold': data.get('lowCarbonThreshold', 180),
        'baselineIntensity': data.get('baselineIntensity', 380),
        'simulationSpeed': data.get('simulationSpeed', 15),
        'isSimulating': data.get('isSimulating', True),
    }
    
    return jsonify({
        'success': True,
        'data': config,
        'timestamp': datetime.utcnow().isoformat(),
    }), 200
