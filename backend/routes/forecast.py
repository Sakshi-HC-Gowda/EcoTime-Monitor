"""
ML Forecast Routes
==================
GET  /api/forecast           — Generate 24h carbon intensity forecast (ML or simulation)
GET  /api/forecast/info      — Model metadata, training metrics, and status
POST /api/ml/train           — Trigger model (re)training (async-safe)
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify

from forecast.predict import get_predictor
from services.carbon_service import get_carbon_data

logger = logging.getLogger(__name__)
forecast_bp = Blueprint("forecast", __name__)

# Training lock — prevents concurrent training runs
_training_lock = threading.Lock()
_training_status: dict = {"running": False, "last_started": None, "last_finished": None, "error": None}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# GET /api/forecast
# ---------------------------------------------------------------------------

@forecast_bp.route("/forecast", methods=["GET"])
def get_forecast():
    """
    Generate a carbon intensity forecast for a grid zone.

    Query Parameters:
        zone (str): Grid zone ID (default: US-CA)
        hours (int): Forecast horizon in hours, 1-48 (default: 24)

    Returns 200:
        {
            success: true,
            data: {
                zone: str,
                forecast: [{ datetime, carbonIntensity, isML }],
                model: { model_name, is_trained, trained_at }
            }
        }
    """
    zone = request.args.get("zone", "US-CA").strip()
    hours = request.args.get("hours", 24, type=int)
    hours = max(1, min(hours, 48))  # Clamp to [1, 48]

    logger.info("GET /api/forecast zone=%s hours=%d", zone, hours)

    # Fetch recent history to anchor the prediction
    carbon = get_carbon_data(zone_id=zone, offset_hours=0)
    history = carbon.get("history", [])

    predictor = get_predictor()
    forecast_points = predictor.predict(
        zone_id=zone,
        horizon_hours=hours,
        history=history,
    )

    return jsonify({
        "success": True,
        "data": {
            "zone": zone,
            "forecast": forecast_points,
            "model": {
                "model_name": predictor._model_name,
                "is_trained": predictor.is_trained(),
                "trained_at": predictor._trained_at,
            },
        },
        "timestamp": _now_iso(),
    }), 200


# ---------------------------------------------------------------------------
# GET /api/forecast/info
# ---------------------------------------------------------------------------

@forecast_bp.route("/forecast/info", methods=["GET"])
def forecast_info():
    """
    Return metadata about the currently loaded ML model.

    Returns 200:
        {
            success: true,
            data: {
                model_name, is_trained, trained_at,
                feature_count, metrics, cv_results,
                training_status
            }
        }
    """
    predictor = get_predictor()
    info = predictor.get_model_info()
    info["training_status"] = _training_status

    return jsonify({
        "success": True,
        "data": info,
        "timestamp": _now_iso(),
    }), 200


# ---------------------------------------------------------------------------
# POST /api/ml/train
# ---------------------------------------------------------------------------

@forecast_bp.route("/ml/train", methods=["POST"])
def trigger_training():
    """
    Trigger ML model (re)training in a background thread.

    Idempotent — if training is already running, returns 409 Conflict.

    Request Body (JSON, all optional):
        hours (int): Training data hours per zone (default: 4380)
        zone (str): Train on single zone only (default: all zones)

    Returns 202: Training started
    Returns 409: Training already in progress
    """
    if _training_status["running"]:
        return jsonify({
            "success": False,
            "error": "Training is already in progress. Check /api/forecast/info for status.",
            "timestamp": _now_iso(),
        }), 409

    data = request.get_json(silent=True) or {}
    hours = int(data.get("hours", 4380))
    zone = data.get("zone", None)
    zones = [zone] if zone else None

    def _run_training():
        global _training_status
        _training_status["running"] = True
        _training_status["last_started"] = _now_iso()
        _training_status["error"] = None

        try:
            from forecast.train import train
            report = train(hours=hours, zones=zones)
            logger.info("Training completed. Best model: %s", report.get("best_model"))

            # Reload the predictor singleton with the new model
            from forecast import predict as predict_module
            predict_module._predictor = None  # Force reload on next access

        except Exception as exc:
            logger.error("Training failed: %s", exc)
            _training_status["error"] = str(exc)
        finally:
            _training_status["running"] = False
            _training_status["last_finished"] = _now_iso()

    thread = threading.Thread(target=_run_training, daemon=True)
    thread.start()

    return jsonify({
        "success": True,
        "data": {
            "message": "Model training started in background.",
            "hours_per_zone": hours,
            "zones": zones or "all",
        },
        "timestamp": _now_iso(),
    }), 202
