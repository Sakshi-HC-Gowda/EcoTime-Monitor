"""
Persistence Orchestration Service
==================================
Centralises automatic database writes triggered by activity lifecycle
events: forecasts, recommendations, execution history, analytics
snapshots, notifications, and audit logs — all in the same transaction.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func

from extensions import db
from models.activity import Activity
from models.recommendation import Recommendation
from models.execution_history import ExecutionHistory
from models.analytics_snapshot import AnalyticsSnapshot
from models.carbon_forecast import CarbonForecast
from models.notification import Notification
from models.audit_log import AuditLog
from models.current_status import CurrentStatus
from optimization.carbon_calculator import calculate_savings_grams
from services.carbon_service import get_carbon_data
from services.system_settings_service import get_simulation_config

logger = logging.getLogger(__name__)

_PENDING_STATUSES = {"draft", "idle", "pending", "waiting_for_device"}
_SCHEDULED_STATUSES = {"scheduled", "delayed"}
_CANCELLED_STATUSES = {"cancelled", "failed"}
_MISSED_STATUSES = {"missed"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _baseline_intensity() -> float:
    return float(get_simulation_config().get("baselineIntensity", 380))


def _default_zone() -> str:
    return str(get_simulation_config().get("zone", "US-CA"))


def _estimate_energy_kwh(duration_min: float, power_w: float) -> float:
    return round((duration_min / 60.0) * (power_w / 1000.0), 4)


def _estimate_carbon_grams(duration_min: float, power_w: float, intensity: float) -> float:
    kwh = _estimate_energy_kwh(duration_min, power_w)
    return round(kwh * intensity, 2)


def log_audit(
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    activity_id: str | None = None,
    details: dict | None = None,
) -> None:
    db.session.add(AuditLog(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        activity_id=activity_id,
        details_json=json.dumps(details) if details else None,
    ))


def log_notification(
    title: str,
    message: str,
    activity_id: str | None = None,
    level: str = "info",
) -> None:
    db.session.add(Notification(
        activity_id=activity_id,
        title=title[:255],
        message=message,
        level=level,
    ))


def persist_carbon_forecasts(
    zone: str,
    activity_id: str | None = None,
    source: str = "simulation",
    version: str = "1.0",
) -> int:
    """Store forecast points from carbon service; skip duplicates."""
    carbon = get_carbon_data(zone_id=zone)
    points = carbon.get("forecast") or []
    fetched = _now()
    saved = 0

    for point in points[:24]:
        ts_raw = point.get("datetime")
        intensity = point.get("carbonIntensity")
        if ts_raw is None or intensity is None:
            continue
        try:
            ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
        except ValueError:
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        exists = CarbonForecast.query.filter_by(
            grid_zone=zone,
            timestamp=ts,
            forecast_source=source,
            activity_id=activity_id,
        ).first()
        if exists:
            continue

        db.session.add(CarbonForecast(
            grid_zone=zone,
            timestamp=ts,
            carbon_intensity=float(intensity),
            forecast_source=source,
            forecast_version=version,
            fetched_at=fetched,
            activity_id=activity_id,
        ))
        saved += 1

    return saved


def create_initial_recommendation(
    activity_id: str,
    activity_name: str,
    eco_score: float,
    carbon_saved: float,
    energy_saved: float,
    zone: str,
) -> None:
    db.session.add(Recommendation(
        activity_id=activity_id,
        text="Schedule Automatically",
        reason=f"Initial eco-aware recommendation for '{activity_name}' based on {zone} forecast.",
        expected_carbon_saving=carbon_saved,
        expected_energy_saving=energy_saved,
        eco_score=eco_score,
        forecast_used=zone,
        recommended_start_time=_now(),
        status="pending",
    ))


def record_execution_history(
    activity: Activity,
    previous_status: str | None,
    new_status: str,
    missed_schedule: bool = False,
) -> None:
    now = _now()
    actual_start = None
    actual_end = None
    actual_energy = None
    actual_carbon = None
    outcome = new_status

    if new_status == "running":
        actual_start = now
    elif new_status == "completed":
        actual_start = activity.updated_at
        actual_end = now
        actual_energy = activity.estimated_energy_kwh or _estimate_energy_kwh(
            activity.duration, activity.power_draw
        )
        intensity = _baseline_intensity()
        actual_carbon = activity.estimated_carbon_grams or _estimate_carbon_grams(
            activity.duration, activity.power_draw, intensity
        )
        outcome = "completed"
    elif new_status in _CANCELLED_STATUSES:
        outcome = "cancelled"
    elif new_status in _MISSED_STATUSES:
        outcome = "missed"
        missed_schedule = True

    db.session.add(ExecutionHistory(
        activity_id=activity.id,
        previous_status=previous_status,
        new_status=new_status,
        actual_start=actual_start,
        actual_end=actual_end,
        actual_energy_kwh=actual_energy,
        actual_carbon_grams=actual_carbon,
        outcome=outcome,
        missed_schedule=missed_schedule,
    ))


def refresh_analytics_snapshot(trigger_event: str, activity_id: str | None = None) -> None:
    """Compute aggregates from PostgreSQL and persist a snapshot row."""
    rows = (
        db.session.query(CurrentStatus.current_status, func.count(CurrentStatus.id))
        .group_by(CurrentStatus.current_status)
        .all()
    )
    counts = {status: count for status, count in rows}

    pending = sum(counts.get(s, 0) for s in _PENDING_STATUSES)
    scheduled = sum(counts.get(s, 0) for s in _SCHEDULED_STATUSES)
    running = counts.get("running", 0)
    completed = counts.get("completed", 0)
    cancelled = sum(counts.get(s, 0) for s in _CANCELLED_STATUSES)
    missed = sum(counts.get(s, 0) for s in _MISSED_STATUSES)
    total = sum(counts.values())

    savings = (
        db.session.query(
            func.coalesce(func.sum(Recommendation.expected_carbon_saving), 0.0),
            func.coalesce(func.sum(Recommendation.expected_energy_saving), 0.0),
        )
        .filter(Recommendation.status == "accepted")
        .one()
    )
    carbon_saved, energy_saved = savings

    total_recs, accepted_recs = (
        db.session.query(
            func.count(Recommendation.id),
            func.coalesce(func.sum(func.cast(Recommendation.status == "accepted", db.Integer)), 0),
        )
        .one()
    )
    rec_accuracy = (accepted_recs / total_recs * 100.0) if total_recs else 0.0

    eco_scores = [
        r.eco_score for r in Recommendation.query.filter(Recommendation.eco_score.isnot(None)).all()
    ]
    avg_eco = round(sum(eco_scores) / len(eco_scores), 1) if eco_scores else 0.0

    db.session.add(AnalyticsSnapshot(
        total_activities=total,
        completed_activities=completed,
        pending_activities=pending,
        scheduled_activities=scheduled,
        running_activities=running,
        cancelled_activities=cancelled,
        missed_activities=missed,
        total_carbon_saved_grams=round(carbon_saved, 2),
        total_energy_saved_kwh=round(energy_saved, 4),
        average_eco_score=avg_eco,
        recommendation_accuracy=round(rec_accuracy, 1),
        trigger_event=trigger_event,
        activity_id=activity_id,
    ))


def on_activity_created(activity: Activity) -> None:
    """Automatic cascade after a new activity is staged in the session."""
    zone = _default_zone()
    baseline = _baseline_intensity()
    carbon = get_carbon_data(zone_id=zone)
    current_intensity = float(carbon.get("current", {}).get("carbonIntensity", baseline))

    activity.estimated_energy_kwh = _estimate_energy_kwh(activity.duration, activity.power_draw)
    activity.estimated_carbon_grams = _estimate_carbon_grams(
        activity.duration, activity.power_draw, current_intensity
    )
    activity.category = activity.category or activity.activity_type

    carbon_saved = calculate_savings_grams(
        activity.duration, activity.power_draw, baseline, current_intensity
    )
    eco_score = max(0.0, min(100.0, 100.0 - (current_intensity / baseline * 50.0)))

    persist_carbon_forecasts(zone, activity_id=activity.id, source="activity-create")
    create_initial_recommendation(
        activity.id,
        activity.name,
        round(eco_score, 1),
        carbon_saved,
        activity.estimated_energy_kwh,
        zone,
    )
    record_execution_history(activity, None, activity.status)
    log_notification(
        "Activity created",
        f"Activity '{activity.name}' saved with status '{activity.status}'.",
        activity_id=activity.id,
    )
    log_audit("create", "activity", activity.id, activity_id=activity.id)
    refresh_analytics_snapshot("activity_created", activity.id)


def on_activity_status_changed(
    activity: Activity,
    previous_status: str,
    missed_schedule: bool = False,
) -> None:
    record_execution_history(activity, previous_status, activity.status, missed_schedule)
    log_notification(
        "Status updated",
        f"Activity '{activity.name}' moved from '{previous_status}' to '{activity.status}'.",
        activity_id=activity.id,
        level="info" if activity.status != "failed" else "warning",
    )
    log_audit(
        "status_change",
        "activity",
        activity.id,
        activity_id=activity.id,
        details={"from": previous_status, "to": activity.status},
    )
    refresh_analytics_snapshot("status_changed", activity.id)
