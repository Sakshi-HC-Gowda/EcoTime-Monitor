"""
Tests for the Green Window endpoint fallback behaviour.

Verifies that:
- Valid simulated fallback data produces usable green windows (HTTP 200).
- The response carries isSimulated, source, and forecastSource metadata.
- An empty forecast returns HTTP 503 with a clear error.
- A non-simulated error in carbon data still returns HTTP 503.
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from app import create_app
from extensions import db


# -- Fixtures ---------------------------------------------------------------

@pytest.fixture
def app():
    app = create_app("testing")
    with app.app_context():
        db.drop_all()
        db.create_all()
    yield app
    with app.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


def register_user(client, email="greenwin@example.com"):
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "first_name": "Green",
            "last_name": "Window",
            "organization_name": f"Org {email}",
        },
    )
    assert response.status_code == 201, response.get_data(as_text=True)
    return response.get_json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# -- Helpers ----------------------------------------------------------------

_NOW_ISO = datetime.now(timezone.utc).isoformat()


def _make_simulated_fallback(zone="IN-SO"):
    """
    Mimics the dict returned by carbon_service._simulation_fallback():
    valid forecast data + isSimulated=True + informational error field.
    """
    forecast = []
    for i in range(24):
        forecast.append({
            "datetime": f"2026-10-24T{i:02d}:00:00+00:00",
            "carbonIntensity": 600 + (i * 5) - (50 if 10 <= i <= 14 else 0),
        })
    return {
        "zone": zone,
        "current": {
            "datetime": _NOW_ISO,
            "carbonIntensity": 640,
        },
        "history": [],
        "forecast": forecast,
        "isSimulated": True,
        "source": "simulation",
        "historySource": "simulation",
        "forecastSource": "simulation",
        "observedAt": _NOW_ISO,
        "error": "Live Electricity Maps data unavailable; returned explicitly simulated data.",
    }


def _make_empty_forecast_fallback(zone="IN-SO"):
    """Simulated data with an empty forecast — should NOT produce windows."""
    return {
        "zone": zone,
        "current": {
            "datetime": _NOW_ISO,
            "carbonIntensity": 640,
        },
        "history": [],
        "forecast": [],
        "isSimulated": True,
        "source": "simulation",
        "historySource": "simulation",
        "forecastSource": "simulation",
        "observedAt": _NOW_ISO,
        "error": "Live data unavailable; simulated fallback returned empty forecast.",
    }


def _make_non_simulated_error():
    """A carbon data dict with an error but NOT simulated — should be rejected."""
    return {
        "zone": "IN-SO",
        "current": {
            "datetime": _NOW_ISO,
            "carbonIntensity": 0,
        },
        "history": [],
        "forecast": [],
        "isSimulated": False,
        "source": "electricity_maps_api",
        "error": "Unexpected API response format",
    }


# -- Tests ------------------------------------------------------------------

@patch("routes.carbon.get_carbon_data")
def test_simulated_fallback_returns_green_windows(mock_get_carbon, client):
    """When live API fails and simulation produces valid forecast data,
    GET /api/windows should return 200 with green windows and isSimulated=True."""
    token = register_user(client)
    mock_get_carbon.return_value = _make_simulated_fallback()

    resp = client.get("/api/windows?zone=IN-SO&threshold=180", headers=auth(token))
    assert resp.status_code == 200, resp.get_data(as_text=True)

    body = resp.get_json()
    assert body["success"] is True
    assert body["isSimulated"] is True
    assert body["source"] == "simulation"
    assert body["forecastSource"] == "simulation"
    assert isinstance(body["data"], list)
    # The simulated forecast has a clear dip at hours 10-14, so at least
    # one green window should be detected.
    assert body["count"] >= 1


@patch("routes.carbon.get_carbon_data")
def test_empty_forecast_returns_503(mock_get_carbon, client):
    """When the fallback produces no forecast points, the endpoint should
    return 503 rather than silently returning empty windows."""
    token = register_user(client)
    mock_get_carbon.return_value = _make_empty_forecast_fallback()

    resp = client.get("/api/windows?zone=IN-SO&threshold=180", headers=auth(token))
    assert resp.status_code == 503

    body = resp.get_json()
    assert body["success"] is False
    assert "No forecast data" in body["error"]


@patch("routes.carbon.get_carbon_data")
def test_non_simulated_error_returns_503(mock_get_carbon, client):
    """When carbon data has an error field but is NOT simulated, the endpoint
    should reject it as before — returning 503."""
    token = register_user(client)
    mock_get_carbon.return_value = _make_non_simulated_error()

    resp = client.get("/api/windows?zone=IN-SO&threshold=180", headers=auth(token))
    assert resp.status_code == 503

    body = resp.get_json()
    assert body["success"] is False
    assert "Unexpected API response format" in body["error"]


@patch("routes.carbon.get_carbon_data")
def test_simulated_response_includes_source_metadata(mock_get_carbon, client):
    """The response must include isSimulated, source, forecastSource, and
    observedAt so frontends can display a simulated-data indicator."""
    token = register_user(client)
    mock_get_carbon.return_value = _make_simulated_fallback()

    resp = client.get("/api/windows?zone=IN-SO", headers=auth(token))
    assert resp.status_code == 200

    body = resp.get_json()
    for key in ("isSimulated", "source", "forecastSource", "observedAt"):
        assert key in body, f"Missing key '{key}' in response"
