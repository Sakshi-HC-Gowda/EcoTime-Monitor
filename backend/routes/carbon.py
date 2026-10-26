"""
Carbon Data Routes
==================
GET /api/carbon    — Current + history + forecast for a grid zone
GET /api/windows   — Detected green windows with ranking scores
GET /api/zones     — List all supported grid zones
"""

from __future__ import annotations

import os
import logging
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from auth_utils import require_auth
from models.activity import Activity

from services.carbon_service import (
    get_carbon_data,
    detect_green_windows,
    get_available_zones,
)
from optimization.window_ranking import rank_windows

logger = logging.getLogger(__name__)
carbon_bp = Blueprint("carbon", __name__)

_DEFAULT_ZONE = os.getenv("DEFAULT_ZONE", "US-CA")
_DEFAULT_THRESHOLD = float(os.getenv("LOW_CARBON_THRESHOLD", "180"))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@carbon_bp.route("/carbon", methods=["GET"])
@require_auth
def get_carbon():
    """
    Fetch carbon intensity data for a zone.

    Query Parameters:
        zone (str): Grid zone ID (default: US-CA)
        offset (float): Time offset in hours for simulation (default: 0)

    Returns 200:
        {
            success: true,
            data: {
                zone, current, history, forecast,
                isSimulated, error?
            }
        }
    """
    raw_zone = request.args.get("zone", _DEFAULT_ZONE)
    zone = raw_zone.strip() if isinstance(raw_zone, str) else ""
    offset = request.args.get("offset", 0, type=float)

    logger.info("GET /api/carbon zone=%s offset=%s", zone, offset)

    try:
        if not zone:
            raise ValueError("A non-empty grid zone is required")
        data = get_carbon_data(zone_id=zone, offset_hours=offset)
    except Exception as exc:
        logger.exception("GET /api/carbon failed for zone %s", zone)
        return jsonify({
            "success": False,
            "error": f"Carbon data unavailable: {exc}",
            "timestamp": _now_iso(),
        }), 503

    return jsonify({
        "success": True,
        "data": data,
        "timestamp": _now_iso(),
    }), 200


@carbon_bp.route("/windows", methods=["GET"])
@require_auth
def get_windows():
    """
    Detect and rank green windows for a zone.

    Query Parameters:
        zone (str): Grid zone ID (default: US-CA)
        threshold (float): Carbon intensity threshold (default: 180)
        offset (float): Simulation time offset in hours (default: 0)

    Returns 200:
        {
            success: true,
            data: GreenWindow[]  (ranked best-first)
        }
    """
    raw_zone = request.args.get("zone", _DEFAULT_ZONE)
    zone = raw_zone.strip() if isinstance(raw_zone, str) else ""
    threshold = request.args.get("threshold", _DEFAULT_THRESHOLD, type=float)
    offset = request.args.get("offset", 0, type=float)

    logger.info("GET /api/windows zone=%s threshold=%s", zone, threshold)

    try:
        if not zone:
            raise ValueError("A non-empty grid zone is required")
        carbon = get_carbon_data(zone_id=zone, offset_hours=offset)

        # _simulation_fallback() sets an informational "error" key on valid
        # simulated data explaining *why* the live API was unavailable.
        # Only reject if the data is NOT a usable simulated fallback.
        if carbon.get("error") and not carbon.get("isSimulated"):
            raise RuntimeError(carbon["error"])

        forecast = carbon.get("forecast", [])
        if not forecast:
            raise RuntimeError(
                "No forecast data available for green window detection"
            )

        raw_windows = detect_green_windows(
            forecast=forecast,
            current_datetime=carbon["current"]["datetime"],
            threshold=threshold,
        )
        for window in raw_windows:
            window["id"] = f"{zone}:{window['id']}"
        ranked = rank_windows(raw_windows)
        reservations = Activity.query.filter(
            Activity.organization_id == request.user.organization_id,
            Activity.status.in_(["scheduled", "running"]),
        ).all()
        reserved_by_window: dict[str, list[Activity]] = {}
        for activity in reservations:
            if activity.assigned_window_id:
                reserved_by_window.setdefault(activity.assigned_window_id, []).append(activity)
        for window in ranked:
            assigned = reserved_by_window.get(str(window["id"]), [])
            reserved_minutes = sum(float(activity.duration) for activity in assigned)
            window["scheduledActivityCount"] = len(assigned)
            window["scheduledDuration"] = round(reserved_minutes, 2)
            window["remainingCapacity"] = round(max(0.0, float(window["duration"]) - reserved_minutes), 2)
    except Exception as exc:
        logger.exception("GET /api/windows failed for zone %s", zone)
        return jsonify({
            "success": False,
            "error": f"Green Windows unavailable: {exc}",
            "timestamp": _now_iso(),
        }), 503

    return jsonify({
        "success": True,
        "data": ranked,
        "count": len(ranked),
        "isSimulated": carbon.get("isSimulated", False),
        "source": carbon.get("source"),
        "observedAt": carbon.get("observedAt"),
        "forecastSource": carbon.get("forecastSource"),
        "timestamp": _now_iso(),
    }), 200


@carbon_bp.route("/zones", methods=["GET"])
@require_auth
def list_zones():
    """
    List all supported grid zones.

    Returns 200:
        { success: true, data: GridZone[] }
    """
    zones = get_available_zones()
    return jsonify({
        "success": True,
        "data": zones,
        "count": len(zones),
        "timestamp": _now_iso(),
    }), 200
