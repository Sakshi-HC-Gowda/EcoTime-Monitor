"""
Carbon Service
==============
Provides carbon intensity data for grid zones:
  - Simulation mode: Uses mathematical wave models (matches frontend behaviour)
  - Live mode: Calls Electricity Maps REST API

Also detects Green Windows from forecast data.
"""

from __future__ import annotations

import math
import os
import logging
from datetime import datetime, timedelta, timezone

import requests

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Zone Definitions (mirrors frontend electricityMaps.ts GRID_ZONES)
# ---------------------------------------------------------------------------

GRID_ZONES: dict[str, dict] = {
    "US-CA": {
        "id": "US-CA",
        "name": "California (CAISO)",
        "country": "USA",
        "type": "solar",
        "baseIntensity": 180,
        "amplitude": 140,
        "noise": 10,
    },
    "IN": {
        "id": "IN",
        "name": "India (National Grid)",
        "country": "India",
        "type": "mixed",
        "baseIntensity": 680,
        "amplitude": 120,
        "noise": 15,
    },
    "IN-SO": {
        "id": "IN-SO",
        "name": "Southern India",
        "country": "India",
        "type": "mixed",
        "baseIntensity": 650,
        "amplitude": 110,
        "noise": 14,
    },
    "IN-WE": {
        "id": "IN-WE",
        "name": "Western India",
        "country": "India",
        "type": "mixed",
        "baseIntensity": 620,
        "amplitude": 105,
        "noise": 14,
    },
    "IN-NO": {
        "id": "IN-NO",
        "name": "Northern India",
        "country": "India",
        "type": "mixed",
        "baseIntensity": 700,
        "amplitude": 115,
        "noise": 15,
    },
    "IN-EA": {
        "id": "IN-EA",
        "name": "Eastern India",
        "country": "India",
        "type": "mixed",
        "baseIntensity": 720,
        "amplitude": 120,
        "noise": 15,
    },
    "IN-NE": {
        "id": "IN-NE",
        "name": "North-Eastern India",
        "country": "India",
        "type": "mixed",
        "baseIntensity": 580,
        "amplitude": 90,
        "noise": 12,
    },
    "US-NY": {
        "id": "US-NY",
        "name": "New York (NYISO)",
        "country": "USA",
        "type": "mixed",
        "baseIntensity": 220,
        "amplitude": 100,
        "noise": 12,
    },
    "DK-DK2": {
        "id": "DK-DK2",
        "name": "Eastern Denmark",
        "country": "Denmark",
        "type": "wind",
        "baseIntensity": 90,
        "amplitude": 70,
        "noise": 15,
    },
    "GB": {
        "id": "GB",
        "name": "Great Britain",
        "country": "United Kingdom",
        "type": "mixed",
        "baseIntensity": 170,
        "amplitude": 80,
        "noise": 12,
    },
    "FR": {
        "id": "FR",
        "name": "France (Nuclear)",
        "country": "France",
        "type": "nuclear",
        "baseIntensity": 55,
        "amplitude": 15,
        "noise": 5,
    },
    "DE": {
        "id": "DE",
        "name": "Germany",
        "country": "Germany",
        "type": "mixed",
        "baseIntensity": 340,
        "amplitude": 110,
        "noise": 18,
    },
    "BR": {
        "id": "BR",
        "name": "Brazil (Clean Grid)",
        "country": "Brazil",
        "type": "wind",
        "baseIntensity": 75,
        "amplitude": 25,
        "noise": 6,
    },
    "AU-NSW": {
        "id": "AU-NSW",
        "name": "New South Wales",
        "country": "Australia",
        "type": "coal",
        "baseIntensity": 620,
        "amplitude": 90,
        "noise": 12,
    },
}

_DEFAULT_ZONE_ID = "US-CA"

# Green Window detection uses the cleanest band of each forecast rather than a
# global absolute cutoff. 0.35 means "points in the lowest 35% of this
# forecast's carbon-intensity range".
GREEN_WINDOW_THRESHOLD_RATIO = 0.35


def _validate_zone_id(zone_id: str) -> str:
    """Validate and normalise a zone identifier; reject unsupported zones."""
    if not isinstance(zone_id, str):
        raise ValueError("Grid zone must be a non-empty string.")
    cleaned = zone_id.strip()
    if not cleaned:
        raise ValueError("Grid zone must be a non-empty string.")
    if cleaned not in GRID_ZONES:
        supported = ", ".join(sorted(GRID_ZONES))
        raise ValueError(f"Unsupported grid zone '{cleaned}'. Supported zones: {supported}")
    return cleaned

# ---------------------------------------------------------------------------
# Simulation Engine
# ---------------------------------------------------------------------------

def _get_simulated_intensity(zone: dict, dt: datetime) -> int:
    """
    Compute simulated carbon intensity for a zone at a specific datetime.
    Mirrors the frontend getSimulatedIntensity() function exactly.
    """
    hours = dt.hour + dt.minute / 60.0
    zone_type = zone["type"]
    wave = 0.0

    if zone_type == "solar":
        wave = math.cos((2 * math.pi * (hours - 13)) / 24)
    elif zone_type == "wind":
        day = dt.day
        wave1 = math.sin((2 * math.pi * hours) / 18 + day)
        wave2 = 0.45 * math.cos((2 * math.pi * hours) / 6)
        wave = (wave1 + wave2) / 1.45
    elif zone_type == "nuclear":
        wave = 0.2 * math.sin((2 * math.pi * hours) / 24)
    elif zone_type == "coal":
        wave = -0.7 * math.cos((4 * math.pi * (hours - 8)) / 24)
    elif zone_type == "mixed":
        solar_dip = -0.6 * math.exp(-((hours - 13) ** 2) / 12)
        load_peak = 0.4 * math.sin((2 * math.pi * (hours - 8)) / 12)
        wave = solar_dip + load_peak

    intensity = zone["baseIntensity"] + wave * zone["amplitude"]

    # Deterministic pseudo-random jitter (same seed formula as frontend)
    seed = dt.minute + dt.second / 60.0
    pseudo_rand = math.sin(seed * 12.9898) * 43758.5453
    jitter = (pseudo_rand - math.floor(pseudo_rand) - 0.5) * zone["noise"] * 2
    intensity += jitter

    return max(5, round(intensity))


def generate_simulated_data(zone_id: str, offset_hours: float = 0.0) -> dict:
    """
    Generate a full simulated CarbonResponse for a zone.

    Args:
        zone_id: Grid zone identifier (e.g. 'IN', 'US-CA')
        offset_hours: Simulated time offset in hours from now

    Returns:
        CarbonResponse dict with current, history (12h), and forecast (24h)
    """
    zone = GRID_ZONES.get(zone_id, GRID_ZONES[_DEFAULT_ZONE_ID])
    now = datetime.now(timezone.utc) + timedelta(hours=offset_hours)

    current_intensity = _get_simulated_intensity(zone, now)
    current = {
        "datetime": now.isoformat(),
        "carbonIntensity": current_intensity,
    }

    history = []
    for i in range(12, 0, -1):
        hist_time = now - timedelta(hours=i)
        history.append({
            "datetime": hist_time.isoformat(),
            "carbonIntensity": _get_simulated_intensity(zone, hist_time),
        })

    forecast = []
    for i in range(24):
        fore_time = now + timedelta(hours=i)
        forecast.append({
            "datetime": fore_time.isoformat(),
            "carbonIntensity": _get_simulated_intensity(zone, fore_time),
        })

    return {
        "zone": zone["id"],
        "current": current,
        "history": history,
        "forecast": forecast,
        "isSimulated": True,
        "source": "simulation",
        "historySource": "simulation",
        "forecastSource": "simulation",
        "observedAt": now.isoformat(),
    }


# ---------------------------------------------------------------------------
# Live API Integration
# ---------------------------------------------------------------------------

_EMAPS_BASE = "https://api.electricitymap.org/v3"


def get_electricity_maps_api_key() -> str | None:
    """Return the Electricity Maps API key from environment, if configured."""
    key = os.getenv("ELECTRICITY_MAPS_API_KEY", "").strip()
    return key or None


def _fetch_live_data(zone_id: str, api_key: str) -> dict | None:
    """
    Fetch live carbon data from Electricity Maps API.
    Returns None on any error (caller falls back to simulation).
    """
    headers = {"auth-token": api_key}
    timeout = 8

    try:
        latest_res = requests.get(
            f"{_EMAPS_BASE}/carbon-intensity/latest",
            params={"zone": zone_id},
            headers=headers,
            timeout=timeout,
        )
        if not latest_res.ok:
            logger.error(
                "Electricity Maps latest API failed for zone %s: HTTP %s — %s",
                zone_id,
                latest_res.status_code,
                latest_res.text[:300],
            )
            return None

        latest_data = latest_res.json()
        observed_at = datetime.fromisoformat(
            str(latest_data["datetime"]).replace("Z", "+00:00")
        )
        intensity = latest_data["carbonIntensity"]
        if (
            observed_at.tzinfo is None
            or isinstance(intensity, bool)
            or not isinstance(intensity, (int, float))
            or not math.isfinite(intensity)
            or intensity < 0
        ):
            raise ValueError("Electricity Maps latest reading is invalid")
        observed_at = observed_at.astimezone(timezone.utc)

        current = {
            "datetime": observed_at.isoformat(),
            "carbonIntensity": intensity,
        }

        # A failed provider forecast is unavailable; do not synthesize a forecast
        # and present it as if it were API-derived.
        forecast_points = []
        forecast_source = "unavailable"
        try:
            forecast_res = requests.get(
                f"{_EMAPS_BASE}/carbon-intensity/forecast",
                params={"zone": zone_id},
                headers=headers,
                timeout=timeout,
            )
            if forecast_res.ok:
                fc_data = forecast_res.json()
                raw_forecast = fc_data.get("forecast", [])
                if not isinstance(raw_forecast, list):
                    raise ValueError("Electricity Maps forecast is not an array")
                for point in raw_forecast:
                    point_time = datetime.fromisoformat(
                        str(point["datetime"]).replace("Z", "+00:00")
                    )
                    point_intensity = point["carbonIntensity"]
                    if (
                        point_time.tzinfo is None
                        or isinstance(point_intensity, bool)
                        or not isinstance(point_intensity, (int, float))
                        or not math.isfinite(point_intensity)
                        or point_intensity < 0
                    ):
                        raise ValueError("Electricity Maps forecast point is invalid")
                    forecast_points.append({
                        "datetime": point_time.astimezone(timezone.utc).isoformat(),
                        "carbonIntensity": point_intensity,
                    })
                if forecast_points:
                    forecast_source = "electricity_maps_api"
            else:
                logger.warning(
                    "Electricity Maps forecast API failed for zone %s: HTTP %s — %s",
                    zone_id,
                    forecast_res.status_code,
                    forecast_res.text[:300],
                )
        except Exception as e:
            logger.warning("Forecast API failed for zone %s: %s", zone_id, e)
            forecast_points = []
            forecast_source = "unavailable"

        # History — simulate relative to live reading
        zone = GRID_ZONES.get(zone_id, GRID_ZONES[_DEFAULT_ZONE_ID])
        live_intensity = latest_data["carbonIntensity"]
        base_ratio = live_intensity / zone["baseIntensity"] if zone["baseIntensity"] > 0 else 1.0
        now_dt = observed_at
        history = []
        for i in range(12, 0, -1):
            hist_time = now_dt - timedelta(hours=i)
            sim_val = _get_simulated_intensity(zone, hist_time)
            history.append({
                "datetime": hist_time.isoformat(),
                "carbonIntensity": max(5, round(sim_val * base_ratio)),
            })

        return {
            "zone": zone_id,
            "current": current,
            "history": history,
            "forecast": forecast_points,
            "isSimulated": False,
            "source": "electricity_maps_api",
            "historySource": "simulation_scaled_from_api",
            "forecastSource": forecast_source,
            "observedAt": observed_at.isoformat(),
        }

    except requests.RequestException as e:
        logger.error("Electricity Maps network error for zone %s: %s", zone_id, e)
        return None
    except Exception as e:
        logger.error("Electricity Maps API error for zone %s: %s", zone_id, e)
        return None


def _simulation_fallback(zone_id: str, offset_hours: float, reason: str) -> dict:
    """Return simulated carbon data with an explanatory error field."""
    data = generate_simulated_data(zone_id, offset_hours)
    data["error"] = reason
    return data


# ---------------------------------------------------------------------------
# Green Window Detection
# ---------------------------------------------------------------------------

def detect_green_windows(
    forecast: list[dict],
    current_datetime: str,
    threshold: float = 180.0,
) -> list[dict]:
    """
    Detect contiguous low-carbon periods in a forecast array.

    A "green window" is any contiguous block of hourly forecast points in
    the cleanest band for this forecast. The threshold is derived from the
    forecast range, so high-carbon grids still surface their relatively
    cleanest periods instead of being compared to a global fixed cutoff.

    Args:
        forecast: List of {datetime, carbonIntensity} hourly points
        current_datetime: ISO timestamp for the current moment
        threshold: Kept for API compatibility; dynamic forecast threshold is used

    Returns:
        List of green window dicts with scoring info, sorted by start time
    """
    windows = []
    current_block: list[dict] = []
    window_count = 0

    def _is_valid_forecast_point(point: object) -> bool:
        intensity = point.get("carbonIntensity") if isinstance(point, dict) else None
        return (
            isinstance(point, dict)
            and not isinstance(intensity, bool)
            and isinstance(intensity, (int, float))
            and math.isfinite(intensity)
            and bool(point.get("datetime"))
        )

    valid_forecast = [
        point
        for point in forecast
        if _is_valid_forecast_point(point)
    ]
    forecast_values = [p["carbonIntensity"] for p in valid_forecast]
    if not forecast_values:
        logger.debug(
            "Green Window detection skipped: no valid forecast carbonIntensity values"
        )
        return windows

    forecast_min = min(forecast_values)
    forecast_actual_peak = max(forecast_values)
    forecast_peak = forecast_actual_peak
    forecast_peak = max(forecast_peak, 300)  # Minimum meaningful peak

    # A fixed 180 gCO2/kWh threshold was too region-specific: it worked for
    # low-carbon grids, but high-carbon grids such as Indian zones could have
    # valid forecasts and still return no Green Windows at all.
    #
    # Dynamic threshold:
    # 1. Find this forecast's minimum and maximum carbon intensity.
    # 2. Treat the cleanest configured band of that local range as green.
    #    With GREEN_WINDOW_THRESHOLD_RATIO = 0.35, a forecast ranging from
    #    560 to 740 gCO2/kWh has a threshold of 623.
    # 3. Detect contiguous points at or below that computed threshold.
    #
    # This is relative to local grid conditions, so low-carbon grids keep their
    # genuinely clean windows while high-carbon grids still surface their
    # cleanest available periods for carbon-aware scheduling.
    forecast_range = forecast_actual_peak - forecast_min
    if forecast_range <= 0:
        logger.debug(
            "Green Window detection skipped: forecast range has no lower-carbon band"
        )
        return windows
    dynamic_threshold = forecast_min + (
        forecast_range * GREEN_WINDOW_THRESHOLD_RATIO
    )

    for point in forecast:
        if (
            _is_valid_forecast_point(point)
            and point["carbonIntensity"] <= dynamic_threshold
        ):
            current_block.append(point)
        else:
            if current_block:
                window_count += 1
                windows.append(_build_window(
                    current_block, forecast_peak, window_count, current_datetime
                ))
                current_block = []

    if current_block:
        window_count += 1
        windows.append(_build_window(
            current_block, forecast_peak, window_count, current_datetime
        ))

    logger.debug(
        "Green Window detection: forecast_min=%s forecast_max=%s "
        "dynamic_threshold=%.2f windows_detected=%d",
        forecast_min,
        forecast_actual_peak,
        dynamic_threshold,
        len(windows),
    )

    return windows


def _build_window(
    points: list[dict],
    forecast_peak: float,
    window_id: int,
    current_datetime: str,
) -> dict:
    """Build a GreenWindow dict from a contiguous block of low-carbon points."""
    avg_intensity = sum(p["carbonIntensity"] for p in points) / len(points)
    # This percentage is relative to the forecast peak and is used only for
    # Green Window ranking. Potential activity savings must be calculated from
    # baseline/current carbon intensity versus this window's average intensity.
    savings_pct = max(
        0.0,
        min(100.0, ((forecast_peak - avg_intensity) / forecast_peak) * 100.0),
    )

    start_dt = datetime.fromisoformat(points[0]["datetime"].replace("Z", "+00:00"))
    start_hour = start_dt.hour

    # User convenience: overnight > daytime > evening
    if start_hour >= 22 or start_hour <= 5:
        user_convenience = 90
    elif 9 <= start_hour <= 17:
        user_convenience = 75
    else:
        user_convenience = 60

    return {
        "id": f"win-{window_id}",
        "startTime": points[0]["datetime"],
        "duration": len(points) * 60,  # 60 min per forecast point
        "avgCarbonIntensity": round(avg_intensity),
        "carbonSavingPercent": round(savings_pct, 1),
        "userConvenience": user_convenience,
        "detectedAt": current_datetime,
    }


# ---------------------------------------------------------------------------
# Public Interface
# ---------------------------------------------------------------------------

def get_carbon_data(
    zone_id: str,
    api_key: str | None = None,
    offset_hours: float = 0.0,
) -> dict:
    """
    Main entry point for obtaining carbon data.

    Tries live API first if a key is configured; explicitly labels simulated
    fallback data so callers can distinguish it from provider observations.
    """
    zone = _validate_zone_id(zone_id)
    resolved_key = api_key if api_key is not None else get_electricity_maps_api_key()

    try:
        if resolved_key:
            live_data = _fetch_live_data(zone, resolved_key)
            if live_data:
                logger.info("Using live Electricity Maps data for zone %s", zone)
                return live_data

            logger.warning(
                "Electricity Maps unavailable for zone %s — switching to simulation",
                zone,
            )
            return _simulation_fallback(
                zone,
                offset_hours,
                "Live Electricity Maps data unavailable; returned explicitly simulated data.",
            )

        logger.info("No ELECTRICITY_MAPS_API_KEY configured — using simulation for zone %s", zone)
        return generate_simulated_data(zone, offset_hours)

    except Exception as e:
        logger.exception("Unexpected error fetching carbon data for zone %s", zone)
        return _simulation_fallback(
            zone,
            offset_hours,
            f"Carbon data service error: {e}. Using simulated fallback.",
        )


def get_available_zones() -> list[dict]:
    """Return all supported grid zones."""
    return list(GRID_ZONES.values())
