from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from forecast.predict import ForecastPredictor
from routes.forecast import _provider_fallback_forecast


def _hourly_points(count: int = 25) -> list[dict]:
    start = datetime(2026, 11, 15, 0, tzinfo=timezone.utc)
    return [
        {
            "datetime": (start + timedelta(hours=index)).isoformat(),
            "carbonIntensity": 500 + index,
        }
        for index in range(count)
    ]


def test_recursive_prediction_preserves_complete_feature_rows():
    predictor = ForecastPredictor()
    predictor._model = MagicMock()
    predictor._model.predict.return_value = [550]

    forecast = predictor.predict(
        zone_id="IN-SO",
        horizon_hours=3,
        history=_hourly_points(),
    )

    assert len(forecast) == 3
    assert all(point["isML"] is True for point in forecast)


def test_provider_forecast_is_returned_when_ml_extension_fails():
    provider_forecast = _hourly_points(2)
    predictor = MagicMock()
    returned, source = _provider_fallback_forecast(
        provider_forecast,
        {"forecastSource": "electricity_maps_api"},
        predictor,
    )

    assert source == "electricity_maps_api"
    assert returned == [{**point, "isML": False} for point in provider_forecast]
    predictor._validate_forecast.assert_called_once_with(returned, 2)
