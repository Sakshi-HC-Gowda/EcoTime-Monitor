"""
Activity Service
================
Manages task/activity CRUD with PostgreSQL persistence via SQLAlchemy
(models.activity.Activity). Every status change is additionally logged to
ActivityHistory so the Analytics module can report on execution time and
status trends.

Function signatures and return shapes are unchanged from the previous
in-memory implementation, so routes and the frontend require no changes.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from extensions import db
from models.activity import Activity
from models.activity_history import ActivityHistory

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Valid values
# ---------------------------------------------------------------------------

VALID_STATUSES = {"idle", "pending", "running", "paused", "delayed", "scheduled", "completed", "failed"}
VALID_TYPES = {"flexible", "non-flexible"}
VALID_ACTIVITY_TYPES = {
    "file-upload", "cloud-backup", "software-update",
    "dataset-download", "ci-cd-pipeline", "batch-processing",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _aware(dt: datetime | None) -> datetime | None:
    """Ensure a database datetime is timezone-aware (UTC)."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# CRUD Operations
# ---------------------------------------------------------------------------


def create_activity(data: dict) -> tuple[dict | None, str | None]:
    """
    Create and persist a new activity.

    Args:
        data: Request body dict with required fields:
            name, type, duration, powerDraw
            and optional: activityType, priorityScore, flexibilityScore

    Returns:
        (task_dict, error_message) — one of them will be None
    """
    required = ["name", "type", "duration", "powerDraw"]
    missing = [f for f in required if f not in data or data[f] is None]
    if missing:
        return None, f"Missing required fields: {', '.join(missing)}"

    task_type = data["type"]
    if task_type not in VALID_TYPES:
        return None, f"Invalid type '{task_type}'. Must be one of: {sorted(VALID_TYPES)}"

    activity_type = data.get("activityType", "batch-processing")
    if activity_type not in VALID_ACTIVITY_TYPES:
        activity_type = "batch-processing"  # safe default

    try:
        duration = float(data["duration"])
        power_draw = float(data["powerDraw"])
    except (ValueError, TypeError):
        return None, "Fields 'duration' and 'powerDraw' must be numeric"

    if duration <= 0:
        return None, "Field 'duration' must be greater than 0"
    if power_draw <= 0:
        return None, "Field 'powerDraw' must be greater than 0"

    task_id = f"task-{datetime.now(timezone.utc).timestamp():.6f}"

    flexibility_score = data.get("flexibilityScore")
    if flexibility_score is None:
        flexibility_score = 70 if task_type == "flexible" else 0

    activity = Activity(
        id=task_id,
        name=str(data["name"]).strip(),
        type=task_type,
        activity_type=activity_type,
        duration=duration,
        power_draw=power_draw,
        priority_score=min(100, max(0, int(data.get("priorityScore", 50)))),
        flexibility_score=min(100, max(0, int(flexibility_score))),
        status="idle",
        progress=0.0,
        assigned_window_id=None,
    )

    try:
        db.session.add(activity)
        # Seed the history trail with the initial "idle" state.
        db.session.add(ActivityHistory(
            activity_id=task_id,
            previous_status=None,
            new_status="idle",
            execution_time=None,
        ))
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Failed to create activity")
        return None, "Failed to save activity to database"

    logger.info("Created activity %s: '%s'", task_id, activity.name)
    return activity.to_dict(), None


def list_activities(
    page: int = 1,
    page_size: int = 50,
    status_filter: str | None = None,
) -> dict:
    """
    List activities with optional filtering and pagination.

    Args:
        page: 1-based page number
        page_size: Items per page (max 200)
        status_filter: Optional status to filter by

    Returns:
        Paginated response dict
    """
    page = max(1, page)
    page_size = min(max(1, page_size), 200)

    query = Activity.query
    if status_filter:
        query = query.filter_by(status=status_filter)

    total = query.count()
    items = (
        query.order_by(Activity.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": [a.to_dict() for a in items],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasMore": (page - 1) * page_size + len(items) < total,
    }


def get_activity(task_id: str) -> dict | None:
    """Retrieve a single activity by ID. Returns None if not found."""
    activity = db.session.get(Activity, task_id)
    return activity.to_dict() if activity else None


def update_activity(task_id: str, updates: dict) -> tuple[dict | None, str | None]:
    """
    Update allowed fields on an existing activity.

    Allowed update fields: status, progress, assignedWindowId

    Every status change is logged to ActivityHistory with the time spent
    in the previous status, so Analytics can compute execution times.

    Returns:
        (updated_task, error_message)
    """
    activity = db.session.get(Activity, task_id)
    if not activity:
        return None, f"Activity '{task_id}' not found"

    previous_status = activity.status
    previous_updated_at = _aware(activity.updated_at)
    status_changed = False

    if "status" in updates:
        new_status = updates["status"]
        if new_status not in VALID_STATUSES:
            return None, f"Invalid status '{new_status}'. Valid: {sorted(VALID_STATUSES)}"
        status_changed = new_status != previous_status
        activity.status = new_status

    if "progress" in updates:
        try:
            progress = float(updates["progress"])
            activity.progress = max(0.0, min(100.0, progress))
        except (ValueError, TypeError):
            return None, "Field 'progress' must be numeric"

    if "assignedWindowId" in updates:
        activity.assigned_window_id = updates["assignedWindowId"]

    now = datetime.now(timezone.utc)
    activity.updated_at = now

    try:
        if status_changed:
            execution_time = (
                (now - previous_updated_at).total_seconds()
                if previous_updated_at else None
            )
            db.session.add(ActivityHistory(
                activity_id=activity.id,
                previous_status=previous_status,
                new_status=activity.status,
                execution_time=execution_time,
            ))
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Failed to update activity %s", task_id)
        return None, "Failed to save activity update"

    logger.debug("Updated activity %s: %s", task_id, updates)
    return activity.to_dict(), None


def delete_activity(task_id: str) -> tuple[bool, str | None]:
    """
    Delete an activity by ID (cascades its history rows).

    Returns:
        (success, error_message)
    """
    activity = db.session.get(Activity, task_id)
    if not activity:
        return False, f"Activity '{task_id}' not found"

    try:
        ActivityHistory.query.filter_by(activity_id=task_id).delete()
        db.session.delete(activity)
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Failed to delete activity %s", task_id)
        return False, "Failed to delete activity"

    logger.info("Deleted activity %s", task_id)
    return True, None


def bulk_update_activities(updates: list[dict]) -> list[dict]:
    """
    Apply status/progress updates to multiple activities at once.
    Used by the orchestrator to batch-update after scheduling.

    Args:
        updates: List of dicts with 'id' and update fields

    Returns:
        List of successfully updated tasks
    """
    updated: list[dict[str, Any]] = []
    for upd in updates:
        task_id = upd.get("id")
        if not task_id:
            continue
        fields = {k: v for k, v in upd.items() if k != "id"}
        task, _ = update_activity(task_id, fields)
        if task:
            updated.append(task)
    return updated
