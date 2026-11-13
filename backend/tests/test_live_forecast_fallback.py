"""Green Windows must use the trained model when a live provider returns no forecast."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from app import create_app
from extensions import db


@pytest.fixture
def client():
    app = create_app("testing")
    with app.app_context():
        db.drop_all()
        db.create_all()
    yield app.test_client()
    with app.app_context():
        db.session.remove()
        db.drop_all()


def _token(client):
    r = client.post("/api/auth/register", json={
        "email": "live@example.com", "password": "Password123!",
        "first_name": "L", "last_name": "V", "organization_name": "Live Org",
    })
    return {"Authorization": f"Bearer {r.get_json()['token']}"}


def _live_carbon_without_forecast():
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    history = [
        {"datetime": (now - timedelta(hours=24 - i)).isoformat(), "carbonIntensity": 500 + (i % 12) * 10}
        for i in range(25)
    ]
    return {
        "zone": "IN-SO", "isSimulated": False, "source": "electricity_maps_api",
        "observedAt": now.isoformat(), "forecastSource": "unavailable",
        "current": {"datetime": now.isoformat(), "carbonIntensity": 560},
        "history": history, "forecast": [],
    }


def _ml_forecast():
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    return [
        {"datetime": (now + timedelta(hours=i + 1)).isoformat(),
         "carbonIntensity": 560 - (60 if 4 <= i <= 8 else 0) + i, "isML": True}
        for i in range(24)
    ]


def test_windows_use_ml_model_when_live_provider_has_no_forecast(client):
    headers = _token(client)
    with patch("routes.carbon.get_carbon_data", return_value=_live_carbon_without_forecast()), \
         patch("forecast.predict.ForecastPredictor.is_trained", return_value=True), \
         patch("forecast.predict.ForecastPredictor._validate_history", return_value=None), \
         patch("forecast.predict.ForecastPredictor.predict", return_value=_ml_forecast()):
        response = client.get("/api/windows?zone=IN-SO", headers=headers)
    body = response.get_json()
    assert response.status_code == 200, body
    assert body["forecastSource"] == "ml_model"
    assert body["isSimulated"] is False
    assert body["count"] >= 1


def test_windows_still_fail_clearly_without_model_or_forecast(client):
    headers = _token(client)
    with patch("routes.carbon.get_carbon_data", return_value=_live_carbon_without_forecast()), \
         patch("forecast.predict.ForecastPredictor.is_trained", return_value=False):
        response = client.get("/api/windows?zone=IN-SO", headers=headers)
    assert response.status_code == 503
