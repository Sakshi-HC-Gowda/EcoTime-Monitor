"""
Tests for the Forecast endpoint simulated fallback behaviour.

Verifies that:
- Valid simulated fallback data produces a forecast response (HTTP 200).
- The response carries isSimulated, source, and forecastSource metadata.
- An empty forecast in non-simulated error data returns HTTP 503.
- A non-simulated error in carbon data still returns HTTP 503.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app import create_app
from extensions import db
from forecast.predict import ForecastPredictor


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


def register_user(client, email="forecast@example.com"):
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "first_name": "Forecast",
            "last_name": "Test",
            "organization_name": f"Org {email}",
        },
    )
    assert response.status_code == 201, response.get_data(as_text=True)
    return response.get_json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# -- Helpers ----------------------------------------------------------------

_NOW_ISO = datetime.now(timezone.utc).isoformat()


def _make_simulated_fallback(zone="IN-SO", num_points=36):
    """Mimics carbon_service._simulation_fallback() with valid forecast data."""
    forecast = []
    for i in range(num_points):
        forecast.append({
            "datetime": f"2026-10-24T{i % 24:02d}:00:00+00:00",
            "carbonIntensity": 600 + (i * 5) - (50 if 10 <= (i % 24) <= 14 else 0),
        })
    return {
        "zone": zone,
        "current": {"datetime": _NOW_ISO, "carbonIntensity": 640},
        "history": [
            {"datetime": f"2026-10-24T{h:02d}:00:00+00:00", "carbonIntensity": 620 + h}
            for h in range(12)
        ],
        "forecast": forecast,
        "isSimulated": True,
        "source": "simulation",
        "historySource": "simulation",
        "forecastSource": "simulation",
        "observedAt": _NOW_ISO,
        "error": "Live Electricity Maps data unavailable; returned explicitly simulated data.",
    }


def _make_non_simulated_error():
    """Carbon data with an error but NOT simulated — should be rejected."""
    return {
        "zone": "IN-SO",
        "current": {"datetime": _NOW_ISO, "carbonIntensity": 0},
        "history": [],
        "forecast": [],
        "isSimulated": False,
        "source": "electricity_maps_api",
        "error": "Unexpected API response format",
    }


def _mock_untrained_predictor():
    """Create a mock predictor that is NOT trained (uses carbon forecast)."""
    predictor = MagicMock()
    predictor.is_trained.return_value = False
    predictor._model_name = "simulation_fallback"
    predictor._trained_at = None
    # _validate_forecast should accept valid points without raising
    predictor._validate_forecast = MagicMock()
    return predictor


# -- Tests ------------------------------------------------------------------

@patch("routes.forecast.get_predictor")
@patch("routes.forecast.get_carbon_data")
def test_simulated_fallback_returns_forecast(mock_carbon, mock_pred, client):
    """When live API fails and simulation produces valid forecast,
    GET /api/forecast should return 200 with forecast points and isSimulated=True."""
    token = register_user(client)
    mock_carbon.return_value = _make_simulated_fallback(num_points=36)
    mock_pred.return_value = _mock_untrained_predictor()

    resp = client.get("/api/forecast?zone=IN-SO&hours=24", headers=auth(token))
    assert resp.status_code == 200, resp.get_data(as_text=True)

    body = resp.get_json()
    assert body["success"] is True
    data = body["data"]
    assert data["isSimulated"] is True
    assert data["source"] == "simulation"
    assert data["forecastSource"] == "simulation"
    assert isinstance(data["forecast"], list)
    assert len(data["forecast"]) == 24


@patch("routes.forecast.get_predictor")
@patch("routes.forecast.get_carbon_data")
def test_non_simulated_error_returns_503(mock_carbon, mock_pred, client):
    """When carbon data has a non-simulated error, return 503."""
    token = register_user(client)
    mock_carbon.return_value = _make_non_simulated_error()
    mock_pred.return_value = _mock_untrained_predictor()

    resp = client.get("/api/forecast?zone=IN-SO&hours=24", headers=auth(token))
    assert resp.status_code == 503

    body = resp.get_json()
    assert body["success"] is False
    assert "Unexpected API response format" in body["error"]


@patch("routes.forecast.get_predictor")
@patch("routes.forecast.get_carbon_data")
def test_simulated_response_includes_metadata(mock_carbon, mock_pred, client):
    """The response must include isSimulated, source, forecastSource, observedAt."""
    token = register_user(client)
    mock_carbon.return_value = _make_simulated_fallback(num_points=36)
    mock_pred.return_value = _mock_untrained_predictor()

    resp = client.get("/api/forecast?zone=IN-SO&hours=24", headers=auth(token))
    assert resp.status_code == 200

    data = resp.get_json()["data"]
    for key in ("isSimulated", "source", "forecastSource", "observedAt"):
        assert key in data, f"Missing key '{key}' in forecast response"


@patch("routes.forecast.get_predictor")
@patch("routes.forecast.get_carbon_data")
def test_empty_simulated_forecast_returns_503(mock_carbon, mock_pred, client):
    """Even with isSimulated=True, an empty forecast should return 503."""
    token = register_user(client)
    carbon = _make_simulated_fallback(num_points=0)
    carbon["forecast"] = []
    mock_carbon.return_value = carbon
    mock_pred.return_value = _mock_untrained_predictor()

    resp = client.get("/api/forecast?zone=IN-SO&hours=24", headers=auth(token))
    assert resp.status_code == 503

    body = resp.get_json()
    assert body["success"] is False
    assert "No forecast points" in body["error"]


@patch("routes.forecast.get_predictor")
@patch("routes.forecast.get_carbon_data")
def test_simulated_data_with_insufficient_history_uses_simulation_fallback(mock_carbon, mock_pred, client):
    """When a trained predictor is loaded but carbon data is simulated fallback with
    only 12 history points, the endpoint must NOT fail with 'at least 24 hourly history points'.
    Instead, it safely uses the simulation forecast fallback."""
    token = register_user(client, email="trained_fallback@example.com")
    mock_carbon.return_value = _make_simulated_fallback(zone="IN-SO", num_points=24)

    # Mock a trained predictor that would raise if predict() were called with < 24 points
    trained_pred = MagicMock()
    trained_pred.is_trained.return_value = True
    trained_pred._model_name = "RandomForest"
    trained_pred._trained_at = "2026-08-24T17:40:44+00:00"

    def fail_if_predict_called(**kwargs):
        history = kwargs.get("history", [])
        if len(history) < 24:
            raise ValueError("A trained forecast requires at least 24 hourly history points")
        return []

    trained_pred.predict.side_effect = fail_if_predict_called
    # _validate_forecast accepts the 24 points
    trained_pred._validate_forecast = MagicMock()
    mock_pred.return_value = trained_pred

    resp = client.get("/api/forecast?zone=IN-SO&hours=24", headers=auth(token))
    assert resp.status_code == 200, resp.get_data(as_text=True)

    body = resp.get_json()
    assert body["success"] is True
    data = body["data"]
    assert data["zone"] == "IN-SO"
    assert data["isSimulated"] is True
    assert data["source"] == "simulation"
    assert data["forecastSource"] == "simulation"
    assert len(data["forecast"]) == 24
    for point in data["forecast"]:
        assert point["isML"] is False

    # Verify predict() was NOT called with insufficient history
    trained_pred.predict.assert_not_called()


def test_normal_trained_model_validation():
    """Preserve the trained model's 24-hour history requirement for normal trained-model predictions.
    Validation must reject < 24 points, missing history, non-hourly intervals, and invalid intensities."""
    predictor = ForecastPredictor()
    predictor._model = MagicMock()  # Mark as trained

    base_time = datetime(2026, 10, 26, 12, 0, tzinfo=timezone.utc)

    # 1. Fewer than 24 points (12 points) must raise ValueError
    history_12 = [
        {
            "datetime": (base_time - timedelta(hours=i)).isoformat(),
            "carbonIntensity": 500 + i,
        }
        for i in range(12, 0, -1)
    ]
    with pytest.raises(ValueError, match="at least 24 hourly history points"):
        predictor.predict("US-CA", horizon_hours=24, history=history_12)

    # 2. None / empty history must raise ValueError when trained
    with pytest.raises(ValueError, match="requires observed history data"):
        predictor.predict("US-CA", horizon_hours=24, history=None)
    with pytest.raises(ValueError, match="requires observed history data"):
        predictor.predict("US-CA", horizon_hours=24, history=[])

    # 3. 24 points with invalid intensity
    history_invalid_intensity = [
        {
            "datetime": (base_time - timedelta(hours=i)).isoformat(),
            "carbonIntensity": -50 if i == 1 else 500,
        }
        for i in range(24, 0, -1)
    ]
    with pytest.raises(ValueError, match="invalid intensity"):
        predictor.predict("US-CA", horizon_hours=24, history=history_invalid_intensity)

    # 4. 24 points with non-hourly timestamp gap
    history_gap = [
        {
            "datetime": (base_time - timedelta(hours=i * 2)).isoformat(),
            "carbonIntensity": 500,
        }
        for i in range(24, 0, -1)
    ]
    with pytest.raises(ValueError, match="hourly and strictly increasing"):
        predictor.predict("US-CA", horizon_hours=24, history=history_gap)


@patch("routes.forecast.get_predictor")
@patch("routes.forecast.get_carbon_data")
def test_successful_forecast_response_with_trained_model_and_24h_history(mock_carbon, mock_pred, client):
    """When genuine live data provides >= 24 valid history points, the endpoint
    successfully uses the trained ML predictor and returns forecastSource='ml_model'."""
    token = register_user(client, email="trained_success@example.com")
    base_time = datetime(2026, 10, 26, 12, 0, tzinfo=timezone.utc)

    history_24 = [
        {
            "datetime": (base_time - timedelta(hours=i)).isoformat(),
            "carbonIntensity": 450 + i,
        }
        for i in range(24, 0, -1)
    ]
    mock_carbon.return_value = {
        "zone": "US-CA",
        "current": {"datetime": base_time.isoformat(), "carbonIntensity": 450},
        "history": history_24,
        "forecast": [],
        "isSimulated": False,
        "source": "electricity_maps_api",
        "historySource": "electricity_maps_api",
        "forecastSource": "electricity_maps_api",
        "observedAt": base_time.isoformat(),
    }

    ml_predictions = [
        {
            "datetime": (base_time + timedelta(hours=h)).isoformat(),
            "carbonIntensity": 400 + h * 2,
            "isML": True,
        }
        for h in range(1, 25)
    ]

    trained_pred = MagicMock()
    trained_pred.is_trained.return_value = True
    trained_pred._model_name = "RandomForest"
    trained_pred._trained_at = "2026-08-24T17:40:44+00:00"
    trained_pred.predict.return_value = ml_predictions
    mock_pred.return_value = trained_pred

    resp = client.get("/api/forecast?zone=US-CA&hours=24", headers=auth(token))
    assert resp.status_code == 200, resp.get_data(as_text=True)

    body = resp.get_json()
    assert body["success"] is True
    data = body["data"]
    assert data["zone"] == "US-CA"
    assert data["isSimulated"] is False
    assert data["forecastSource"] == "ml_model"
    assert len(data["forecast"]) == 24
    for point in data["forecast"]:
        assert point["isML"] is True

    trained_pred.predict.assert_called_once_with(
        zone_id="US-CA",
        horizon_hours=24,
        history=history_24,
    )


def test_end_to_end_successful_forecast_with_real_predictor_and_simulated_fallback(client):
    """End-to-end test using the real loaded ForecastPredictor and live service fallback:
    Electricity Maps 401 fallback triggers simulation data, and the Forecast route
    successfully returns 200 without raising history validation errors."""
    token = register_user(client, email="e2e_forecast@example.com")

    resp = client.get("/api/forecast?zone=IN-SO&hours=24", headers=auth(token))
    assert resp.status_code == 200, resp.get_data(as_text=True)

    body = resp.get_json()
    assert body["success"] is True
    data = body["data"]
    assert data["zone"] == "IN-SO"
    assert data["isSimulated"] is True
    assert data["source"] == "simulation"
    assert data["forecastSource"] == "simulation"
    assert len(data["forecast"]) == 24
    for point in data["forecast"]:
        assert point["isML"] is False
        assert "datetime" in point
        assert isinstance(point["carbonIntensity"], int)
    assert data["model"]["is_trained"] is True


def test_simulated_forecast_36_hours_live_fallback(client):
    """GET /api/forecast?zone=IN-SO&hours=36 must return 200 with 36 hourly forecast points
    when Electricity Maps fails and falls back to simulation."""
    token = register_user(client, email="hours36_live@example.com")

    resp = client.get("/api/forecast?zone=IN-SO&hours=36", headers=auth(token))
    assert resp.status_code == 200, resp.get_data(as_text=True)

    body = resp.get_json()
    assert body["success"] is True
    data = body["data"]
    assert data["zone"] == "IN-SO"
    assert data["isSimulated"] is True
    assert data["source"] == "simulation"
    assert data["forecastSource"] == "simulation"
    assert len(data["forecast"]) == 36

    # Verify all points are hourly, strictly increasing, valid intensity, and isML=False
    prev_dt = None
    for point in data["forecast"]:
        assert point["isML"] is False
        assert isinstance(point["carbonIntensity"], int)
        assert point["carbonIntensity"] >= 0
        cur_dt = datetime.fromisoformat(point["datetime"].replace("Z", "+00:00"))
        if prev_dt is not None:
            diff = (cur_dt - prev_dt).total_seconds()
            assert abs(diff - 3600) <= 60
        prev_dt = cur_dt


@patch("routes.forecast.get_carbon_data")
def test_simulated_forecast_extends_24_point_mock_to_36_hours(mock_carbon, client):
    """When a simulated fallback data source provides only 24 points, requesting 36 hours
    generates the additional clearly simulated hourly points via simulation logic."""
    token = register_user(client, email="hours36_extend@example.com")
    mock_carbon.return_value = _make_simulated_fallback(zone="IN-SO", num_points=24)

    resp = client.get("/api/forecast?zone=IN-SO&hours=36", headers=auth(token))
    assert resp.status_code == 200, resp.get_data(as_text=True)

    body = resp.get_json()
    assert body["success"] is True
    data = body["data"]
    assert len(data["forecast"]) == 36
    assert data["isSimulated"] is True
    for point in data["forecast"]:
        assert point["isML"] is False


@pytest.mark.parametrize("invalid_hours", [0, -5, 49, 100, "abc"])
def test_invalid_or_unsupported_horizons_rejected(invalid_hours, client):
    """Horizons outside 1-48 or non-integer values must be rejected with a clear error."""
    token = register_user(client, email=f"inv_hours_{invalid_hours}@example.com")

    resp = client.get(f"/api/forecast?zone=IN-SO&hours={invalid_hours}", headers=auth(token))
    assert resp.status_code in (400, 503)
    body = resp.get_json()
    assert body["success"] is False
    assert "horizon" in body["error"].lower()


@patch("routes.forecast.get_carbon_data")
def test_live_data_does_not_fabricate_missing_points(mock_carbon, client):
    """When non-simulated live data has fewer points than requested horizon,
    it must return an error rather than fabricating fake live points."""
    token = register_user(client, email="live_no_fake@example.com")
    now = datetime.now(timezone.utc)
    mock_carbon.return_value = {
        "zone": "IN-SO",
        "current": {"datetime": now.isoformat(), "carbonIntensity": 600},
        "history": [{"datetime": (now - timedelta(hours=i)).isoformat(), "carbonIntensity": 600} for i in range(12)],
        "forecast": [{"datetime": (now + timedelta(hours=i)).isoformat(), "carbonIntensity": 600} for i in range(24)],
        "isSimulated": False,
        "source": "electricity_maps_api",
        "forecastSource": "electricity_maps_api",
        "observedAt": now.isoformat(),
    }

    resp = client.get("/api/forecast?zone=IN-SO&hours=36", headers=auth(token))
    assert resp.status_code == 503
    body = resp.get_json()
    assert body["success"] is False
    assert "Only 24 forecast points are available; 36 requested" in body["error"]


