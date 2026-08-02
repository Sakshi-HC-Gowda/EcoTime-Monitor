"""
Activity Service
================
Manages task/activity CRUD with real SQLite persistence via SQLAlchemy
(models.activity.Activity). Every status change is additionally logged to
ActivityHistory so the Analytics module can report on execution time and
status trends.

Function signatures and return shapes are unchanged from the previous
in-memory implementation, so routes and the frontend require no changes.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from extensions import db
from sqlalchemy.exc import IntegrityError
from models.activity import Activity
from models.activity_history import ActivityHistory
from models.workload_profile import WorkloadProfile
from models.current_status import CurrentStatus
from services.persistence_service import on_activity_created, on_activity_status_changed

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Valid values & lifecycle
# ---------------------------------------------------------------------------

VALID_STATUSES = {
    "draft", "idle", "pending", "scheduled", "waiting_for_device",
    "running", "paused", "delayed", "completed", "cancelled", "missed", "failed",
}
VALID_TYPES = {"flexible", "non-flexible"}
VALID_ACTIVITY_TYPES = {
    "file-upload", "cloud-backup", "software-update",
    "dataset-download", "ci-cd-pipeline", "batch-processing",
}

# Allowed transitions (empty set = terminal). Legacy statuses remain valid.
STATUS_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"pending", "idle", "cancelled", "failed"},
    "idle": {"pending", "scheduled", "running", "cancelled", "failed"},
    "pending": {"scheduled", "running", "waiting_for_device", "cancelled", "failed"},
    "scheduled": {"waiting_for_device", "running", "missed", "cancelled", "failed", "delayed"},
    "waiting_for_device": {"running", "missed", "cancelled", "failed"},
    "running": {"completed", "paused", "cancelled", "missed", "failed"},
    "paused": {"running", "cancelled", "failed"},
    "delayed": {"scheduled", "running", "cancelled", "failed"},
    "completed": set(),
    "cancelled": set(),
    "missed": set(),
    "failed": set(),
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _aware(dt: datetime | None) -> datetime | None:
    """Ensure a datetime read back from SQLite is timezone-aware (UTC)."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# Reference load used to normalise power draw into a 0-100 "CPU usage" estimate.
# There's no real OS-level monitor here, so this is a declared-workload proxy.
_CPU_REFERENCE_WATTS = 300.0

_NETWORK_ACTIVITY_TYPES = {"file-upload", "cloud-backup", "dataset-download"}
_CPU_ACTIVITY_TYPES = {"software-update", "ci-cd-pipeline"}


def _estimate_workload_profile(
    power_draw: float, flexibility_score: int, priority_score: int, activity_type: str
) -> dict:
    """
    Derive an estimated workload profile from the activity's declared
    characteristics (power draw, flexibility, priority, type).
    """
    cpu_usage = round(min(100.0, (power_draw / _CPU_REFERENCE_WATTS) * 100.0), 1)

    if cpu_usage < 33:
        workload_level = "low"
    elif cpu_usage < 66:
        workload_level = "medium"
    else:
        workload_level = "high"

    if activity_type in _NETWORK_ACTIVITY_TYPES:
        workload_category = "network-intensive"
    elif activity_type in _CPU_ACTIVITY_TYPES:
        workload_category = "cpu-intensive"
    else:
        workload_category = "mixed"

    # How confidently this workload can be shifted to a greener window:
    # more flexible + lower priority = higher shift-confidence.
    prediction_score = round(0.6 * flexibility_score + 0.4 * (100 - priority_score), 1)
    prediction_score = max(0.0, min(100.0, prediction_score))

    # Memory usage estimate: network-bound work (uploads/downloads/backups)
    # tends to be lighter on memory than CPU-bound/mixed batch work.
    if activity_type in _NETWORK_ACTIVITY_TYPES:
        memory_usage = round(min(100.0, cpu_usage * 0.5), 1)
    else:
        memory_usage = round(min(100.0, cpu_usage * 0.8), 1)

    return {
        "cpu_usage": cpu_usage,
        "memory_usage": memory_usage,
        "workload_level": workload_level,
        "prediction_score": prediction_score,
        "workload_category": workload_category,
    }


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

    name = str(data["name"]).strip()
    if not name:
        return None, "Field 'name' must not be empty"
    if len(name) > 255:
        return None, "Field 'name' must be 255 characters or fewer"

    try:
        duration = float(data["duration"])
        power_draw = float(data["powerDraw"])
    except (ValueError, TypeError):
        return None, "Fields 'duration' and 'powerDraw' must be numeric"

    if duration <= 0:
        return None, "Field 'duration' must be greater than 0"
    if power_draw <= 0:
        return None, "Field 'powerDraw' must be greater than 0"

    try:
        priority_score = int(data.get("priorityScore", 50))
    except (ValueError, TypeError):
        return None, "Field 'priorityScore' must be an integer"
    priority_score = min(100, max(0, priority_score))

    flexibility_score = data.get("flexibilityScore")
    if flexibility_score is None:
        flexibility_score = 70 if task_type == "flexible" else 0
    try:
        flexibility_score = int(flexibility_score)
    except (ValueError, TypeError):
        return None, "Field 'flexibilityScore' must be an integer"
    flexibility_score = min(100, max(0, flexibility_score))

    # UUID suffix guarantees uniqueness even under concurrent requests in the
    # same microsecond (threaded=True makes this a real, if rare, possibility —
    # a bare timestamp string is not collision-safe on its own).
    task_id = f"task-{datetime.now(timezone.utc).timestamp():.6f}-{uuid.uuid4().hex[:8]}"

    activity = Activity(
        id=task_id,
        name=name,
        type=task_type,
        activity_type=activity_type,
        category=activity_type,
        duration=duration,
        power_draw=power_draw,
        priority_score=priority_score,
        flexibility_score=flexibility_score,
        status="draft",
        progress=0.0,
        assigned_window_id=None,
    )

    try:
        db.session.add(activity)
        db.session.add(ActivityHistory(
            activity_id=task_id,
            previous_status=None,
            new_status="draft",
            execution_time=None,
        ))
        profile = _estimate_workload_profile(
            power_draw, activity.flexibility_score, activity.priority_score, activity_type
        )
        db.session.add(WorkloadProfile(
            activity_id=task_id,
            cpu_usage=profile["cpu_usage"],
            memory_usage=profile["memory_usage"],
            workload_level=profile["workload_level"],
            prediction_score=profile["prediction_score"],
            workload_category=profile["workload_category"],
        ))
        db.session.add(CurrentStatus(
            activity_id=task_id,
            current_status="draft",
        ))
        on_activity_created(activity)
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


def get_workload_profile(task_id: str) -> dict | None:
    """Retrieve the most recent workload profile for an activity."""
    profile = (
        WorkloadProfile.query.filter_by(activity_id=task_id)
        .order_by(WorkloadProfile.created_at.desc())
        .first()
    )
    return profile.to_dict() if profile else None


def get_current_status(task_id: str) -> dict | None:
    """Retrieve the dedicated CurrentStatus row for an activity."""
    row = CurrentStatus.query.filter_by(activity_id=task_id).first()
    return row.to_dict() if row else None


def _apply_activity_update(activity: Activity, updates: dict) -> str | None:
    """
    Apply status/progress/assignedWindowId changes to an already-fetched
    Activity, staging the ActivityHistory + CurrentStatus rows in the
    current session — but does NOT commit. Shared by update_activity()
    (single-item, commits immediately) and bulk_update_activities()
    (multi-item, commits once at the end so the whole batch is atomic).

    Returns an error message string, or None on success.
    """
    previous_status = activity.status
    previous_updated_at = _aware(activity.updated_at)
    status_changed = False

    if "status" in updates:
        new_status = updates["status"]
        if new_status not in VALID_STATUSES:
            return f"Invalid status '{new_status}'. Valid: {sorted(VALID_STATUSES)}"
        allowed = STATUS_TRANSITIONS.get(previous_status, VALID_STATUSES)
        if new_status != previous_status and new_status not in allowed:
            return (
                f"Invalid transition '{previous_status}' → '{new_status}'. "
                f"Allowed: {sorted(allowed)}"
            )
        status_changed = new_status != previous_status
        activity.status = new_status

    if "progress" in updates:
        try:
            progress = float(updates["progress"])
        except (ValueError, TypeError):
            return "Field 'progress' must be numeric"
        activity.progress = max(0.0, min(100.0, progress))

    if "assignedWindowId" in updates:
        activity.assigned_window_id = updates["assignedWindowId"]

    now = datetime.now(timezone.utc)
    activity.updated_at = now

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
        # Keep the dedicated CurrentStatus row in sync — single write
        # path, same transaction, so it can never drift from Activity.status.
        current_status_row = CurrentStatus.query.filter_by(activity_id=activity.id).first()
        if current_status_row:
            current_status_row.current_status = activity.status
            current_status_row.last_updated = now
        else:
            db.session.add(CurrentStatus(
                activity_id=activity.id,
                current_status=activity.status,
                last_updated=now,
            ))
        missed = activity.status == "missed" or (
            activity.status in {"failed", "cancelled"} and previous_status in {"scheduled", "waiting_for_device"}
        )
        on_activity_status_changed(activity, previous_status, missed_schedule=missed)

    return None


def update_activity(task_id: str, updates: dict) -> tuple[dict | None, str | None]:
    """
    Update allowed fields on a single existing activity, committed
    immediately as its own transaction.

    Allowed update fields: status, progress, assignedWindowId

    Every status change is logged to ActivityHistory with the time spent
    in the previous status, so Analytics can compute execution times.

    Returns:
        (updated_task, error_message)
    """
    activity = db.session.get(Activity, task_id)
    if not activity:
        return None, f"Activity '{task_id}' not found"

    error = _apply_activity_update(activity, updates)
    if error:
        db.session.rollback()
        return None, error

    try:
        db.session.commit()
    except IntegrityError:
        # Rare race window: two concurrent requests both saw no CurrentStatus
        # row (only possible for legacy activities predating that table) and
        # both tried to INSERT — the unique constraint caught it. Retry once
        # as a clean update against the row the other request just created.
        db.session.rollback()
        logger.warning("CurrentStatus race detected for %s — retrying as update", task_id)
        activity = db.session.get(Activity, task_id)
        existing_status = CurrentStatus.query.filter_by(activity_id=task_id).first()
        if activity and existing_status:
            existing_status.current_status = activity.status
            existing_status.last_updated = datetime.now(timezone.utc)
            try:
                db.session.commit()
            except Exception:
                db.session.rollback()
                logger.exception("Retry failed for activity %s", task_id)
                return None, "Failed to save activity update after retry"
        else:
            return None, "Failed to save activity update"
    except Exception:
        db.session.rollback()
        logger.exception("Failed to update activity %s", task_id)
        return None, "Failed to save activity update"

    logger.debug("Updated activity %s: %s", task_id, updates)
    return activity.to_dict(), None


def delete_activity(task_id: str) -> tuple[bool, str | None]:
    """
    Delete an activity by ID.

    Relies on ORM-level cascade="all, delete-orphan" (defined on the
    Activity.history, Activity.workload_profiles, Activity.recommendations,
    and Activity.carbon_snapshots relationships) to clean up every
    dependent row in the same transaction — no manual per-table deletes.

    Returns:
        (success, error_message)
    """
    activity = db.session.get(Activity, task_id)
    if not activity:
        return False, f"Activity '{task_id}' not found"

    try:
        db.session.delete(activity)
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Failed to delete activity %s", task_id)
        return False, "Failed to delete activity"

    logger.info("Deleted activity %s", task_id)
    return True, None


def bulk_update_activities(updates: list[dict]) -> tuple[list[dict], str | None]:
    """
    Apply status/progress updates to multiple activities as ONE atomic
    transaction. If any item fails validation or references a missing
    activity, the entire batch is rolled back — no partial writes.
    Used by the orchestrator to batch-update after scheduling.

    Args:
        updates: List of dicts with 'id' and update fields

    Returns:
        (updated_tasks, error_message) — on error, updated_tasks is []
        and nothing was committed.
    """
    touched: list[Activity] = []

    for upd in updates:
        task_id = upd.get("id")
        if not task_id:
            db.session.rollback()
            return [], "Every bulk update item must include an 'id'"

        activity = db.session.get(Activity, task_id)
        if not activity:
            db.session.rollback()
            return [], f"Activity '{task_id}' not found — batch rolled back, no changes applied"

        fields = {k: v for k, v in upd.items() if k != "id"}
        error = _apply_activity_update(activity, fields)
        if error:
            db.session.rollback()
            return [], f"Invalid update for activity '{task_id}': {error} — batch rolled back"

        touched.append(activity)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Failed to commit bulk activity update")
        return [], "Failed to save bulk update — batch rolled back"

    return [a.to_dict() for a in touched], None
