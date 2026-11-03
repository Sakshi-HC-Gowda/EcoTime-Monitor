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
    """Preserve the trained model's history requirement for normal trained-model predictions.
    Validation must reject short series, missing history, non-hourly intervals, and invalid intensities."""
    predictor = ForecastPredictor()
    predictor._model = MagicMock()  # Mark as trained

    base_time = datetime(2026, 10, 26, 12, 0, tzinfo=timezone.utc)

    # 1. Fewer than 25 points must raise ValueError (lag_24h needs 25 hourly rows)
    history_12 = [
        {
            "datetime": (base_time - timedelta(hours=i)).isoformat(),
            "carbonIntensity": 500 + i,
        }
        for i in range(12, 0, -1)
    ]
    with pytest.raises(ValueError, match="at least 25 hourly history points"):
        predictor.predict("US-CA", horizon_hours=24, history=history_12)

    history_24 = [
        {
            "datetime": (base_time - timedelta(hours=i)).isoformat(),
            "carbonIntensity": 500 + i,
        }
        for i in range(24, 0, -1)
    ]
    with pytest.raises(ValueError, match="at least 25 hourly history points"):
        predictor.predict("US-CA", horizon_hours=24, history=history_24)

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
        for i in range(25, 0, -1)
    ]
    with pytest.raises(ValueError, match="invalid intensity"):
        predictor.predict("US-CA", horizon_hours=24, history=history_invalid_intensity)

    # 4. 25 points with non-hourly timestamp gap
    history_gap = [
        {
            "datetime": (base_time - timedelta(hours=i * 2)).isoformat(),
            "carbonIntensity": 500,
        }
        for i in range(25, 0, -1)
    ]
    with pytest.raises(ValueError, match="hourly and strictly increasing"):
        predictor.predict("US-CA", horizon_hours=24, history=history_gap)


@patch("routes.forecast.get_predictor")
@patch("routes.forecast.get_carbon_data")
def test_successful_forecast_response_with_trained_model_and_24h_history(mock_carbon, mock_pred, client):
    """When genuine live data provides >= 25 valid history points and no provider
    forecast, the endpoint uses the trained ML predictor and returns forecastSource='ml_model'."""
    token = register_user(client, email="trained_success@example.com")
    base_time = datetime(2026, 10, 26, 12, 0, tzinfo=timezone.utc)

    history_25 = [
        {
            "datetime": (base_time - timedelta(hours=i)).isoformat(),
            "carbonIntensity": 450 + i,
        }
        for i in range(25, 0, -1)
    ]
    mock_carbon.return_value = {
        "zone": "US-CA",
        "current": {"datetime": base_time.isoformat(), "carbonIntensity": 450},
        "history": history_25,
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
        history=history_25,
    )


@patch("services.carbon_service._fetch_live_data", return_value=None)
def test_end_to_end_successful_forecast_with_real_predictor_and_simulated_fallback(
    _mock_live, client
):
    """End-to-end test using the real loaded ForecastPredictor and live service fallback:
    Electricity Maps unavailability triggers simulation data, and the Forecast route
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


@patch("services.carbon_service._fetch_live_data", return_value=None)
def test_simulated_forecast_36_hours_live_fallback(_mock_live, client):
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


def _make_live_carbon(
    zone="IN-SO",
    history_hours=12,
    forecast_hours=25,
    start=None,
):
    now = start or datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    history = [
        {
            "datetime": (now - timedelta(hours=i)).isoformat(),
            "carbonIntensity": 500 + i,
        }
        for i in range(history_hours, 0, -1)
    ]
    forecast = [
        {
            "datetime": (now + timedelta(hours=i)).isoformat(),
            "carbonIntensity": 600 + i,
        }
        for i in range(forecast_hours)
    ]
    return {
        "zone": zone,
        "current": {"datetime": now.isoformat(), "carbonIntensity": 550},
        "history": history,
        "forecast": forecast,
        "isSimulated": False,
        "source": "electricity_maps_api",
        "historySource": "simulation_scaled_from_api",
        "forecastSource": "electricity_maps_api",
        "observedAt": now.isoformat(),
    }


def _trained_predictor_that_extends():
    trained_pred = MagicMock()
    trained_pred.is_trained.return_value = True
    trained_pred._model_name = "RandomForest"
    trained_pred._trained_at = "2026-08-24T17:40:44+00:00"
    trained_pred._validate_history = ForecastPredictor._validate_history
    trained_pred._validate_forecast = ForecastPredictor._validate_forecast

    def fake_predict(zone_id, horizon_hours, history):
        ForecastPredictor._validate_history(history)
        last = datetime.fromisoformat(str(history[-1]["datetime"]).replace("Z", "+00:00"))
        return [
            {
                "datetime": (last + timedelta(hours=h)).isoformat(),
                "carbonIntensity": 900 + h,
                "isML": True,
            }
            for h in range(1, horizon_hours + 1)
        ]

    trained_pred.predict.side_effect = fake_predict
    return trained_pred


@patch("routes.forecast.get_predictor")
@patch("routes.forecast.get_carbon_data")
def test_complete_36_hour_forecast_from_provider(mock_carbon, mock_pred, client):
    """When the provider already has 36 valid future hours, return them all as live points."""
    token = register_user(client, email="live_36_full@example.com")
    mock_carbon.return_value = _make_live_carbon(forecast_hours=36)
    mock_pred.return_value = _mock_untrained_predictor()
    mock_pred.return_value._validate_forecast = ForecastPredictor._validate_forecast

    resp = client.get("/api/forecast?zone=IN-SO&hours=36", headers=auth(token))
    assert resp.status_code == 200, resp.get_data(as_text=True)
    data = resp.get_json()["data"]
    assert len(data["forecast"]) == 36
    assert data["forecastSource"] == "electricity_maps_api"
    assert data["isSimulated"] is False
    prev = None
    intensities = []
    for point in data["forecast"]:
        assert point["isML"] is False
        intensities.append(point["carbonIntensity"])
        cur = datetime.fromisoformat(point["datetime"].replace("Z", "+00:00"))
        if prev is not None:
            assert abs((cur - prev).total_seconds() - 3600) <= 60
        prev = cur
    assert len(set(intensities)) == 36


@patch("routes.forecast.get_predictor")
@patch("routes.forecast.get_carbon_data")
def test_25_provider_points_extended_by_trained_model(mock_carbon, mock_pred, client):
    """25 genuine Electricity Maps hours plus 11 model-generated hours must yield 36 points."""
    token = register_user(client, email="live_25_extend@example.com")
    carbon = _make_live_carbon(history_hours=12, forecast_hours=25)
    mock_carbon.return_value = carbon
    mock_pred.return_value = _trained_predictor_that_extends()

    resp = client.get("/api/forecast?zone=IN-SO&hours=36", headers=auth(token))
    assert resp.status_code == 200, resp.get_data(as_text=True)
    data = resp.get_json()["data"]
    forecast = data["forecast"]
    assert len(forecast) == 36
    assert data["forecastSource"] == "electricity_maps_api+ml_model"
    assert data["isSimulated"] is False

    provider_part = forecast[:25]
    model_part = forecast[25:]
    for point in provider_part:
        assert point["isML"] is False
        assert point["carbonIntensity"] < 900
    for point in model_part:
        assert point["isML"] is True
        assert point["carbonIntensity"] >= 901

    last_provider = carbon["forecast"][-1]["carbonIntensity"]
    assert model_part[0]["carbonIntensity"] != last_provider

    prev = None
    for point in forecast:
        cur = datetime.fromisoformat(point["datetime"].replace("Z", "+00:00"))
        if prev is not None:
            assert abs((cur - prev).total_seconds() - 3600) <= 60
        prev = cur

    mock_pred.return_value.predict.assert_called_once()
    call_kwargs = mock_pred.return_value.predict.call_args.kwargs
    assert call_kwargs["horizon_hours"] == 11
    assert len(call_kwargs["history"]) == 25


@patch("routes.forecast.get_predictor")
@patch("routes.forecast.get_carbon_data")
def test_historical_provider_point_is_not_returned_as_forecast(
    mock_carbon, mock_pred, client
):
    """Provider observations before the live reading must not be relabeled as future data."""
    token = register_user(client, email="live_historical_point@example.com")
    carbon = _make_live_carbon(forecast_hours=25)
    observed = datetime.fromisoformat(carbon["observedAt"])
    carbon["forecast"][0]["datetime"] = (observed - timedelta(hours=1)).isoformat()
    mock_carbon.return_value = carbon
    mock_pred.return_value = _trained_predictor_that_extends()

    resp = client.get("/api/forecast?zone=IN-SO&hours=36", headers=auth(token))

    assert resp.status_code == 200, resp.get_data(as_text=True)
    forecast = resp.get_json()["data"]["forecast"]
    assert len(forecast) == 36
    assert all(
        datetime.fromisoformat(point["datetime"].replace("Z", "+00:00")) >= observed
        for point in forecast
    )
    assert sum(point["isML"] for point in forecast) == 12


@patch("routes.forecast.get_predictor")
@patch("routes.forecast.get_carbon_data")
def test_untrained_model_does_not_fabricate_missing_live_points(mock_carbon, mock_pred, client):
    """Without a trained model, a short live provider forecast must error instead of padding."""
    token = register_user(client, email="live_no_fake@example.com")
    mock_carbon.return_value = _make_live_carbon(forecast_hours=25)
    mock_pred.return_value = _mock_untrained_predictor()
    mock_pred.return_value._validate_forecast = ForecastPredictor._validate_forecast

    resp = client.get("/api/forecast?zone=IN-SO&hours=36", headers=auth(token))
    assert resp.status_code == 503
    body = resp.get_json()
    assert body["success"] is False
    assert "Only 25 forecast points are available; 36 requested" in body["error"]


@patch("routes.forecast.get_predictor")
@patch("routes.forecast.get_carbon_data")
def test_insufficient_history_for_model_extension(mock_carbon, mock_pred, client):
    """A trained model must not be used when there is no 24-hour consecutive input window."""
    token = register_user(client, email="live_short_hist@example.com")
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    mock_carbon.return_value = {
        "zone": "IN-SO",
        "current": {"datetime": now.isoformat(), "carbonIntensity": 550},
        "history": [
            {"datetime": (now - timedelta(hours=i)).isoformat(), "carbonIntensity": 500}
            for i in range(3, 0, -1)
        ],
        "forecast": [
            {"datetime": (now + timedelta(hours=i)).isoformat(), "carbonIntensity": 600 + i}
            for i in range(8)
        ],
        "isSimulated": False,
        "source": "electricity_maps_api",
        "forecastSource": "electricity_maps_api",
        "observedAt": now.isoformat(),
    }
    trained = _trained_predictor_that_extends()
    mock_pred.return_value = trained

    resp = client.get("/api/forecast?zone=IN-SO&hours=36", headers=auth(token))
    assert resp.status_code == 503
    body = resp.get_json()
    assert body["success"] is False
    assert "insufficient consecutive hourly history" in body["error"]
    trained.predict.assert_not_called()


@patch("routes.forecast.get_predictor")
@patch("routes.forecast.get_carbon_data")
def test_model_extension_failure_is_distinct_from_provider_gap(mock_carbon, mock_pred, client):
    token = register_user(client, email="ml_fail@example.com")
    mock_carbon.return_value = _make_live_carbon(forecast_hours=25)
    trained = _trained_predictor_that_extends()

    def boom(**kwargs):
        raise ValueError("Forecast feature row 1 contains missing values")

    trained.predict.side_effect = boom
    mock_pred.return_value = trained

    resp = client.get("/api/forecast?zone=IN-SO&hours=36", headers=auth(token))
    assert resp.status_code == 503
    body = resp.get_json()
    assert "Trained model failed to extend the forecast" in body["error"]
    assert "missing values" in body["error"]


def test_ml_forecast_timestamps_continue_from_last_history_hour():
    """Recursive ML steps must be last_history+1h, not wall-clock now."""
    import pandas as pd
    from forecast.feature_engineering import get_feature_names

    predictor = ForecastPredictor.__new__(ForecastPredictor)
    predictor._model = MagicMock()
    predictor._model.predict.return_value = [412.0]
    predictor._feature_names = get_feature_names()
    predictor._model_name = "RandomForest"

    feature_row = pd.DataFrame(
        [[0.0] * len(predictor._feature_names)],
        columns=predictor._feature_names,
    )

    def fake_features(**kwargs):
        return feature_row

    from forecast import predict as predict_module
    original = predict_module.build_inference_features
    predict_module.build_inference_features = fake_features
    try:
        base = datetime(2026, 11, 2, 10, 0, tzinfo=timezone.utc)
        history = [
            {
                "datetime": (base + timedelta(hours=i)).isoformat(),
                "carbonIntensity": 400 + i,
            }
            for i in range(25)
        ]
        out = predictor._ml_forecast(history, "IN-SO", 3)
    finally:
        predict_module.build_inference_features = original

    assert len(out) == 3
    last_hist = base + timedelta(hours=24)
    for index, point in enumerate(out, start=1):
        expected = last_hist + timedelta(hours=index)
        actual = datetime.fromisoformat(point["datetime"].replace("Z", "+00:00"))
        assert actual == expected
        assert point["isML"] is True
        assert point["carbonIntensity"] == 412

