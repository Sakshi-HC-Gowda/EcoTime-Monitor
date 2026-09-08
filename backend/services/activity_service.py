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

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from extensions import db
from models.activity import Activity
from models.activity_history import ActivityHistory
from optimization.window_ranking import rank_windows
from services.carbon_service import detect_green_windows, get_carbon_data

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-Memory Store (active until DB is wired up; also used as write-through cache)
# ---------------------------------------------------------------------------

_store: dict[str, dict[str, Any]] = {}

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

DEFAULT_ZONE = os.getenv("DEFAULT_ZONE", "US-CA")
DEFAULT_GREEN_THRESHOLD = float(os.getenv("LOW_CARBON_THRESHOLD", "180"))

# ---------------------------------------------------------------------------
# Helpers
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

        Priority and flexibility can be supplied by the caller. If they are
        omitted, workload profiles provide sensible defaults.
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
        return None, "Fields duration and powerDraw must be numeric"
    

    if duration <= 0:
        return None, "Field duration must be greater than 0"
    if power_draw <= 0:
        return None, "Field powerDraw must be greater than 0"

    activity_name = data["name"].strip()

    profile = WORKLOAD_PROFILES.get(activity_name)

    if profile:
        priority_default = profile.get("priority", 30)
        flexibility_default = profile.get("flexibility", 80)
    else:
        priority_default = 30
        flexibility_default = 80

    try:
        priority_score = min(100, max(0, int(data.get("priorityScore", priority_default))))
        flexibility_score = min(100, max(0, int(data.get("flexibilityScore", flexibility_default))))
    except (ValueError, TypeError):
        return None, "Fields priorityScore and flexibilityScore must be numeric"

    task_id = f"task-{datetime.now(timezone.utc).timestamp():.6f}"

    

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

    Allowed update fields: status, progress, assignedWindowId, scheduledStartTime

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

    # ---------------------------------------------------------------
    # Status
    # ---------------------------------------------------------------
    if "status" in updates:
        new_status = updates["status"]

        if new_status not in VALID_STATUSES:
            return None, (
                f"Invalid status '{new_status}'. "
                f"Valid: {sorted(VALID_STATUSES)}"
            )

        status_changed = new_status != previous_status
        activity.status = new_status

        if new_status == "pending":
            activity.progress = 0.0

        elif new_status == "completed":
            activity.progress = 100.0

        elif new_status == "running":
            # Progress remains unchanged when execution starts.
            pass

    # ---------------------------------------------------------------
    # Progress
    # ---------------------------------------------------------------
    if "progress" in updates:
        try:
            progress = float(updates["progress"])
            activity.progress = max(0.0, min(100.0, progress))
        except (ValueError, TypeError):
            return None, "Field 'progress' must be numeric"

    # ---------------------------------------------------------------
    # Assigned green window
    # ---------------------------------------------------------------
    if "assignedWindowId" in updates:
        activity.assigned_window_id = updates["assignedWindowId"]

    # ---------------------------------------------------------------
    # Scheduled start time
    # ---------------------------------------------------------------
    if "scheduledStartTime" in updates:
        scheduled_start_time = updates["scheduledStartTime"]

        # Use the database field if the Activity model provides it.
        if hasattr(activity, "scheduled_start_time"):
            activity.scheduled_start_time = scheduled_start_time

    # ---------------------------------------------------------------
    # Updated timestamp
    # ---------------------------------------------------------------
    now = datetime.now(timezone.utc)
    activity.updated_at = now

    # ---------------------------------------------------------------
    # Activity history
    # ---------------------------------------------------------------
    try:
        if status_changed:
            execution_time = (
                (now - previous_updated_at).total_seconds()
                if previous_updated_at
                else None
            )

            db.session.add(
                ActivityHistory(
                    activity_id=activity.id,
                    previous_status=previous_status,
                    new_status=activity.status,
                    execution_time=execution_time,
                )
            )

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
