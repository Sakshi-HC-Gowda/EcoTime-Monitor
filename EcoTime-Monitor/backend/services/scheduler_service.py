"""
Scheduler Service
================
Provides PostgreSQL-backed scheduling operations and scheduler snapshots for the
frontend Scheduler page.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from extensions import db
from models.activity import Activity
from models.current_status import CurrentStatus
from models.recommendation import Recommendation
from models.schedule_slot import ScheduleSlot
from services.persistence_service import on_activity_status_changed, persist_schedule_slot

logger = logging.getLogger(__name__)

VALID_ACTIONS = {
    "schedule",
    "reschedule",
    "start",
    "pause",
    "resume",
    "complete",
    "cancel",
    "missed",
    "delete",
}

TERMINAL_STATUSES = {"completed", "cancelled", "missed"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        if not text:
            return None
        try:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            try:
                dt = datetime.fromisoformat(text)
            except ValueError:
                return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _coerce_status(status: Any) -> str | None:
    if status is None:
        return None
    text = str(status).strip().lower()
    return text or None


def _build_recommendation(activity: Activity, *, text: str, reason: str, eco_score: float | None = None, carbon_saved: float | None = None, energy_saved: float | None = None) -> Recommendation:
    recommendation = Recommendation(
        activity_id=activity.id,
        text=text,
        reason=reason,
        expected_carbon_saving=carbon_saved,
        expected_energy_saving=energy_saved,
        eco_score=eco_score,
        forecast_used="scheduler",
        recommended_start_time=activity.deadline or _now(),
        status="pending",
    )
    db.session.add(recommendation)
    return recommendation


def _enrich_activity(activity: Activity) -> dict[str, Any]:
    current_status = CurrentStatus.query.filter_by(activity_id=activity.id).first()
    latest_recommendation = (
        Recommendation.query.filter_by(activity_id=activity.id)
        .order_by(Recommendation.created_at.desc())
        .first()
    )
    latest_slot = (
        ScheduleSlot.query.filter_by(activity_id=activity.id)
        .order_by(ScheduleSlot.created_at.desc())
        .first()
    )

    payload = activity.to_dict()
    payload.update(
        {
            "scheduledAt": activity.deadline.isoformat() if activity.deadline else None,
            "currentStatus": current_status.current_status if current_status else activity.status,
            "recommendation": latest_recommendation.to_dict() if latest_recommendation else None,
            "ecoScore": latest_recommendation.eco_score if latest_recommendation else None,
            "carbonSaved": latest_recommendation.expected_carbon_saving if latest_recommendation else None,
            "scheduleSlot": latest_slot.to_dict() if latest_slot else None,
        }
    )
    return payload


def _get_activities_for_scheduler() -> list[dict[str, Any]]:
    activities = Activity.query.order_by(Activity.created_at.desc()).all()
    sorted_activities = sorted(
        activities,
        key=lambda activity: (
            activity.deadline is None,
            activity.deadline or datetime.max.replace(tzinfo=timezone.utc),
            activity.created_at or datetime.min.replace(tzinfo=timezone.utc),
        ),
    )
    return [_enrich_activity(activity) for activity in sorted_activities]


def _validate_schedule(activity: Activity, scheduled_at: datetime | None, action: str) -> str | None:
    if activity.duration is None or activity.duration <= 0:
        return "Invalid duration"
    if scheduled_at is None and action in {"schedule", "reschedule"}:
        return "Missing scheduled time"
    if scheduled_at is not None and scheduled_at < _now() - timedelta(minutes=1):
        return "Scheduled time cannot be in the past"
    if activity.status in {"scheduled", "running", "paused", "waiting_for_device"} and action == "schedule":
        return "Activity is already scheduled"

    if scheduled_at is not None:
        end_time = scheduled_at + timedelta(minutes=float(activity.duration))
        overlapping = Activity.query.filter(
            Activity.id != activity.id,
            Activity.status.in_(["scheduled", "running", "paused", "waiting_for_device"]),
            Activity.deadline.isnot(None),
        ).all()
        for other in overlapping:
            other_deadline = other.deadline
            if not other_deadline:
                continue
            other_end = other_deadline + timedelta(minutes=float(other.duration or 0))
            if scheduled_at < other_end and end_time > other_deadline:
                return f"Overlapping schedule with '{other.name}'"
    return None


def get_scheduler_snapshot() -> dict[str, Any]:
    activities = _get_activities_for_scheduler()
    summary = {
        "total": len(activities),
        "pending": sum(1 for item in activities if (item.get("currentStatus") or item.get("status")) == "pending"),
        "scheduled": sum(1 for item in activities if (item.get("currentStatus") or item.get("status")) == "scheduled"),
        "running": sum(1 for item in activities if (item.get("currentStatus") or item.get("status")) == "running"),
        "completed": sum(1 for item in activities if (item.get("currentStatus") or item.get("status")) == "completed"),
        "missed": sum(1 for item in activities if (item.get("currentStatus") or item.get("status")) == "missed"),
        "cancelled": sum(1 for item in activities if (item.get("currentStatus") or item.get("status")) == "cancelled"),
    }
    today = [item for item in activities if item.get("scheduledAt") and _parse_datetime(item["scheduledAt"]) and _parse_datetime(item["scheduledAt"]).date() == _now().date()]
    upcoming = [item for item in activities if item.get("scheduledAt") and _parse_datetime(item["scheduledAt"]) and _parse_datetime(item["scheduledAt"]) >= _now()]

    return {
        "activities": activities,
        "today": sorted(today, key=lambda item: item.get("scheduledAt") or "", reverse=False),
        "upcoming": sorted(upcoming, key=lambda item: item.get("scheduledAt") or "", reverse=False),
        "summary": summary,
    }


def create_scheduler_entry(payload: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    activity_id = payload.get("activityId") or payload.get("id")
    if not activity_id:
        return None, "Missing activityId"

    activity = db.session.get(Activity, activity_id)
    if not activity:
        return None, "Activity not found"

    scheduled_at = _parse_datetime(payload.get("scheduledAt"))
    action = (payload.get("action") or "schedule").lower()
    if action not in {"schedule", "reschedule"}:
        return None, "Invalid scheduler action"

    error = _validate_schedule(activity, scheduled_at, action)
    if error:
        return None, error

    previous_status = activity.status
    activity.status = "scheduled"
    activity.deadline = scheduled_at or _now() + timedelta(minutes=30)
    activity.progress = 0.0
    activity.assigned_window_id = payload.get("assignedWindowId") or f"manual-{activity.id}"

    db.session.add(activity)
    _build_recommendation(
        activity,
        text="Schedule Automatically",
        reason="Activity scheduled for a carbon-aware window.",
        eco_score=round(max(0.0, min(100.0, 100.0 - (activity.priority_score or 0))), 1),
        carbon_saved=round(max(0.0, float(activity.estimated_carbon_grams or 0.0)), 2),
        energy_saved=round(activity.estimated_energy_kwh or 0.0, 4),
    )
    persist_schedule_slot(activity.id, activity.assigned_window_id or "manual-schedule", start_time=activity.deadline, end_time=activity.deadline + timedelta(minutes=float(activity.duration or 0)))
    on_activity_status_changed(activity, previous_status, missed_schedule=False)
    db.session.commit()
    return _enrich_activity(activity), None


def update_scheduler_entry(payload: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    activity_id = payload.get("activityId")
    if not activity_id:
        return None, "Missing activityId"

    activity = db.session.get(Activity, activity_id)
    if not activity:
        return None, "Activity not found"

    action = (payload.get("action") or payload.get("status") or "schedule").lower()
    if action not in VALID_ACTIONS:
        return None, "Invalid action"

    previous_status = activity.status
    new_status: str | None = None
    scheduled_at = _parse_datetime(payload.get("scheduledAt"))

    if action == "schedule":
        new_status = "scheduled"
        if scheduled_at is None:
            scheduled_at = _now() + timedelta(minutes=30)
        error = _validate_schedule(activity, scheduled_at, action)
        if error:
            return None, error
        activity.deadline = scheduled_at
        activity.progress = 0.0
    elif action == "reschedule":
        new_status = "scheduled"
        if scheduled_at is None:
            scheduled_at = _now() + timedelta(minutes=30)
        error = _validate_schedule(activity, scheduled_at, action)
        if error:
            return None, error
        activity.deadline = scheduled_at
        activity.progress = 0.0
    elif action == "start":
        new_status = "running"
        activity.progress = max(0.0, min(100.0, float(activity.progress or 0.0)))
    elif action == "pause":
        new_status = "paused"
    elif action == "resume":
        new_status = "running"
    elif action == "complete":
        new_status = "completed"
        activity.progress = 100.0
    elif action == "cancel":
        new_status = "cancelled"
    elif action == "missed":
        new_status = "missed"
    elif action == "delete":
        return delete_scheduler_entry(activity_id)

    if new_status is not None:
        activity.status = new_status
        if scheduled_at is not None and action in {"schedule", "reschedule"}:
            activity.deadline = scheduled_at
        if action in {"complete"}:
            activity.progress = 100.0

        _build_recommendation(
            activity,
            text="Status updated",
            reason=f"Activity transitioned to {activity.status}.",
            eco_score=activity.priority_score,
            carbon_saved=activity.estimated_carbon_grams,
            energy_saved=activity.estimated_energy_kwh,
        )

        on_activity_status_changed(activity, previous_status, missed_schedule=new_status == "missed")
        db.session.commit()
        return _enrich_activity(activity), None

    return None, "Unknown action"


def delete_scheduler_entry(activity_id: str) -> tuple[dict[str, Any] | None, str | None]:
    activity = db.session.get(Activity, activity_id)
    if not activity:
        return None, "Activity not found"

    db.session.delete(activity)
    db.session.commit()
    return {"deleted": True, "activityId": activity_id}, None
