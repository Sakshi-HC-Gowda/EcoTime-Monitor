"""
Activity / Task Management Routes
==================================
POST   /api/activities           — Create a new task
GET    /api/activities           — List tasks (paginated, filterable)
GET    /api/activities/<id>      — Get a single task
PATCH  /api/activities/<id>      — Update task status/progress/assignment
DELETE /api/activities/<id>      — Delete a task
POST   /api/activities/bulk      — Bulk update multiple tasks
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify

from services.activity_service import (
    create_activity,
    list_activities,
    get_activity,
    update_activity,
    delete_activity,
    bulk_update_activities,
)

logger = logging.getLogger(__name__)
activities_bp = Blueprint("activities", __name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Create Activity
# ---------------------------------------------------------------------------

@activities_bp.route("/activities", methods=["POST"])
def create():
    """
    Create a new activity/task.

    Request Body (JSON):
        name (str, required)
        type (str, required): 'flexible' | 'non-flexible'
        duration (float, required): minutes
        powerDraw (float, required): Watts
        activityType (str): one of the known activity types
        priorityScore (int): 0-100, default 50
        flexibilityScore (int): 0-100, auto-set if missing

    Returns 201: { success: true, data: Task }
    Returns 400: { success: false, error: str }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({
            "success": False,
            "error": "Request body must be valid JSON",
            "timestamp": _now_iso(),
        }), 400

    task, error = create_activity(data)

    if error:
        return jsonify({
            "success": False,
            "error": error,
            "timestamp": _now_iso(),
        }), 400

    return jsonify({
        "success": True,
        "data": task,
        "timestamp": _now_iso(),
    }), 201


# ---------------------------------------------------------------------------
# List Activities
# ---------------------------------------------------------------------------

@activities_bp.route("/activities", methods=["GET"])
def list_all():
    """
    List activities with optional filtering and pagination.

    Query Parameters:
        page (int): 1-based page number (default: 1)
        pageSize (int): Items per page (default: 50, max: 200)
        status (str): Filter by status

    Returns 200: { success: true, data: PaginatedResponse<Task> }
    """
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("pageSize", 50, type=int)
    status_filter = request.args.get("status", None)

    result = list_activities(page=page, page_size=page_size, status_filter=status_filter)

    return jsonify({
        "success": True,
        "data": result,
        "timestamp": _now_iso(),
    }), 200


# ---------------------------------------------------------------------------
# Get Single Activity
# ---------------------------------------------------------------------------

@activities_bp.route("/activities/<task_id>", methods=["GET"])
def get_one(task_id: str):
    """
    Get a specific activity by ID.

    Returns 200: { success: true, data: Task }
    Returns 404: { success: false, error: str }
    """
    task = get_activity(task_id)

    if not task:
        return jsonify({
            "success": False,
            "error": f"Activity '{task_id}' not found",
            "timestamp": _now_iso(),
        }), 404

    return jsonify({
        "success": True,
        "data": task,
        "timestamp": _now_iso(),
    }), 200


# ---------------------------------------------------------------------------
# Update Activity
# ---------------------------------------------------------------------------

@activities_bp.route("/activities/<task_id>", methods=["PATCH"])
def update(task_id: str):
    """
    Update status, progress, or window assignment for an activity.

    Request Body (JSON — all optional):
        status (str)
        progress (float): 0-100
        assignedWindowId (str | null)

    Returns 200: { success: true, data: Task }
    Returns 400/404: { success: false, error: str }
    """
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({
            "success": False,
            "error": "Request body must be valid JSON",
            "timestamp": _now_iso(),
        }), 400

    task, error = update_activity(task_id, data)

    if error:
        status_code = 404 if "not found" in error.lower() else 400
        return jsonify({
            "success": False,
            "error": error,
            "timestamp": _now_iso(),
        }), status_code

    return jsonify({
        "success": True,
        "data": task,
        "timestamp": _now_iso(),
    }), 200


# ---------------------------------------------------------------------------
# Delete Activity
# ---------------------------------------------------------------------------

@activities_bp.route("/activities/<task_id>", methods=["DELETE"])
def delete(task_id: str):
    """
    Delete an activity by ID.

    Returns 200: { success: true, data: { message: str } }
    Returns 404: { success: false, error: str }
    """
    success, error = delete_activity(task_id)

    if not success:
        return jsonify({
            "success": False,
            "error": error,
            "timestamp": _now_iso(),
        }), 404

    return jsonify({
        "success": True,
        "data": {"message": f"Activity '{task_id}' deleted successfully"},
        "timestamp": _now_iso(),
    }), 200


# ---------------------------------------------------------------------------
# Bulk Update (used by orchestrator / scheduler)
# ---------------------------------------------------------------------------

@activities_bp.route("/activities/bulk", methods=["POST"])
def bulk_update():
    """
    Bulk-update multiple activities in one request.
    Used by the scheduler after assigning tasks to windows.

    Request Body (JSON):
        { updates: [{ id: str, status?: str, progress?: float, ... }] }

    Returns 200: { success: true, data: Task[] }
    """
    data = request.get_json(silent=True) or {}
    updates = data.get("updates", [])

    if not isinstance(updates, list):
        return jsonify({
            "success": False,
            "error": "Field 'updates' must be an array",
            "timestamp": _now_iso(),
        }), 400

    updated_tasks = bulk_update_activities(updates)

    return jsonify({
        "success": True,
        "data": updated_tasks,
        "count": len(updated_tasks),
        "timestamp": _now_iso(),
    }), 200
