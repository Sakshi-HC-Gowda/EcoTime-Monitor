from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from services import optimizer_service
from services.carbon_service import (
    DEFAULT_GREEN_WINDOW_THRESHOLD,
    detect_green_windows,
)


def _carbon(zone: str, forecast_start: datetime) -> dict:
    forecast = [
        {
            "datetime": (forecast_start + timedelta(hours=index)).isoformat(),
            "carbonIntensity": value,
        }
        for index, value in enumerate((500, 100, 500))
    ]
    current = forecast_start - timedelta(hours=1)
    return {
        "zone": zone,
        "current": {
            "datetime": current.isoformat(),
            "carbonIntensity": 500,
        },
        "history": [],
        "forecast": forecast,
        "isSimulated": True,
        "source": "simulation",
        "forecastSource": "simulation",
        "observedAt": current.isoformat(),
    }


def _task(task_id: str = "activity-1") -> dict:
    return {
        "id": task_id,
        "name": "Update",
        "type": "flexible",
        "status": "pending",
        "duration": 30,
        "powerDraw": 100,
        "priorityScore": 30,
        "flexibilityScore": 80,
    }


def _recommendation(monkeypatch, zone: str, forecast_start: datetime) -> dict:
    monkeypatch.setattr(
        optimizer_service,
        "get_carbon_data",
        lambda **_: _carbon(zone, forecast_start),
    )
    return optimizer_service.recommend_schedule(
        tasks=[_task()],
        permitted_window=None,
        method="greedy",
        baseline_intensity=600,
        zone_id=zone,
    )


def test_recommended_window_can_be_selected_again_for_in_so(monkeypatch):
    start = datetime.now(timezone.utc).replace(minute=0, second=1, microsecond=0) + timedelta(hours=1)
    recommendation = _recommendation(monkeypatch, "IN-SO", start)
    window_id = recommendation["recommendations"][0]["windowId"]

    approved = _recommendation(monkeypatch, "IN-SO", start)

    assert recommendation["recommendations"][0]["status"] == "scheduled"
    assert approved["recommendations"][0]["windowId"] == window_id


def test_recommended_window_can_be_selected_for_another_supported_zone(monkeypatch):
    start = datetime.now(timezone.utc).replace(minute=0, second=1, microsecond=0) + timedelta(hours=1)
    recommendation = _recommendation(monkeypatch, "US-CA", start)
    window_id = recommendation["recommendations"][0]["windowId"]

    approved = optimizer_service.recommend_schedule(
        tasks=[_task()],
        permitted_window=None,
        method="greedy",
        baseline_intensity=600,
        zone_id="US-CA",
        permitted_window_id=window_id,
    )

    assert approved["recommendations"][0]["status"] == "scheduled"
    assert approved["recommendations"][0]["windowId"] == window_id


def test_window_from_different_zone_is_rejected(monkeypatch):
    start = datetime.now(timezone.utc).replace(minute=0, second=1, microsecond=0) + timedelta(hours=1)
    in_so = _recommendation(monkeypatch, "IN-SO", start)
    monkeypatch.setattr(
        optimizer_service,
        "get_carbon_data",
        lambda **_: _carbon("US-CA", start),
    )

    with pytest.raises(ValueError, match="selected Green Window"):
        optimizer_service.recommend_schedule(
            tasks=[_task()],
            permitted_window=None,
            method="greedy",
            baseline_intensity=600,
            zone_id="US-CA",
            permitted_window_id=in_so["recommendations"][0]["windowId"],
        )


def test_stale_window_id_is_rejected(monkeypatch):
    start = datetime.now(timezone.utc).replace(minute=0, second=1, microsecond=0) + timedelta(hours=1)

    with pytest.raises(ValueError, match="selected Green Window"):
        _recommendation(monkeypatch, "IN-SO", start)
        optimizer_service.recommend_schedule(
            tasks=[_task()],
            permitted_window=None,
            method="greedy",
            baseline_intensity=600,
            zone_id="IN-SO",
            permitted_window_id="IN-SO:win-stale",
        )


def test_window_ids_ignore_refresh_seconds_but_change_with_zone(monkeypatch):
    first = datetime.now(timezone.utc).replace(minute=0, second=1, microsecond=0) + timedelta(hours=1)
    second = first + timedelta(seconds=58)

    first_windows = detect_green_windows(
        _carbon("IN-SO", first)["forecast"],
        first.isoformat(),
    )
    second_windows = detect_green_windows(
        _carbon("IN-SO", second)["forecast"],
        second.isoformat(),
    )

    assert first_windows[0]["id"] == second_windows[0]["id"]


def test_green_window_threshold_is_absolute_and_inclusive():
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    forecast = [
        {"datetime": (start + timedelta(hours=index)).isoformat(), "carbonIntensity": value}
        for index, value in enumerate((179, 180, 181, 180))
    ]

    windows = detect_green_windows(forecast, start.isoformat(), threshold=180)

    assert len(windows) == 2
    assert windows[0]["duration"] == 120
    assert windows[1]["duration"] == 60
    assert windows[0]["avgCarbonIntensity"] == 180
    assert windows[1]["avgCarbonIntensity"] == 180


def test_default_green_window_threshold_matches_documented_policy():
    assert DEFAULT_GREEN_WINDOW_THRESHOLD == 380
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    forecast = [
        {"datetime": (start + timedelta(hours=index)).isoformat(), "carbonIntensity": value}
        for index, value in enumerate((379, 380, 381))
    ]

    windows = detect_green_windows(forecast, start.isoformat())

    assert len(windows) == 1
    assert windows[0]["duration"] == 120
