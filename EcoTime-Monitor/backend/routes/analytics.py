"""
Analytics, Dashboard, History & Status Routes
==============================================
GET  /api/analytics       — Full analytics payload (totals, today, weekly, EcoScore, trend)
GET  /api/dashboard        — Lightweight summary for the Dashboard page
GET  /api/history          — Paginated activity status-transition history
GET  /api/recommendations  — Paginated recommendation log
PATCH /api/recommendations/<id> — Mark a recommendation accepted/rejected/expired
GET  /api/status           — Aggregate status counts + system operating flag
POST /api/status           — Update the system operating flag
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify

from services.analytics_service import (
    get_analytics_summary,
    get_dashboard_summary,
    get_history,
    list_recommendations,
    update_recommendation_status,
    get_status_summary,
    set_system_status,
    get_carbon_snapshots,
)

logger = logging.getLogger(__name__)
analytics_bp = Blueprint("analytics", __name__)

_DEFAULT_ZONE = os.getenv("DEFAULT_ZONE", "US-CA")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _error(message: str, code: int):
    return jsonify({"success": False, "error": message, "timestamp": _now_iso()}), code


def _ok(data, code: int = 200, **extra):
    return jsonify({"success": True, "data": data, "timestamp": _now_iso(), **extra}), code


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

@analytics_bp.route("/analytics", methods=["GET"])
def analytics():
    """
    Full analytics payload.

    Query Parameters:
        zone (str): Grid zone for weekly average intensity (default: US-CA)

    Returns 200: { success: true, data: AnalyticsSummary }
    """
    zone = request.args.get("zone", _DEFAULT_ZONE).strip()
    try:
        data = get_analytics_summary(zone=zone)
    except Exception:
        logger.exception("GET /api/analytics failed")
        return _error("Failed to compute analytics", 500)
    return _ok(data)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@analytics_bp.route("/dashboard", methods=["GET"])
def dashboard():
    """
    Lightweight dashboard summary — meant to be merged client-side with
    the existing /carbon, /windows, and /activities endpoints.

    Query Parameters:
        zone (str): Grid zone (default: US-CA)

    Returns 200: { success: true, data: DashboardSummary }
    """
    zone = request.args.get("zone", _DEFAULT_ZONE).strip()
    try:
        data = get_dashboard_summary(zone=zone)
    except Exception:
        logger.exception("GET /api/dashboard failed")
        return _error("Failed to compute dashboard summary", 500)
    return _ok(data)


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

@analytics_bp.route("/history", methods=["GET"])
def history():
    """
    Paginated activity status-transition history.

    Query Parameters:
        page (int): default 1
        pageSize (int): default 50, max 200
        activityId (str): optional filter to a single activity

    Returns 200: { success: true, data: PaginatedResponse<ActivityHistory> }
    """
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("pageSize", 50, type=int)
    activity_id = request.args.get("activityId")

    try:
        data = get_history(page=page, page_size=page_size, activity_id=activity_id)
    except Exception:
        logger.exception("GET /api/history failed")
        return _error("Failed to fetch history", 500)
    return _ok(data)


# ---------------------------------------------------------------------------
# Recommendations
# ---------------------------------------------------------------------------

@analytics_bp.route("/recommendations", methods=["GET"])
def recommendations():
    """
    Paginated recommendation log.

    Query Parameters:
        page (int): default 1
        pageSize (int): default 50, max 200
        status (str): optional filter — pending | accepted | rejected | expired

    Returns 200: { success: true, data: PaginatedResponse<Recommendation> }
    """
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("pageSize", 50, type=int)
    status_filter = request.args.get("status")

    try:
        data = list_recommendations(page=page, page_size=page_size, status_filter=status_filter)
    except Exception:
        logger.exception("GET /api/recommendations failed")
        return _error("Failed to fetch recommendations", 500)
    return _ok(data)


@analytics_bp.route("/recommendations/<int:recommendation_id>", methods=["PATCH"])
def update_recommendation(recommendation_id: int):
    """
    Mark a recommendation as accepted / rejected / expired.

    Request Body (JSON):
        status (str, required): pending | accepted | rejected | expired

    Returns 200: { success: true, data: Recommendation }
    Returns 400/404: { success: false, error: str }
    """
    data = request.get_json(silent=True)
    if not data or "status" not in data:
        return _error("Request body must include 'status'", 400)

    rec, error = update_recommendation_status(recommendation_id, data["status"])
    if error:
        code = 404 if "not found" in error.lower() else 400
        return _error(error, code)

    return _ok(rec)


# ---------------------------------------------------------------------------
# Carbon Snapshots
# ---------------------------------------------------------------------------

@analytics_bp.route("/carbon-snapshots", methods=["GET"])
def carbon_snapshots():
    """
    Paginated, persisted carbon-intensity readings (written by /api/carbon).

    Query Parameters:
        page (int): default 1
        pageSize (int): default 50, max 200
        region (str): optional filter

    Returns 200: { success: true, data: PaginatedResponse<CarbonSnapshot> }
    """
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("pageSize", 50, type=int)
    region = request.args.get("region")

    try:
        data = get_carbon_snapshots(page=page, page_size=page_size, region=region)
    except Exception:
        logger.exception("GET /api/carbon-snapshots failed")
        return _error("Failed to fetch carbon snapshots", 500)
    return _ok(data)


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

@analytics_bp.route("/status", methods=["GET"])
def status():
    """
    Aggregate activity status counts + system-wide operating flag.

    Returns 200: { success: true, data: StatusSummary }
    """
    try:
        data = get_status_summary()
    except Exception:
        logger.exception("GET /api/status failed")
        return _error("Failed to fetch status", 500)
    return _ok(data)


@analytics_bp.route("/status", methods=["POST"])
def set_status():
    """
    Update the system-wide operating flag (e.g. pause/resume the optimizer).

    Request Body (JSON):
        isActive (bool, required)

    Returns 200: { success: true, data: { isActive, updatedAt } }
    """
    data = request.get_json(silent=True)
    if not data or "isActive" not in data:
        return _error("Request body must include 'isActive'", 400)

    result = set_system_status(bool(data["isActive"]))
    return _ok(result)
