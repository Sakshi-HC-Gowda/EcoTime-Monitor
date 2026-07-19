"""
Activity Service
================
Manages task/activity CRUD with SQLite persistence via SQLAlchemy.

Falls back to in-memory store if the database is not initialised yet,
so routes work correctly even during startup.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-Memory Store (active until DB is wired up; also used as write-through cache)
# ---------------------------------------------------------------------------

_store: dict[str, dict[str, Any]] = {}


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
# CRUD Operations
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    # Validate required fields
    required = ["name", "type", "duration", "powerDraw"]
    missing = [f for f in required if f not in data or data[f] is None]
    if missing:
        return None, f"Missing required fields: {', '.join(missing)}"

    # Validate type values
    task_type = data["type"]
    if task_type not in VALID_TYPES:
        return None, f"Invalid type '{task_type}'. Must be one of: {sorted(VALID_TYPES)}"

    activity_type = data.get("activityType", "batch-processing")
    if activity_type not in VALID_ACTIVITY_TYPES:
        activity_type = "batch-processing"  # safe default

    # Validate numeric fields
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
    now = _now_iso()

    flexibility_score = data.get("flexibilityScore")
    if flexibility_score is None:
        flexibility_score = 70 if task_type == "flexible" else 0

    task: dict[str, Any] = {
        "id": task_id,
        "name": str(data["name"]).strip(),
        "type": task_type,
        "activityType": activity_type,
        "duration": duration,
        "powerDraw": power_draw,
        "priorityScore": min(100, max(0, int(data.get("priorityScore", 50)))),
        "flexibilityScore": min(100, max(0, int(flexibility_score))),
        "status": "idle",
        "progress": 0,
        "assignedWindowId": None,
        "createdAt": now,
        "updatedAt": now,
    }

    _store[task_id] = task
    logger.info("Created activity %s: '%s'", task_id, task["name"])

    # TODO Phase D: persist to DB with Activity model
    # db_task = Activity(**task)
    # db.session.add(db_task)
    # db.session.commit()

    return task, None


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
    page_size = min(page_size, 200)
    items = list(_store.values())

    if status_filter:
        items = [t for t in items if t.get("status") == status_filter]

    # Sort by createdAt descending (newest first)
    items.sort(key=lambda t: t.get("createdAt", ""), reverse=True)

    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size

    return {
        "items": items[start:end],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasMore": end < total,
    }


def get_activity(task_id: str) -> dict | None:
    """Retrieve a single activity by ID. Returns None if not found."""
    # TODO Phase D: db.session.get(Activity, task_id)
    return _store.get(task_id)


def update_activity(task_id: str, updates: dict) -> tuple[dict | None, str | None]:
    """
    Update allowed fields on an existing activity.

    Allowed update fields: status, progress, assignedWindowId

    Returns:
        (updated_task, error_message)
    """
    task = _store.get(task_id)
    if not task:
        return None, f"Activity '{task_id}' not found"

    if "status" in updates:
        new_status = updates["status"]
        if new_status not in VALID_STATUSES:
            return None, f"Invalid status '{new_status}'. Valid: {sorted(VALID_STATUSES)}"
        task["status"] = new_status

    if "progress" in updates:
        try:
            progress = float(updates["progress"])
            task["progress"] = max(0.0, min(100.0, progress))
        except (ValueError, TypeError):
            return None, "Field 'progress' must be numeric"

    if "assignedWindowId" in updates:
        task["assignedWindowId"] = updates["assignedWindowId"]

    task["updatedAt"] = _now_iso()

    logger.debug("Updated activity %s: %s", task_id, updates)
    # TODO Phase D: db.session.commit()

    return task, None


def delete_activity(task_id: str) -> tuple[bool, str | None]:
    """
    Delete an activity by ID.

    Returns:
        (success, error_message)
    """
    if task_id not in _store:
        return False, f"Activity '{task_id}' not found"

    del _store[task_id]
    logger.info("Deleted activity %s", task_id)
    # TODO Phase D: db.session.delete(db_task); db.session.commit()
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
    updated = []
    for upd in updates:
        task_id = upd.pop("id", None)
        if task_id:
            task, _ = update_activity(task_id, upd)
            if task:
                updated.append(task)
    return updated
