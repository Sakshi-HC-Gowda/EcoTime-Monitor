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
import hashlib
import json
import re
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from auth_utils import require_auth
from extensions import db
from models.activity import Activity

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
@require_auth
def create():
    """
    Create a new activity/task.

    Request Body (JSON):
        name (str, required)
        type (str, required): 'flexible' | 'non-flexible'
        duration (float, required): minutes
        powerDraw (float, optional): Estimated Watts; defaults by activity type
        activityType (str): one of the known activity types
        priorityScore (int): 0-100, default 50
        flexibilityScore (int): 0-100, auto-set if missing
    Idempotency-Key (header, optional): Replays an identical registration retry.

    Returns 201: { success: true, data: Task }
    Returns 200: Replayed idempotent registration
    Returns 400: { success: false, error: str }
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "error": "Request body must be a JSON object",
            "timestamp": _now_iso(),
        }), 400

    idempotency_key = request.headers.get("Idempotency-Key")
    if idempotency_key is not None and not re.fullmatch(r"[\x21-\x7e]{1,128}", idempotency_key):
        return jsonify({
            "success": False,
            "error": "Idempotency-Key must contain 1 to 128 visible ASCII characters",
            "timestamp": _now_iso(),
        }), 400
    try:
        fingerprint = hashlib.sha256(json.dumps(
            data,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")).hexdigest()
    except (TypeError, ValueError):
        return jsonify({
            "success": False,
            "error": "Request body contains invalid JSON values",
            "timestamp": _now_iso(),
        }), 400

    task, error, replayed = create_activity(
        data,
        request.user,
        idempotency_key=idempotency_key,
        request_fingerprint=fingerprint if idempotency_key else None,
    )

    if error:
        return jsonify({
            "success": False,
            "error": error,
            "timestamp": _now_iso(),
        }), (
            500 if error.startswith("Could not ")
            else 409 if error.startswith("Idempotency-Key was already used")
            else 400
        )

    return jsonify({
        "success": True,
        "data": task,
        "timestamp": _now_iso(),
    }), 200 if replayed else 201


# ---------------------------------------------------------------------------
# List Activities
# ---------------------------------------------------------------------------

@activities_bp.route("/activities", methods=["GET"])
@require_auth
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

    result = list_activities(
        organization_id=request.user.organization_id,
        page=page,
        page_size=page_size,
        status_filter=status_filter,
    )

    return jsonify({
        "success": True,
        "data": result,
        "timestamp": _now_iso(),
    }), 200


# ---------------------------------------------------------------------------
# Get Single Activity
# ---------------------------------------------------------------------------

@activities_bp.route("/activities/<task_id>", methods=["GET"])
@require_auth
def get_one(task_id: str):
    """
    Get a specific activity by ID.

    Returns 200: { success: true, data: Task }
    Returns 404: { success: false, error: str }
    """
    task = get_activity(task_id, request.user.organization_id)

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
@require_auth
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
    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "error": "Request body must be valid JSON",
            "timestamp": _now_iso(),
        }), 400

    task, error = update_activity(task_id, data, request.user.organization_id)

    if error:
        status_code = (
            500 if error.startswith("Failed to save")
            else 404 if "not found" in error.lower()
            else 400
        )
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
@require_auth
def delete(task_id: str):
    """
    Delete an activity by ID.

    Returns 200: { success: true, data: { message: str } }
    Returns 404: { success: false, error: str }
    """
    success, error = delete_activity(task_id, request.user.organization_id)

    if not success:
        return jsonify({
            "success": False,
            "error": error,
            "timestamp": _now_iso(),
        }), 500 if error == "Failed to delete activity" else 404

    return jsonify({
        "success": True,
        "data": {"message": f"Activity '{task_id}' deleted successfully"},
        "timestamp": _now_iso(),
    }), 200


# ---------------------------------------------------------------------------
# Bulk Update (used by orchestrator / scheduler)
# ---------------------------------------------------------------------------

@activities_bp.route("/activities/bulk", methods=["POST"])
@require_auth
def bulk_update():
    """
    Bulk-update multiple activities in one request.
    Used by the scheduler after assigning tasks to windows.

    Request Body (JSON):
        { updates: [{ id: str, status?: str, progress?: float, ... }] }

    Updates are validated and committed atomically; schedule state is optimizer-owned.
    Returns 200: { success: true, data: Task[] }
    """
    data = request.get_json(silent=True)
    if data is None:
        data = {}
    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "error": "Request body must be a JSON object",
            "timestamp": _now_iso(),
        }), 400
    updates = data.get("updates", [])

    if not isinstance(updates, list):
        return jsonify({
            "success": False,
            "error": "Field 'updates' must be an array",
            "timestamp": _now_iso(),
        }), 400

    if any(
        not isinstance(item, dict)
        or not isinstance(item.get("id"), str)
        or not item["id"]
        for item in updates
    ):
        return jsonify({
            "success": False,
            "error": "Each update must be an object with a non-empty string id",
            "timestamp": _now_iso(),
        }), 400

    task_ids = [item["id"] for item in updates]
    if len(set(task_ids)) != len(task_ids):
        return jsonify({
            "success": False,
            "error": "An activity may appear only once in a bulk update",
            "timestamp": _now_iso(),
        }), 400
    owned_count = Activity.query.filter(
        Activity.organization_id == request.user.organization_id,
        Activity.id.in_(task_ids or [""]),
    ).count()
    if owned_count != len(task_ids):
        return jsonify({
            "success": False,
            "error": "One or more activities do not belong to your organization",
            "timestamp": _now_iso(),
        }), 403

    updated_tasks, error = bulk_update_activities(updates, request.user.organization_id)
    if error:
        return jsonify({
            "success": False,
            "error": error,
            "timestamp": _now_iso(),
        }), 500 if error.startswith("Could not ") else 400

    return jsonify({
        "success": True,
        "data": updated_tasks,
        "count": len(updated_tasks),
        "timestamp": _now_iso(),
    }), 200
