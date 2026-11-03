"""
ML Forecast Routes
==================
GET  /api/forecast           — Generate 24h carbon intensity forecast (ML or simulation)
GET  /api/forecast/info      — Model metadata, training metrics, and status
POST /api/ml/train           — Trigger model (re)training (async-safe)
"""

from __future__ import annotations

import logging
import math
import threading
from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify
from auth_utils import require_auth, require_organization_admin

from forecast.predict import get_predictor
from services.carbon_service import get_carbon_data

logger = logging.getLogger(__name__)
forecast_bp = Blueprint("forecast", __name__)

# Training lock — prevents concurrent training runs
_training_lock = threading.Lock()
_training_status: dict = {"running": False, "last_started": None, "last_finished": None, "error": None}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_aware_datetime(value: object) -> datetime | None:
    try:
        timestamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if timestamp.tzinfo is None:
        return None
    return timestamp.astimezone(timezone.utc)


def _valid_intensity(value: object) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return math.isfinite(value) and value >= 0


def _normalize_hourly_points(points: object) -> list[dict]:
    """Oldest-first unique hourly points. Duplicate hours keep the first occurrence."""
    parsed: list[tuple[datetime, dict]] = []
    if not isinstance(points, list):
        return []
    for point in points:
        if not isinstance(point, dict):
            continue
        timestamp = _parse_aware_datetime(point.get("datetime"))
        intensity = point.get("carbonIntensity")
        if timestamp is None or not _valid_intensity(intensity):
            continue
        parsed.append((timestamp, {
            "datetime": timestamp.isoformat(),
            "carbonIntensity": intensity,
        }))
    parsed.sort(key=lambda item: item[0])
    unique: list[dict] = []
    seen_hours: set[datetime] = set()
    for timestamp, point in parsed:
        hour_key = timestamp.replace(minute=0, second=0, microsecond=0)
        if hour_key in seen_hours:
            continue
        seen_hours.add(hour_key)
        unique.append(point)
    return unique


# Feature engineering uses lag_24h, so model input must include 25 hourly points.
_MODEL_HISTORY_HOURS = 25


def _trailing_hourly_history(points: list[dict], size: int, predictor) -> list[dict] | None:
    if len(points) < size:
        return None
    window = points[-size:]
    try:
        predictor._validate_history(window)
    except (TypeError, ValueError):
        return None
    return window


def _observed_series(carbon: dict, provider_forecast: list[dict]) -> list[dict]:
    series: list[dict] = []
    history = carbon.get("history")
    if isinstance(history, list):
        series.extend(history)
    current = carbon.get("current")
    if isinstance(current, dict):
        series.append(current)
    series.extend(provider_forecast)
    return _normalize_hourly_points(series)


def _provider_forecast_points(carbon: dict) -> list[dict]:
    provider = _normalize_hourly_points(carbon.get("forecast"))
    observed = _parse_aware_datetime(
        carbon.get("observedAt")
        or (carbon.get("current") or {}).get("datetime")
    )
    if observed is None:
        return provider
    return [
        point
        for point in provider
        if (_parse_aware_datetime(point["datetime"]) or observed) >= observed
    ]


def _extend_provider_with_model(
    *,
    zone: str,
    hours: int,
    carbon: dict,
    provider_forecast: list[dict],
    predictor,
) -> tuple[list[dict], str]:
    """Keep genuine provider hours and generate only the missing future hours with the model."""
    remaining = hours - len(provider_forecast)
    series = _observed_series(carbon, provider_forecast)
    model_history = _trailing_hourly_history(series, _MODEL_HISTORY_HOURS, predictor)
    if model_history is None:
        model_history = _trailing_hourly_history(provider_forecast, _MODEL_HISTORY_HOURS, predictor)
    if model_history is None:
        logger.error(
            "Cannot extend zone %s forecast: provider_points=%d requested=%d "
            "consecutive_history=%d",
            zone,
            len(provider_forecast),
            hours,
            len(series),
        )
        raise ValueError(
            f"Only {len(provider_forecast)} provider forecast points are available; "
            f"{hours} requested, and there is insufficient consecutive hourly "
            "history to extend with the trained model"
        )

    last_provider = _parse_aware_datetime(provider_forecast[-1]["datetime"])
    last_history = _parse_aware_datetime(model_history[-1]["datetime"])
    if last_provider is None or last_history is None or last_history != last_provider:
        raise ValueError(
            "Model extension history must end at the last provider forecast timestamp"
        )

    try:
        ml_tail = predictor.predict(
            zone_id=zone,
            horizon_hours=remaining,
            history=model_history,
        )
    except Exception as exc:
        logger.exception("Trained model failed while extending forecast for zone %s", zone)
        raise RuntimeError(f"Trained model failed to extend the forecast: {exc}") from exc

    combined = [{**point, "isML": False} for point in provider_forecast] + list(ml_tail)
    predictor._validate_forecast(combined, hours)
    logger.info(
        "Forecast for zone %s: %d Electricity Maps hours + %d ML-extended hours",
        zone,
        len(provider_forecast),
        remaining,
    )
    return combined, "electricity_maps_api+ml_model"


# ---------------------------------------------------------------------------
# GET /api/forecast
# ---------------------------------------------------------------------------

@forecast_bp.route("/forecast", methods=["GET"])
@require_auth
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
    raw_zone = request.args.get("zone", "US-CA")
    zone = raw_zone.strip() if isinstance(raw_zone, str) else ""
    try:
        if not zone:
            raise ValueError("A non-empty grid zone is required")

        raw_hours = request.args.get("hours", 24)
        try:
            hours = int(raw_hours)
        except (TypeError, ValueError):
            raise ValueError(
                f"Invalid forecast horizon: {raw_hours!r} (must be an integer between 1 and 48)"
            )
        if hours < 1 or hours > 48:
            raise ValueError(
                f"Unsupported forecast horizon: {hours} hours requested (must be between 1 and 48)"
            )

        logger.info("GET /api/forecast zone=%s hours=%d", zone, hours)

        carbon = get_carbon_data(zone_id=zone, offset_hours=0, forecast_hours=hours)
        predictor = get_predictor()
        # _simulation_fallback() sets an informational "error" key on valid
        # simulated data explaining *why* the live API was unavailable.
        # Only reject if the data is NOT a usable simulated fallback.
        if carbon.get("error") and not carbon.get("isSimulated"):
            raise RuntimeError(carbon["error"])

        history = carbon.get("history", [])
        is_simulated = bool(carbon.get("isSimulated"))
        provider_forecast = _provider_forecast_points(carbon)

        if is_simulated:
            forecast_points = list(carbon.get("forecast", []))
            if not forecast_points:
                raise ValueError("No forecast points are available")

            # Simulated fallback may be shorter than the requested horizon;
            # extend with the zone simulation model (never presented as live).
            if len(forecast_points) < hours:
                from services.carbon_service import GRID_ZONES, _DEFAULT_ZONE_ID, _get_simulated_intensity
                zone_config = GRID_ZONES.get(zone, GRID_ZONES[_DEFAULT_ZONE_ID])
                last_dt = datetime.fromisoformat(
                    str(forecast_points[-1]["datetime"]).replace("Z", "+00:00")
                )
                needed = hours - len(forecast_points)
                for step in range(1, needed + 1):
                    next_dt = last_dt + timedelta(hours=step)
                    forecast_points.append({
                        "datetime": next_dt.isoformat(),
                        "carbonIntensity": _get_simulated_intensity(zone_config, next_dt),
                    })

            forecast_points = forecast_points[:hours]
            predictor._validate_forecast(forecast_points, hours)
            forecast_points = [{**point, "isML": False} for point in forecast_points]
            forecast_source = carbon.get("forecastSource", "simulation")
        elif len(provider_forecast) >= hours:
            forecast_points = provider_forecast[:hours]
            predictor._validate_forecast(forecast_points, hours)
            forecast_points = [{**point, "isML": False} for point in forecast_points]
            forecast_source = carbon.get("forecastSource", "electricity_maps_api")
            logger.info(
                "Forecast for zone %s: %d Electricity Maps hours (full horizon)",
                zone,
                hours,
            )
        elif predictor.is_trained() and provider_forecast:
            forecast_points, forecast_source = _extend_provider_with_model(
                zone=zone,
                hours=hours,
                carbon=carbon,
                provider_forecast=provider_forecast,
                predictor=predictor,
            )
        elif (
            predictor.is_trained()
            and isinstance(history, list)
            and len(history) >= _MODEL_HISTORY_HOURS
        ):
            logger.info(
                "Forecast for zone %s: no provider forecast; using trained model for %d hours",
                zone,
                hours,
            )
            forecast_points = predictor.predict(
                zone_id=zone,
                horizon_hours=hours,
                history=history,
            )
            forecast_source = "ml_model"
        elif not provider_forecast:
            raise ValueError("No forecast points are available")
        else:
            logger.error(
                "Forecast for zone %s has only %d provider points (requested %d); "
                "trained_model=%s",
                zone,
                len(provider_forecast),
                hours,
                predictor.is_trained(),
            )
            raise ValueError(
                f"Only {len(provider_forecast)} forecast points are available; {hours} requested"
            )
    except Exception as exc:
        logger.exception("GET /api/forecast failed for zone %s", zone)
        return jsonify({
            "success": False,
            "error": f"Forecast unavailable: {exc}",
            "timestamp": _now_iso(),
        }), 503

    return jsonify({
        "success": True,
        "data": {
            "zone": zone,
            "forecast": forecast_points,
            "isSimulated": carbon.get("isSimulated", False),
            "source": carbon.get("source"),
            "forecastSource": forecast_source,
            "observedAt": carbon.get("observedAt"),
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
@require_auth
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
@require_organization_admin
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
