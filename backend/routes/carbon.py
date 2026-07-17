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

from services.carbon_service import get_carbon_data, detect_green_windows, get_available_zones
from optimization.window_ranking import rank_windows

logger = logging.getLogger(__name__)
carbon_bp = Blueprint("carbon", __name__)

_API_KEY = os.getenv("ELECTRICITY_MAPS_API_KEY", "")
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
    zone = request.args.get("zone", _DEFAULT_ZONE).strip()
    offset = request.args.get("offset", 0, type=float)

    # Use live API key if available
    api_key = _API_KEY or None

    logger.info("GET /api/carbon zone=%s offset=%s", zone, offset)

    data = get_carbon_data(zone_id=zone, api_key=api_key, offset_hours=offset)

    return jsonify({
        "success": True,
        "data": data,
        "timestamp": _now_iso(),
    }), 200


@carbon_bp.route("/windows", methods=["GET"])
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
    zone = request.args.get("zone", _DEFAULT_ZONE).strip()
    threshold = request.args.get("threshold", _DEFAULT_THRESHOLD, type=float)
    offset = request.args.get("offset", 0, type=float)

    api_key = _API_KEY or None

    logger.info("GET /api/windows zone=%s threshold=%s", zone, threshold)

    carbon = get_carbon_data(zone_id=zone, api_key=api_key, offset_hours=offset)
    raw_windows = detect_green_windows(
        forecast=carbon["forecast"],
        current_datetime=carbon["current"]["datetime"],
        threshold=threshold,
    )
    ranked = rank_windows(raw_windows)

    return jsonify({
        "success": True,
        "data": ranked,
        "count": len(ranked),
        "timestamp": _now_iso(),
    }), 200


@carbon_bp.route("/zones", methods=["GET"])
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
