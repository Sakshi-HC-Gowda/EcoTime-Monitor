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
import math
from datetime import datetime, timedelta, timezone
from typing import Any

from extensions import db
from models.activity import Activity
from models.activity_history import ActivityHistory
from models.user import User
from optimization.carbon_calculator import (
    calculate_emissions_comparison,
    calculate_emissions_grams,
    calculate_energy_kwh,
    calculate_reduction_percent,
)
from optimization.eco_score import calculate_carbon_score, calculate_eco_score

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

# Workload-class assumptions are estimates, not metered device power.
DEFAULT_POWER_WATTS_BY_ACTIVITY_TYPE = {
    "file-upload": 120.0,
    "cloud-backup": 120.0,
    "software-update": 80.0,
    "dataset-download": 200.0,
    "ci-cd-pipeline": 450.0,
    "batch-processing": 350.0,
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _calculate_energy_kwh(power_watts: float, duration_minutes: float) -> float:
    """Calculate energy consumption in kWh from power draw (W) and duration (minutes)."""
    return calculate_energy_kwh(power_watts, duration_minutes)


def _calculate_carbon_grams(energy_kwh: float, intensity_g_per_kwh: float) -> float:
    """Calculate carbon emissions in grams CO2e from energy (kWh) and grid intensity (g/kWh)."""
    return calculate_emissions_grams(energy_kwh, intensity_g_per_kwh)


def _calculate_savings(
    energy_kwh: float, baseline_intensity: float, optimized_intensity: float
) -> dict[str, float]:
    """Calculate carbon baseline, optimized impact, and carbon savings."""
    comparison = calculate_emissions_comparison(
        energy_kwh, baseline_intensity, optimized_intensity
    )
    baseline = comparison["baselineEmissionsGrams"]
    optimized = comparison["recommendedEmissionsGrams"]
    savings = comparison["savingsGrams"]
    return {
        "baselineCarbonImpact": baseline,
        "optimizedCarbonImpact": optimized,
        "carbonSavings": savings,
        "carbonSavingsPercent": calculate_reduction_percent(savings, baseline),
    }


WORKLOAD_PROFILES = {
    "Model Training": {"power": 450, "priority": 40, "flexibility": 90},
    "Dataset Download": {"power": 200, "priority": 20, "flexibility": 95},
    "Software Update": {"power": 80, "priority": 30, "flexibility": 100},
    "Video Rendering": {"power": 350, "priority": 50, "flexibility": 85},
    "Cloud Backup": {"power": 120, "priority": 20, "flexibility": 100},
}

def _parse_iso(value: str | None) -> datetime | None:
    if not isinstance(value, str) or not value:
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

    estimated_energy = calculate_energy_kwh(power_draw, duration)
    current_intensity = data.get("currentCarbonIntensity")
    eco_score = None
    estimated_carbon_impact = None
    recommendation = "Use optimizer for a recommendation"
    if current_intensity is not None:
        carbon_score = calculate_carbon_score(
            current_intensity,
            data.get("baselineCarbonIntensity", 380.0),
            data.get("peakCarbonIntensity", 800.0),
        )
        eco_score = calculate_eco_score(carbon_score, flexibility, priority)
        estimated_carbon_impact = calculate_emissions_grams(
            estimated_energy, current_intensity
        )

    created_dt = _parse_iso(created_at) or datetime.now(timezone.utc)
    recommended_start_dt: datetime | None = created_dt

    if priority >= 80:
        recommendation = "Run now"
    elif flexibility >= 60:
        recommendation = "Run optimizer to check for a feasible Green Window"
        recommended_start_dt = None
    else:
        recommendation = "Run now"

    derived = {
        "estimatedEnergyConsumption": estimated_energy,
        "estimatedEnergyUnit": "kWh",
        "estimatedEnergyBasis": "estimated_power_watts_times_estimated_duration_minutes",
        "recommendation": recommendation,
        "recommendedStartTime": (
            recommended_start_dt.isoformat() if recommended_start_dt else None
        ),
    }
    if estimated_carbon_impact is not None:
        derived["estimatedCarbonImpact"] = estimated_carbon_impact
        derived["carbonImpactUnit"] = "gCO2e"
        derived["carbonImpactBasis"] = (
            "estimated_from_assumed_power_and_estimated_duration"
        )
        derived["carbonIntensityUsed"] = float(current_intensity)
        derived["carbonIntensityUnit"] = "gCO2e/kWh"
        derived["carbonIntensitySource"] = data.get("carbonDataSource", "provided")
    if eco_score is not None:
        derived["ecoScore"] = eco_score
    return derived


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


def create_activity(
    data: dict,
    authenticated_user: User,
    idempotency_key: str | None = None,
    request_fingerprint: str | None = None,
) -> tuple[dict | None, str | None, bool]:
    """
    Create and persist a new activity.

    Args:
       data: Request body dict with required fields:
           name, type, duration, powerDraw

        Priority and flexibility can be supplied by the caller. If they are
        omitted, workload profiles provide sensible defaults.
    Returns:
        (task_dict, error_message, replayed)
    """
    if not isinstance(data, dict):
        return None, "Request body must be a JSON object", False
    required = ["name", "type", "duration"]
    missing = [f for f in required if f not in data or data[f] is None]
    if missing:
        return None, f"Missing required fields: {', '.join(missing)}", False

    task_type = data["type"]
    if not isinstance(task_type, str) or task_type not in VALID_TYPES:
        return None, f"Invalid type '{task_type}'. Must be one of: {sorted(VALID_TYPES)}", False

    activity_type = data.get("activityType", "batch-processing")
    if not isinstance(activity_type, str) or activity_type not in VALID_ACTIVITY_TYPES:
        return None, f"Invalid activityType '{activity_type}'. Must be one of: {sorted(VALID_ACTIVITY_TYPES)}", False

    if isinstance(data["duration"], bool):
        return None, "Field duration must be a finite number greater than 0 minutes", False
    try:
        duration = float(data["duration"])
    except (ValueError, TypeError):
        return None, "Field duration must be a finite number greater than 0 minutes", False
    raw_power_draw = data.get("powerDraw")
    if raw_power_draw is None:
        power_draw = DEFAULT_POWER_WATTS_BY_ACTIVITY_TYPE[activity_type]
    elif isinstance(raw_power_draw, bool):
        return None, "Field powerDraw must be a non-negative finite number of watts", False
    else:
        try:
            power_draw = float(raw_power_draw)
        except (ValueError, TypeError):
            return None, "Field powerDraw must be a non-negative finite number of watts", False

    if not math.isfinite(duration) or duration <= 0:
        return None, "Field duration must be a finite number greater than 0 minutes", False
    if not math.isfinite(power_draw) or power_draw < 0:
        return None, "Field powerDraw must be a non-negative finite number of watts", False
    try:
        calculate_energy_kwh(power_draw, duration)
    except ValueError as exc:
        return None, str(exc), False

    if not isinstance(data["name"], str) or not data["name"].strip():
        return None, "Field name must be a non-empty string", False
    activity_name = data["name"].strip()
    if len(activity_name) > 255:
        return None, "Field name must be 255 characters or fewer", False

    profile = WORKLOAD_PROFILES.get(activity_name)

    if profile:
        priority_default = profile.get("priority", 30)
        flexibility_default = profile.get("flexibility", 80)
    else:
        priority_default = 30
        flexibility_default = 80

    def parse_score(field: str, default: int) -> tuple[int | None, str | None]:
        value = data.get(field, default)
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
            or not 0 <= value <= 100
            or not float(value).is_integer()
        ):
            return None, f"Field {field} must be a finite integer from 0 to 100"
        return int(value), None

    priority_score, score_error = parse_score("priorityScore", priority_default)
    if score_error:
        return None, score_error, False
    flexibility_score, score_error = parse_score("flexibilityScore", flexibility_default)
    if score_error:
        return None, score_error, False

    earliest_start_value = data.get("earliestStart")
    deadline_value = data.get("deadline")
    earliest_start = _parse_iso(earliest_start_value) if earliest_start_value else None
    deadline = _parse_iso(deadline_value) if deadline_value else None
    if earliest_start_value not in (None, "") and earliest_start is None:
        return None, "Field earliestStart must be a valid ISO timestamp", False
    if deadline_value not in (None, "") and deadline is None:
        return None, "Field deadline must be a valid ISO timestamp", False
    if earliest_start and deadline and earliest_start >= deadline:
        return None, "Field deadline must be later than earliestStart", False

    if idempotency_key:
        try:
            existing = Activity.query.filter_by(
                organization_id=authenticated_user.organization_id,
                idempotency_key=idempotency_key,
            ).first()
        except Exception:
            db.session.rollback()
            logger.exception("Could not verify activity idempotency key")
            return None, "Could not verify the activity request; retry safely", False
        if existing:
            if existing.request_fingerprint != request_fingerprint:
                return None, "Idempotency-Key was already used for a different activity request", False
            return existing.to_dict(), None, True

    task_id = f"task-{datetime.now(timezone.utc).timestamp():.6f}"

    activity = Activity(
        id=task_id,
        organization_id=authenticated_user.organization_id,
        idempotency_key=idempotency_key,
        request_fingerprint=request_fingerprint,
        name=activity_name,
        type=task_type,
        activity_type=activity_type,
        duration=duration,
        power_draw=power_draw,
        priority_score=priority_score,
        flexibility_score=flexibility_score,
        status="idle",
        progress=0.0,
        assigned_window_id=None,
        earliest_start=earliest_start,
        deadline=deadline,
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
    except Exception as exc:
        db.session.rollback()
        if idempotency_key:
            try:
                existing = Activity.query.filter_by(
                    organization_id=authenticated_user.organization_id,
                    idempotency_key=idempotency_key,
                ).first()
            except Exception:
                logger.exception("Could not resolve activity idempotency race")
                existing = None
            if existing and existing.request_fingerprint == request_fingerprint:
                return existing.to_dict(), None, True
            if existing:
                return None, "Idempotency-Key was already used for a different activity request", False
        logger.exception("Failed to create activity")
        return None, "Could not persist the activity", False

    logger.info("Created activity %s: '%s'", task_id, activity.name)
    return activity.to_dict(), None, False


def list_activities(
    organization_id: int,
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

    query = Activity.query.filter_by(organization_id=organization_id)
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


def get_activity(task_id: str, organization_id: int) -> dict | None:
    """Retrieve a single activity by ID. Returns None if not found."""
    activity = Activity.query.filter_by(
        id=task_id,
        organization_id=organization_id,
    ).first()
    return activity.to_dict() if activity else None


def update_activity(
    task_id: str,
    updates: dict,
    organization_id: int,
    *,
    commit: bool = True,
) -> tuple[dict | None, str | None]:
    """
    Update allowed fields on an existing activity.

    Allowed update fields: status, progress, assignedWindowId, earliestStart, deadline.
    Scheduling and execution state changes are controlled by their owning workflows.

    Every status change is logged to ActivityHistory with the time spent
    in the previous status, so Analytics can compute execution times.

    Returns:
        (updated_task, error_message)
    """
    if not isinstance(updates, dict):
        return None, "Request body must be a JSON object"
    activity = Activity.query.filter_by(
        id=task_id,
        organization_id=organization_id,
    ).first()
    if not activity:
        return None, f"Activity '{task_id}' not found"

    earliest_start = _aware(activity.earliest_start)
    deadline = _aware(activity.deadline)
    if "earliestStart" in updates:
        earliest_start = _parse_iso(updates["earliestStart"])
        if updates["earliestStart"] not in (None, "") and earliest_start is None:
            return None, "Field earliestStart must be a valid ISO timestamp"
    if "deadline" in updates:
        deadline = _parse_iso(updates["deadline"])
        if updates["deadline"] not in (None, "") and deadline is None:
            return None, "Field deadline must be a valid ISO timestamp"
    if earliest_start and deadline and earliest_start >= deadline:
        return None, "Field deadline must be later than earliestStart"
    if activity.status == "scheduled" and (
        "earliestStart" in updates or "deadline" in updates
    ):
        return None, "Scheduling bounds cannot change while an activity is scheduled"

    new_status = updates.get("status", activity.status)
    if not isinstance(new_status, str) or new_status not in VALID_STATUSES:
        return None, f"Invalid status '{new_status}'. Valid: {sorted(VALID_STATUSES)}"
    if new_status in {"scheduled", "delayed"}:
        return None, "Activities can be scheduled or delayed only by a feasible optimizer recommendation"
    if new_status in {"running", "failed"}:
        return None, "Execution statuses are updated only by a supported workload executor"
    if activity.activity_type == "file-upload" and "status" in updates:
        return None, (
            "File upload status is changed only through the upload workflow; "
            "completion must use the upload executor"
        )

    progress = None
    if "progress" in updates:
        value = updates["progress"]
        if isinstance(value, bool):
            return None, "Field 'progress' must be a finite number from 0 to 100"
        try:
            progress = float(value)
        except (ValueError, TypeError):
            return None, "Field 'progress' must be a finite number from 0 to 100"
        if not math.isfinite(progress) or not 0 <= progress <= 100:
            return None, "Field 'progress' must be a finite number from 0 to 100"

    if "assignedWindowId" in updates and updates["assignedWindowId"] is not None:
        return None, "Window assignments can be set only by a feasible optimizer recommendation"
    if "scheduledStartTime" in updates:
        return None, "Scheduled start times can be set only by a feasible optimizer recommendation"

    previous_status = activity.status
    previous_updated_at = _aware(activity.updated_at)
    status_changed = False

    # ---------------------------------------------------------------
    # Status
    # ---------------------------------------------------------------
    if "status" in updates:
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
    if progress is not None:
        activity.progress = progress

    # ---------------------------------------------------------------
    # Assigned green window
    # ---------------------------------------------------------------
    if "assignedWindowId" in updates:
        activity.assigned_window_id = updates["assignedWindowId"]

    activity.earliest_start = earliest_start
    activity.deadline = deadline

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

        if commit:
            db.session.commit()

    except Exception:
        db.session.rollback()
        logger.exception("Failed to update activity %s", task_id)
        return None, "Failed to save activity update"

    logger.debug("Updated activity %s: %s", task_id, updates)

    return activity.to_dict(), None


def delete_activity(task_id: str, organization_id: int) -> tuple[bool, str | None]:
    """
    Delete an activity by ID (cascades its history rows).

    Returns:
        (success, error_message)
    """
    activity = Activity.query.filter_by(
        id=task_id,
        organization_id=organization_id,
    ).first()
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


def bulk_update_activities(
    updates: list[dict],
    organization_id: int,
) -> tuple[list[dict] | None, str | None]:
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
        task_id = upd["id"]
        fields = {k: v for k, v in upd.items() if k != "id"}
        task, error = update_activity(
            task_id,
            fields,
            organization_id,
            commit=False,
        )
        if error:
            db.session.rollback()
            return None, error
        if task is None:
            db.session.rollback()
            return None, f"Activity '{task_id}' not found"
        updated.append(task)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Failed to persist bulk activity update")
        return None, "Could not persist the bulk activity update"
    return updated, None
