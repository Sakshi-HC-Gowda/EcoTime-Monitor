"""
Analytics Service
==================
Aggregates Activities, ActivityHistory, and Recommendations into the
metrics the Dashboard / Sustainability pages need:

  - Total energy & carbon saved
  - Today's activity breakdown (completed / pending / postponed)
  - Weekly summary
  - EcoScore (aggregate, 0-100) + trend (daily / weekly / monthly)
  - Recommendation logging (called by the optimizer routes)
  - System-wide operating status

All read functions are pure aggregations over the database and never
raise on empty data — an empty system returns zeroed-out metrics instead
of erroring, so the dashboard can render placeholders instead of crashing.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from extensions import db
from sqlalchemy import func
from models.activity import Activity
from models.activity_history import ActivityHistory
from models.recommendation import Recommendation
from models.carbon_snapshot import CarbonSnapshot
from models.current_status import CurrentStatus
from services.carbon_service import get_carbon_data

logger = logging.getLogger(__name__)

# Statuses that count as "postponed" for the today/weekly breakdowns.
_POSTPONED_STATUSES = {"delayed", "paused", "scheduled"}
_PENDING_STATUSES = {"idle", "pending"}
_CANCELLED_STATUSES = {"failed"}

_DEFAULT_ZONE = os.getenv("DEFAULT_ZONE", "US-CA")

# In-memory system-wide operating flag (mirrors the simulation-config
# pattern already used in routes/optimizer.py — no need for a table).
_system_status: dict[str, Any] = {
    "isActive": True,
    "updatedAt": None,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _day_bounds(day: datetime) -> tuple[datetime, datetime]:
    start = day.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


# ---------------------------------------------------------------------------
# Totals
# ---------------------------------------------------------------------------


def get_total_savings() -> dict:
    """
    Sum of all 'accepted' recommendation savings — i.e. savings that were
    actually acted on (a scheduling decision was made), not just suggested.

    Aggregated in SQL (COUNT/SUM), not by loading every row into Python —
    this stays O(1) round-trips regardless of table size.
    """
    row = (
        db.session.query(
            func.count(Recommendation.id),
            func.coalesce(func.sum(Recommendation.expected_carbon_saving), 0.0),
            func.coalesce(func.sum(Recommendation.expected_energy_saving), 0.0),
        )
        .filter(Recommendation.status == "accepted")
        .one()
    )
    count, total_carbon_grams, total_energy_kwh = row

    return {
        "totalEnergySavedKwh": round(total_energy_kwh, 4),
        "totalCarbonSavedKg": round(total_carbon_grams / 1000.0, 4),
        "totalCarbonSavedGrams": round(total_carbon_grams, 2),
        "recommendationsFollowed": count,
    }


# ---------------------------------------------------------------------------
# Today's Activities
# ---------------------------------------------------------------------------


def get_todays_activity_breakdown() -> dict:
    """
    Completed / pending / postponed / cancelled counts for activities
    created today — computed as a single grouped SQL query, not by
    loading every row into Python.
    """
    start, end = _day_bounds(_now())
    rows = (
        db.session.query(Activity.status, func.count(Activity.id))
        .filter(Activity.created_at >= start, Activity.created_at < end)
        .group_by(Activity.status)
        .all()
    )
    counts = {status: count for status, count in rows}

    completed = counts.get("completed", 0)
    pending = counts.get("idle", 0) + counts.get("pending", 0) + counts.get("running", 0)
    postponed = sum(counts.get(s, 0) for s in _POSTPONED_STATUSES)
    cancelled = counts.get("failed", 0)
    total = sum(counts.values())

    return {
        "total": total,
        "completed": completed,
        "pending": pending,
        "postponed": postponed,
        "cancelled": cancelled,
    }


# ---------------------------------------------------------------------------
# Weekly Summary
# ---------------------------------------------------------------------------


def get_weekly_summary(zone: str = _DEFAULT_ZONE) -> dict:
    """Rolling 7-day summary: activity counts + savings + avg. carbon intensity."""
    start = _now() - timedelta(days=7)

    total_activities, completed = (
        db.session.query(
            func.count(Activity.id),
            func.coalesce(func.sum(func.cast(Activity.status == "completed", db.Integer)), 0),
        )
        .filter(Activity.created_at >= start)
        .one()
    )

    energy_saved, carbon_saved = (
        db.session.query(
            func.coalesce(func.sum(Recommendation.expected_energy_saving), 0.0),
            func.coalesce(func.sum(Recommendation.expected_carbon_saving), 0.0),
        )
        .filter(Recommendation.status == "accepted", Recommendation.created_at >= start)
        .one()
    )

    # Average carbon intensity over the last 24h forecast/history as a proxy
    # for "this week's grid cleanliness" (live 7-day history isn't stored).
    carbon = get_carbon_data(zone_id=zone)
    history_points = carbon.get("history", []) + [carbon.get("current", {})]
    intensities = [p["carbonIntensity"] for p in history_points if p.get("carbonIntensity") is not None]
    avg_intensity = round(sum(intensities) / len(intensities), 1) if intensities else 0.0

    return {
        "totalActivities": total_activities,
        "completed": completed,
        "averageCarbonIntensity": avg_intensity,
        "energySavedKwh": round(energy_saved, 4),
        "carbonSavedKg": round(carbon_saved / 1000.0, 4),
    }


# ---------------------------------------------------------------------------
# EcoScore
# ---------------------------------------------------------------------------


def _eco_score_for_window(start: datetime, end: datetime) -> float:
    """
    Composite 0-100 EcoScore for a time window, based on:
      - completed-activity ratio (40%)
      - accepted-recommendation ratio (30%)
      - normalised carbon savings (30%)
    Returns 0.0 for windows with no activity (nothing to score yet).

    Pure SQL aggregation — two COUNT/SUM queries, never loads full rows.
    This matters because get_eco_score_trend() calls this 21 times per
    request (7 daily + 8 weekly + 6 monthly buckets).
    """
    total_activities, completed_activities = (
        db.session.query(
            func.count(Activity.id),
            func.coalesce(func.sum(func.cast(Activity.status == "completed", db.Integer)), 0),
        )
        .filter(Activity.created_at >= start, Activity.created_at < end)
        .one()
    )
    if total_activities == 0:
        return 0.0
    completed_ratio = completed_activities / total_activities

    total_recs, accepted_recs, carbon_saved = (
        db.session.query(
            func.count(Recommendation.id),
            func.coalesce(func.sum(func.cast(Recommendation.status == "accepted", db.Integer)), 0),
            func.coalesce(
                func.sum(
                    func.cast(Recommendation.status == "accepted", db.Integer)
                    * func.coalesce(Recommendation.expected_carbon_saving, 0.0)
                ), 0.0
            ),
        )
        .filter(Recommendation.created_at >= start, Recommendation.created_at < end)
        .one()
    )
    accepted_ratio = (accepted_recs / total_recs) if total_recs else 0.0
    # Normalise against a 5kg CO2e/window cap — beyond that, treat as maxed out.
    savings_score = min(1.0, carbon_saved / 5000.0)

    score = 40 * completed_ratio + 30 * accepted_ratio + 30 * savings_score
    return round(max(0.0, min(100.0, score)), 1)


def compute_eco_score() -> dict:
    """Aggregate EcoScore for the last 7 days, with its component breakdown."""
    start = _now() - timedelta(days=7)

    total_activities, completed_activities = (
        db.session.query(
            func.count(Activity.id),
            func.coalesce(func.sum(func.cast(Activity.status == "completed", db.Integer)), 0),
        )
        .filter(Activity.created_at >= start)
        .one()
    )
    completed_ratio = (completed_activities / total_activities) if total_activities else 0.0

    total_recs, accepted_recs, carbon_saved = (
        db.session.query(
            func.count(Recommendation.id),
            func.coalesce(func.sum(func.cast(Recommendation.status == "accepted", db.Integer)), 0),
            func.coalesce(
                func.sum(
                    func.cast(Recommendation.status == "accepted", db.Integer)
                    * func.coalesce(Recommendation.expected_carbon_saving, 0.0)
                ), 0.0
            ),
        )
        .filter(Recommendation.created_at >= start)
        .one()
    )
    accepted_ratio = (accepted_recs / total_recs) if total_recs else 0.0
    savings_score = min(1.0, carbon_saved / 5000.0)

    score = round(40 * completed_ratio + 30 * accepted_ratio + 30 * savings_score, 1)

    return {
        "ecoScore": max(0.0, min(100.0, score)),
        "completedRatio": round(completed_ratio, 2),
        "greenRecommendationRatio": round(accepted_ratio, 2),
        "carbonSavingsScore": round(savings_score * 100, 1),
    }


def get_eco_score_trend() -> dict:
    """
    EcoScore trend arrays suitable for charts:
      - daily:   last 7 days
      - weekly:  last 8 weeks
      - monthly: last 6 months
    Each point is { label, score }.
    """
    now = _now()

    daily = []
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        start, end = _day_bounds(day)
        daily.append({"label": start.strftime("%a"), "date": start.date().isoformat(), "score": _eco_score_for_window(start, end)})

    weekly = []
    for i in range(7, -1, -1):
        end = now - timedelta(weeks=i)
        start = end - timedelta(weeks=1)
        weekly.append({"label": f"W{8 - i}", "date": start.date().isoformat(), "score": _eco_score_for_window(start, end)})

    monthly = []
    for i in range(5, -1, -1):
        # Approximate month boundaries with 30-day buckets (avoids a calendar dependency).
        end = now - timedelta(days=30 * i)
        start = end - timedelta(days=30)
        monthly.append({"label": start.strftime("%b"), "date": start.date().isoformat(), "score": _eco_score_for_window(start, end)})

    return {"daily": daily, "weekly": weekly, "monthly": monthly}


# ---------------------------------------------------------------------------
# Combined Summaries
# ---------------------------------------------------------------------------


def get_analytics_summary(zone: str = _DEFAULT_ZONE) -> dict:
    """Everything the /analytics endpoint needs, in one aggregation pass."""
    return {
        **get_total_savings(),
        "todaysActivities": get_todays_activity_breakdown(),
        "weeklySummary": get_weekly_summary(zone),
        "ecoScore": compute_eco_score(),
        "ecoScoreTrend": get_eco_score_trend(),
    }


def get_dashboard_summary(zone: str = _DEFAULT_ZONE) -> dict:
    """
    Lightweight summary for the Dashboard page — designed to be merged
    client-side with the existing /carbon, /windows and /activities calls
    rather than duplicating them here.
    """
    latest_rec = (
        Recommendation.query.order_by(Recommendation.created_at.desc()).first()
    )
    totals = get_total_savings()
    eco = compute_eco_score()

    return {
        "ecoScore": eco["ecoScore"],
        "totalEnergySavedKwh": totals["totalEnergySavedKwh"],
        "totalCarbonSavedKg": totals["totalCarbonSavedKg"],
        "todaysActivities": get_todays_activity_breakdown(),
        "weeklySummary": get_weekly_summary(zone),
        "latestRecommendation": latest_rec.to_dict() if latest_rec else None,
    }


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


def get_history(page: int = 1, page_size: int = 50, activity_id: str | None = None) -> dict:
    """Paginated activity status-transition history, newest first."""
    page = max(1, page)
    page_size = min(max(1, page_size), 200)

    query = ActivityHistory.query
    if activity_id:
        query = query.filter_by(activity_id=activity_id)

    total = query.count()
    items = (
        query.order_by(ActivityHistory.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": [h.to_dict() for h in items],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasMore": (page - 1) * page_size + len(items) < total,
    }


def log_carbon_snapshot(
    region: str,
    carbon_intensity: float,
    forecast: list | None = None,
    source: str = "simulation",
    activity_id: str | None = None,
) -> dict | None:
    """
    Persist a point-in-time carbon intensity reading. Called from the
    /api/carbon route so every fetched reading also becomes a queryable
    database record, not just an ephemeral API response.
    Best-effort: failures are logged and swallowed.
    """
    try:
        snapshot = CarbonSnapshot(
            region=region,
            carbon_intensity=carbon_intensity,
            forecast_json=json.dumps(forecast[:24]) if forecast else None,
            source=source,
            activity_id=activity_id,
        )
        db.session.add(snapshot)
        db.session.commit()
        return snapshot.to_dict()
    except Exception:
        db.session.rollback()
        logger.exception("Failed to log carbon snapshot")
        return None


def get_carbon_snapshots(page: int = 1, page_size: int = 50, region: str | None = None) -> dict:
    """Paginated stored carbon intensity readings, newest first."""
    page = max(1, page)
    page_size = min(max(1, page_size), 200)

    query = CarbonSnapshot.query
    if region:
        query = query.filter_by(region=region)

    total = query.count()
    items = (
        query.order_by(CarbonSnapshot.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": [s.to_dict() for s in items],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasMore": (page - 1) * page_size + len(items) < total,
    }


# ---------------------------------------------------------------------------
# Recommendations
# ---------------------------------------------------------------------------


def log_recommendation(
    text: str,
    reason: str | None = None,
    activity_id: str | None = None,
    expected_carbon_saving: float | None = None,
    expected_energy_saving: float | None = None,
    status: str = "pending",
) -> dict | None:
    """
    Persist a recommendation produced by the EcoScore engine or Scheduler.
    Best-effort: failures are logged and swallowed so a DB hiccup never
    breaks the recommendation/scheduling endpoints that call this.
    """
    try:
        rec = Recommendation(
            activity_id=activity_id,
            text=(text or "")[:500],
            reason=(reason or "")[:500] or None,
            expected_carbon_saving=expected_carbon_saving,
            expected_energy_saving=expected_energy_saving,
            status=status if status in {"pending", "accepted", "rejected", "expired"} else "pending",
        )
        db.session.add(rec)
        db.session.commit()
        return rec.to_dict()
    except Exception:
        db.session.rollback()
        logger.exception("Failed to log recommendation")
        return None


def list_recommendations(
    page: int = 1, page_size: int = 50, status_filter: str | None = None
) -> dict:
    """Paginated recommendation list, newest first."""
    page = max(1, page)
    page_size = min(max(1, page_size), 200)

    query = Recommendation.query
    if status_filter:
        query = query.filter_by(status=status_filter)

    total = query.count()
    items = (
        query.order_by(Recommendation.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": [r.to_dict() for r in items],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "hasMore": (page - 1) * page_size + len(items) < total,
    }


def update_recommendation_status(recommendation_id: int, status: str) -> tuple[dict | None, str | None]:
    """Mark a recommendation as accepted/rejected/expired."""
    if status not in {"pending", "accepted", "rejected", "expired"}:
        return None, f"Invalid status '{status}'"

    rec = db.session.get(Recommendation, recommendation_id)
    if not rec:
        return None, f"Recommendation '{recommendation_id}' not found"

    rec.status = status
    rec.updated_at = _now()

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Failed to update recommendation %s", recommendation_id)
        return None, "Failed to save recommendation update"

    return rec.to_dict(), None


# ---------------------------------------------------------------------------
# System Status
# ---------------------------------------------------------------------------


def get_status_summary() -> dict:
    """
    Aggregate status counts read from the dedicated CurrentStatus table
    (kept 1:1 in sync with Activity.status by activity_service), plus
    the system-wide operating flag. Single grouped SQL query.
    """
    rows = (
        db.session.query(CurrentStatus.current_status, func.count(CurrentStatus.id))
        .group_by(CurrentStatus.current_status)
        .all()
    )
    counts = {status: count for status, count in rows}

    running = counts.get("running", 0)
    completed = counts.get("completed", 0)
    postponed = sum(counts.get(s, 0) for s in _POSTPONED_STATUSES)
    cancelled = sum(counts.get(s, 0) for s in _CANCELLED_STATUSES)
    pending = sum(counts.get(s, 0) for s in _PENDING_STATUSES)
    total = sum(counts.values())

    return {
        "counts": {
            "running": running,
            "completed": completed,
            "postponed": postponed,
            "cancelled": cancelled,
            "pending": pending,
            "total": total,
        },
        "system": dict(_system_status),
    }


def set_system_status(is_active: bool) -> dict:
    """Update the system-wide operating flag (e.g. pause/resume the optimizer)."""
    _system_status["isActive"] = bool(is_active)
    _system_status["updatedAt"] = _now_iso()
    return dict(_system_status)
