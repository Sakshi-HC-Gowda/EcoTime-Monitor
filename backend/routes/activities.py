"""
Activity / Task Management Routes
Handles CRUD operations for digital activities
"""

from flask import Blueprint, request, jsonify
from datetime import datetime
from typing import Dict, List, Any

activities_bp = Blueprint('activities', __name__)

# Temporary in-memory storage for activities (will be replaced with database in Phase 2)
ACTIVITIES_STORE: Dict[str, Dict[str, Any]] = {}


@activities_bp.route('/activities', methods=['POST'])
def create_activity():
    """
    Create a new digital activity/task
    
    Request Body:
        {
            name: string,
            type: 'flexible' | 'non-flexible',
            activityType: 'file-upload' | 'cloud-backup' | etc,
            duration: number (minutes),
            powerDraw: number (Watts),
            priorityScore: number (0-100),
            flexibilityScore?: number (0-100)
        }
    
    Returns:
        JSON: Created task with ID, timestamps, and status
    """
    data = request.get_json()
    
    if not data or not all(k in data for k in ['name', 'type', 'duration', 'powerDraw']):
        return jsonify({
            'success': False,
            'error': 'Missing required fields: name, type, duration, powerDraw',
            'timestamp': datetime.utcnow().isoformat(),
        }), 400
    
    # TODO: Validate and create task via activities_service
    
    task_id = f"task-{datetime.utcnow().timestamp()}"
    now = datetime.utcnow().isoformat()
    
    task = {
        'id': task_id,
        'name': data.get('name'),
        'type': data.get('type'),
        'activityType': data.get('activityType', 'batch-processing'),
        'duration': data.get('duration'),
        'powerDraw': data.get('powerDraw'),
        'priorityScore': data.get('priorityScore', 50),
        'flexibilityScore': data.get('flexibilityScore', 70 if data.get('type') == 'flexible' else 0),
        'status': 'idle',
        'progress': 0,
        'createdAt': now,
        'updatedAt': now,
    }
    
    ACTIVITIES_STORE[task_id] = task
    
    return jsonify({
        'success': True,
        'data': task,
        'timestamp': now,
    }), 201


@activities_bp.route('/activities', methods=['GET'])
def list_activities():
    """
    List all activities with pagination
    
    Query Parameters:
        page: Page number (1-based), default 1
        pageSize: Items per page, default 50
    
    Returns:
        JSON: Paginated list of activities
    """
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('pageSize', 50, type=int)
    
    # TODO: Fetch from database with pagination
    
    items = list(ACTIVITIES_STORE.values())
    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    
    return jsonify({
        'success': True,
        'data': {
            'items': items[start:end],
            'total': total,
            'page': page,
            'pageSize': page_size,
            'hasMore': end < total,
        },
        'timestamp': datetime.utcnow().isoformat(),
    }), 200


@activities_bp.route('/activities/<task_id>', methods=['GET'])
def get_activity(task_id: str):
    """
    Get a specific activity by ID
    
    URL Parameters:
        task_id: Activity identifier
    
    Returns:
        JSON: Activity details or 404 if not found
    """
    # TODO: Fetch from database
    
    task = ACTIVITIES_STORE.get(task_id)
    
    if not task:
        return jsonify({
            'success': False,
            'error': f'Activity {task_id} not found',
            'timestamp': datetime.utcnow().isoformat(),
        }), 404
    
    return jsonify({
        'success': True,
        'data': task,
        'timestamp': datetime.utcnow().isoformat(),
    }), 200


@activities_bp.route('/activities/<task_id>', methods=['PATCH'])
def update_activity(task_id: str):
    """
    Update an activity's status, progress, or assignment
    
    URL Parameters:
        task_id: Activity identifier
    
    Request Body:
        {
            status?: 'idle' | 'running' | 'paused' | 'delayed' | 'completed',
            progress?: number (0-100),
            assignedWindowId?: string
        }
    
    Returns:
        JSON: Updated activity or 404 if not found
    """
    # TODO: Update in database
    
    task = ACTIVITIES_STORE.get(task_id)
    
    if not task:
        return jsonify({
            'success': False,
            'error': f'Activity {task_id} not found',
            'timestamp': datetime.utcnow().isoformat(),
        }), 404
    
    data = request.get_json()
    
    if 'status' in data:
        task['status'] = data['status']
    if 'progress' in data:
        task['progress'] = data['progress']
    if 'assignedWindowId' in data:
        task['assignedWindowId'] = data['assignedWindowId']
    
    task['updatedAt'] = datetime.utcnow().isoformat()
    
    return jsonify({
        'success': True,
        'data': task,
        'timestamp': datetime.utcnow().isoformat(),
    }), 200


@activities_bp.route('/activities/<task_id>', methods=['DELETE'])
def delete_activity(task_id: str):
    """
    Delete an activity
    
    URL Parameters:
        task_id: Activity identifier
    
    Returns:
        JSON: Success message or 404 if not found
    """
    # TODO: Delete from database
    
    if task_id not in ACTIVITIES_STORE:
        return jsonify({
            'success': False,
            'error': f'Activity {task_id} not found',
            'timestamp': datetime.utcnow().isoformat(),
        }), 404
    
    del ACTIVITIES_STORE[task_id]
    
    return jsonify({
        'success': True,
        'data': {'message': f'Activity {task_id} deleted'},
        'timestamp': datetime.utcnow().isoformat(),
    }), 200
