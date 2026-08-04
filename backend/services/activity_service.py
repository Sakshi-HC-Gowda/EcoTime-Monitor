"""
Activity Service
================
Manages task/activity CRUD with SQLite persistence via SQLAlchemy.

Falls back to in-memory store if the database is not initialised yet,
so routes work correctly even during startup.
"""

from __future__ import annotations

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from optimization.window_ranking import rank_windows
from services.carbon_service import detect_green_windows, get_carbon_data

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

DEFAULT_ZONE = os.getenv("DEFAULT_ZONE", "US-CA")
DEFAULT_GREEN_THRESHOLD = float(os.getenv("LOW_CARBON_THRESHOLD", "180"))

# ---------------------------------------------------------------------------
# CRUD Operations
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

WORKLOAD_PROFILES = {
    "Model Training": {"power": 450, "priority": 40, "flexibility": 90},
    "Dataset Download": {"power": 200, "priority": 20, "flexibility": 95},
    "Software Update": {"power": 80, "priority": 30, "flexibility": 100},
    "Video Rendering": {"power": 350, "priority": 50, "flexibility": 85},
    "Cloud Backup": {"power": 120, "priority": 20, "flexibility": 100},
}

def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def _compute_derived_fields(data: dict[str, Any], created_at: str) -> dict[str, Any]:
    duration = float(data["duration"])
    power_draw = float(data["powerDraw"])
    priority = min(100, max(0, int(data.get("priorityScore", 50))))
    flexibility = min(100, max(0, int(data.get("flexibilityScore", 70))))

    estimated_energy = round((power_draw * duration) / 60000.0, 3)
    estimated_carbon_impact = round(estimated_energy * 180.0, 1)

    energy_penalty = min(100.0, (power_draw * duration) / 900.0)
    eco_score = round(max(0.0, min(100.0, 100.0 - (energy_penalty * 0.5) + (flexibility * 0.3) + ((100 - priority) * 0.2))), 1)

    created_dt = _parse_iso(created_at) or datetime.now(timezone.utc)
    recommended_start_dt = created_dt

    if priority >= 80:
        recommendation = "Run now"
    elif flexibility >= 60:
        recommendation = "Schedule for green window"
        recommended_start_iso = _find_recommended_start_time(duration)
        if recommended_start_iso:
            recommended_start_dt = _parse_iso(recommended_start_iso) or created_dt
        else:
            recommended_start_dt = created_dt.replace(microsecond=0) + timedelta(minutes=30)
    else:
        recommendation = "Run now"

    return {
        "estimatedEnergyConsumption": estimated_energy,
        "estimatedCarbonImpact": estimated_carbon_impact,
        "ecoScore": eco_score,
        "recommendation": recommendation,
        "recommendedStartTime": recommended_start_dt.isoformat(),
    }


def _find_recommended_start_time(duration_minutes: float) -> str | None:
    """Pick the best future green-window start time for the task duration."""
    try:
        carbon = get_carbon_data(zone_id=DEFAULT_ZONE, offset_hours=0)
        raw_windows = detect_green_windows(
            forecast=carbon.get("forecast", []),
            current_datetime=carbon["current"]["datetime"],
            threshold=DEFAULT_GREEN_THRESHOLD,
        )
        ranked_windows = rank_windows(raw_windows)

        fitting_window = next(
            (window for window in ranked_windows if float(window.get("duration", 0)) >= duration_minutes),
            ranked_windows[0] if ranked_windows else None,
        )
        if fitting_window:
            return fitting_window.get("startTime")
    except Exception as exc:
        logger.warning("Falling back to simple recommendation because green-window lookup failed: %s", exc)

    return None


def _apply_time_transitions(task: dict[str, Any]) -> None:
    """Advance scheduled/running tasks based on clock time and duration."""
    now = datetime.now(timezone.utc)
    changed = False

    if task.get("status") == "scheduled":
        scheduled_start = _parse_iso(task.get("scheduledStartTime") or task.get("recommendedStartTime"))
        if scheduled_start and scheduled_start <= now:
            task["status"] = "running"
            task["executionStartTime"] = now.isoformat()
            changed = True

    if task.get("status") == "running":
        execution_start = _parse_iso(task.get("executionStartTime"))
        if execution_start:
            elapsed_minutes = max(0.0, (now - execution_start).total_seconds() / 60.0)
            duration_minutes = max(0.1, float(task.get("duration") or 1.0))
            progress = min(100.0, (elapsed_minutes / duration_minutes) * 100.0)
            task["progress"] = round(progress, 1)
            changed = True

            if progress >= 100.0:
                task["status"] = "completed"
                task["progress"] = 100.0
                changed = True

    if changed:
        task["updatedAt"] = now.isoformat()

def create_activity(data: dict) -> tuple[dict | None, str | None]:
    """
    Create and persist a new activity.

    Args:
       data: Request body dict with required fields:
           name, type, duration

        Power draw, priority score, and flexibility score
        are assigned automatically using workload profiles.
    Returns:
        (task_dict, error_message) — one of them will be None
    """
    # Validate required fields
    required = ["name", "type", "duration"]
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
    except (ValueError, TypeError):
        return None, "Fields duration must be numeric"
    

    if duration <= 0:
        return None, "Field duration must be greater than 0"

    activity_name = data["name"].strip()

    profile = WORKLOAD_PROFILES.get(activity_name)

    if profile:
        power_draw = float(profile.get("power", 150))
        priority_score = min(100, max(0, int(profile.get("priority", 30))))
        flexibility_score = min(100, max(0, int(profile.get("flexibility", 80))))
    else:
        power_draw = 150.0
        priority_score = 30
        flexibility_score = 80

    task_id = f"task-{datetime.now(timezone.utc).timestamp():.6f}"
    now = _now_iso()

    

    task: dict[str, Any] = {
        "id": task_id,
        "name": str(data["name"]).strip(),
        "type": task_type,
        "activityType": activity_type,
        "duration": duration,
        "powerDraw": power_draw,
        "priorityScore": min(100, max(0, int(priority_score))),
        "flexibilityScore": min(100, max(0, int(flexibility_score))),
        "status": "pending",
        "progress": 0,
        "assignedWindowId": None,
        "scheduledStartTime": None,
        "executionStartTime": None,
        "createdAt": now,
        "updatedAt": now,
    }

    task.update(_compute_derived_fields(task, now))

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

    for task in items:
        _apply_time_transitions(task)

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
    task = _store.get(task_id)
    if task:
        _apply_time_transitions(task)
    return task


def update_activity(task_id: str, updates: dict) -> tuple[dict | None, str | None]:
    """
    Update allowed fields on an existing activity.

    Allowed update fields: status, progress, assignedWindowId, scheduledStartTime

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

        if new_status == "pending":
            task["progress"] = 0.0
            task["executionStartTime"] = None

        if new_status == "scheduled":
            scheduled_time = updates.get("scheduledStartTime") or task.get("recommendedStartTime") or _now_iso()
            task["scheduledStartTime"] = scheduled_time
            task["executionStartTime"] = None

        if new_status == "running":
            task["executionStartTime"] = _now_iso()

        if new_status == "completed":
            task["progress"] = 100.0

    if "progress" in updates:
        try:
            progress = float(updates["progress"])
            task["progress"] = max(0.0, min(100.0, progress))
        except (ValueError, TypeError):
            return None, "Field 'progress' must be numeric"

    if "assignedWindowId" in updates:
        task["assignedWindowId"] = updates["assignedWindowId"]

    if "scheduledStartTime" in updates:
        task["scheduledStartTime"] = updates["scheduledStartTime"]

    _apply_time_transitions(task)

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
