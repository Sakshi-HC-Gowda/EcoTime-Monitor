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
    }


# ---------------------------------------------------------------------------
# Live API Integration
# ---------------------------------------------------------------------------

_EMAPS_BASE = "https://api.electricitymap.org/v3"


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
        latest_res.raise_for_status()
        latest_data = latest_res.json()

        current = {
            "datetime": latest_data["datetime"],
            "carbonIntensity": latest_data["carbonIntensity"],
        }

        # Attempt forecast
        forecast_points = []
        try:
            forecast_res = requests.get(
                f"{_EMAPS_BASE}/carbon-intensity/forecast",
                params={"zone": zone_id},
                headers=headers,
                timeout=timeout,
            )
            if forecast_res.ok:
                fc_data = forecast_res.json()
                forecast_points = [
                    {"datetime": f["datetime"], "carbonIntensity": f["carbonIntensity"]}
                    for f in fc_data.get("forecast", [])
                ]
        except Exception as e:
            logger.warning("Forecast API failed: %s — using simulated forecast", e)

        # Fill missing forecast with simulation scaled to live baseline
        if not forecast_points:
            zone = GRID_ZONES.get(zone_id, GRID_ZONES[_DEFAULT_ZONE_ID])
            live_intensity = latest_data["carbonIntensity"]
            base_ratio = live_intensity / zone["baseIntensity"] if zone["baseIntensity"] > 0 else 1.0
            now_dt = datetime.fromisoformat(latest_data["datetime"].replace("Z", "+00:00"))
            for i in range(24):
                fore_time = now_dt + timedelta(hours=i)
                sim_val = _get_simulated_intensity(zone, fore_time)
                forecast_points.append({
                    "datetime": fore_time.isoformat(),
                    "carbonIntensity": max(5, round(sim_val * base_ratio)),
                })

        # History — simulate relative to live reading
        zone = GRID_ZONES.get(zone_id, GRID_ZONES[_DEFAULT_ZONE_ID])
        live_intensity = latest_data["carbonIntensity"]
        base_ratio = live_intensity / zone["baseIntensity"] if zone["baseIntensity"] > 0 else 1.0
        now_dt = datetime.fromisoformat(latest_data["datetime"].replace("Z", "+00:00"))
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
        }

    except Exception as e:
        logger.error("Electricity Maps API error for zone %s: %s", zone_id, e)
        return None


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

    A "green window" is any contiguous block of hourly forecast points
    where carbonIntensity < threshold.

    Args:
        forecast: List of {datetime, carbonIntensity} hourly points
        current_datetime: ISO timestamp for the current moment
        threshold: Carbon intensity threshold (gCO2e/kWh) below which it's "green"

    Returns:
        List of green window dicts with scoring info, sorted by start time
    """
    windows = []
    current_block: list[dict] = []
    window_count = 0

    forecast_peak = max((p["carbonIntensity"] for p in forecast), default=300)
    forecast_peak = max(forecast_peak, 300)  # Minimum meaningful peak

    for point in forecast:
        if point["carbonIntensity"] < threshold:
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

    return windows


def _build_window(
    points: list[dict],
    forecast_peak: float,
    window_id: int,
    current_datetime: str,
) -> dict:
    """Build a GreenWindow dict from a contiguous block of low-carbon points."""
    avg_intensity = sum(p["carbonIntensity"] for p in points) / len(points)
    savings_pct = max(5.0, ((forecast_peak - avg_intensity) / forecast_peak) * 100.0)

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

    Tries live API first if api_key is provided; falls back to simulation.

    Args:
        zone_id: Grid zone identifier
        api_key: Electricity Maps API key (optional)
        offset_hours: Simulation time offset in hours

    Returns:
        CarbonResponse dict
    """
    if api_key:
        live_data = _fetch_live_data(zone_id, api_key)
        if live_data:
            logger.info("Using live Electricity Maps data for zone %s", zone_id)
            return live_data
        logger.warning("Falling back to simulation for zone %s", zone_id)

    return generate_simulated_data(zone_id, offset_hours)


def get_available_zones() -> list[dict]:
    """Return all supported grid zones."""
    return list(GRID_ZONES.values())
