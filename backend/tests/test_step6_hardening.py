from __future__ import annotations

from datetime import datetime, timedelta, timezone
from io import BytesIO

import pytest
from flask_jwt_extended import create_access_token

from app import create_app
from extensions import db
from models.activity import Activity
from models.upload_registration import UploadRegistration
from services import optimizer_service, upload_service


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


@pytest.fixture(autouse=True)
def isolated_upload_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(upload_service, "UPLOAD_ROOT", tmp_path / "uploads")


def register_user(client, email="step6@example.com"):
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "first_name": "Step",
            "last_name": "Six",
            "organization_name": f"Org {email}",
        },
    )
    assert response.status_code == 201, response.get_data(as_text=True)
    return response.get_json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def make_activity(client, token, **updates):
    response = client.post(
        "/api/activities",
        headers=auth(token),
        json={
            "name": "Hardening test activity",
            "type": "flexible",
            "activityType": "file-upload",
            "duration": 10,
            **updates,
        },
    )
    assert response.status_code == 201, response.get_data(as_text=True)
    return response.get_json()["data"]


def test_activity_registration_rejects_non_object_and_invalid_numbers(client):
    token = register_user(client)
    headers = auth(token)
    for payload in (
        [],
        {"name": "invalid duration", "type": "flexible", "duration": float("nan")},
        {"name": "invalid score", "type": "flexible", "duration": 10, "priorityScore": -1},
        {"name": "infinite power", "type": "flexible", "duration": 10, "powerDraw": float("inf")},
    ):
        response = client.post("/api/activities", headers=headers, json=payload)
        assert response.status_code == 400
        assert response.get_json()["success"] is False
        assert response.get_json()["error"]


def test_expired_jwt_returns_clear_401(client, app):
    with app.app_context():
        expired = create_access_token("expired-user", expires_delta=timedelta(seconds=-1))
    response = client.get("/api/activities", headers=auth(expired))
    assert response.status_code == 401
    assert "expired" in response.get_json()["error"].lower()


def test_activity_idempotency_replays_and_rejects_key_reuse(client):
    token = register_user(client)
    payload = {
        "name": "One logical activity",
        "type": "flexible",
        "duration": 10,
    }
    headers = {**auth(token), "Idempotency-Key": "activity-create-1"}
    first = client.post("/api/activities", headers=headers, json=payload)
    replay = client.post("/api/activities", headers=headers, json=payload)
    mismatch = client.post(
        "/api/activities",
        headers=headers,
        json={**payload, "duration": 20},
    )
    assert first.status_code == 201
    assert replay.status_code == 200
    assert replay.get_json()["data"]["id"] == first.get_json()["data"]["id"]
    assert mismatch.status_code == 409
    with client.application.app_context():
        assert Activity.query.count() == 1


def test_direct_activity_api_cannot_bypass_optimizer_scheduling(client):
    token = register_user(client)
    activity = make_activity(client, token)
    response = client.patch(
        f"/api/activities/{activity['id']}",
        headers=auth(token),
        json={"status": "scheduled", "scheduledStartTime": datetime.now(timezone.utc).isoformat()},
    )
    assert response.status_code == 400
    assert "optimizer" in response.get_json()["error"].lower()
    with client.application.app_context():
        assert db.session.get(Activity, activity["id"]).status == "pending"
    upload_state_change = client.patch(
        f"/api/activities/{activity['id']}",
        headers=auth(token),
        json={"status": "pending"},
    )
    assert upload_state_change.status_code == 400
    assert "upload workflow" in upload_state_change.get_json()["error"].lower()


def test_bulk_update_is_atomic_and_does_not_report_partial_success(client):
    token = register_user(client)
    first = make_activity(client, token)
    second = make_activity(client, token, name="Second activity")
    response = client.post(
        "/api/activities/bulk",
        headers=auth(token),
        json={"updates": [
            {"id": first["id"], "status": "pending"},
            {"id": second["id"], "status": "scheduled"},
        ]},
    )
    assert response.status_code == 400
    assert response.get_json()["success"] is False
    with client.application.app_context():
        assert db.session.get(Activity, first["id"]).status == "pending"
        assert db.session.get(Activity, second["id"]).status == "pending"


def test_activity_database_failure_returns_500_not_success(client, monkeypatch):
    token = register_user(client)

    def fail_commit():
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(db.session, "commit", fail_commit)
    response = client.post(
        "/api/activities",
        headers=auth(token),
        json={"name": "Persistence failure", "type": "flexible", "duration": 10},
    )
    assert response.status_code == 500
    assert response.get_json()["success"] is False


def test_upload_idempotency_replays_same_file_and_rejects_changed_file(client):
    token = register_user(client)
    activity = make_activity(client, token)
    headers = {**auth(token), "Idempotency-Key": "upload-register-1"}

    def upload(content):
        return client.post(
            "/api/upload",
            headers=headers,
            data={
                "activityId": activity["id"],
                "file": (BytesIO(content), "dataset.csv", "text/csv"),
            },
            content_type="multipart/form-data",
        )

    first = upload(b"a,b\n1,2\n")
    replay = upload(b"a,b\n1,2\n")
    mismatch = upload(b"a,b\n3,4\n")
    assert first.status_code == 201
    assert replay.status_code == 200
    assert replay.get_json()["data"]["id"] == first.get_json()["data"]["id"]
    assert mismatch.status_code == 409
    with client.application.app_context():
        assert UploadRegistration.query.count() == 1


def test_upload_database_failure_returns_500_and_no_registration(client, monkeypatch):
    token = register_user(client)
    activity = make_activity(client, token)

    def fail_commit():
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(db.session, "commit", fail_commit)
    response = client.post(
        "/api/upload",
        headers=auth(token),
        data={
            "activityId": activity["id"],
            "file": (BytesIO(b"a,b\n1,2\n"), "dataset.csv", "text/csv"),
        },
        content_type="multipart/form-data",
    )
    assert response.status_code == 500
    assert response.get_json()["success"] is False
    monkeypatch.undo()
    with client.application.app_context():
        assert UploadRegistration.query.count() == 0


def test_upload_execution_database_failure_does_not_report_completion(client, monkeypatch):
    token = register_user(client)
    activity = make_activity(client, token)
    registered = client.post(
        "/api/upload",
        headers=auth(token),
        data={
            "activityId": activity["id"],
            "file": (BytesIO(b"a,b\n1,2\n"), "dataset.csv", "text/csv"),
        },
        content_type="multipart/form-data",
    )
    upload = registered.get_json()["data"]

    def fail_commit():
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(db.session, "commit", fail_commit)
    response = client.post(
        f"/api/uploads/{upload['id']}/execute",
        headers=auth(token),
        json={"runNow": True},
    )
    assert response.status_code == 500
    assert response.get_json()["success"] is False
    monkeypatch.undo()
    with client.application.app_context():
        assert db.session.get(UploadRegistration, upload["id"]).status == "pending"


def test_carbon_route_preserves_simulation_source_after_provider_failure(client, monkeypatch):
    from services import carbon_service

    token = register_user(client)
    monkeypatch.setattr(carbon_service, "get_electricity_maps_api_key", lambda: "configured")
    monkeypatch.setattr(carbon_service, "_fetch_live_data", lambda *_args: None)
    response = client.get("/api/carbon?zone=US-CA", headers=auth(token))
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["isSimulated"] is True
    assert data["source"] == "simulation"
    assert data["forecastSource"] == "simulation"
    assert "error" in data


def test_forecast_provider_exception_returns_unavailable(client, monkeypatch):
    token = register_user(client)

    def unavailable(**_kwargs):
        raise RuntimeError("provider offline")

    monkeypatch.setattr("routes.forecast.get_carbon_data", unavailable)
    response = client.get("/api/forecast", headers=auth(token))
    assert response.status_code == 503
    assert response.get_json()["success"] is False
    assert "provider offline" in response.get_json()["error"]


def test_forecast_rejects_non_numeric_provider_points(client, monkeypatch):
    token = register_user(client)
    now = datetime.now(timezone.utc)
    points = [
        {"datetime": (now + timedelta(hours=index)).isoformat(), "carbonIntensity": 100}
        for index in range(24)
    ]
    points[4]["carbonIntensity"] = True

    class NoModel:
        @staticmethod
        def is_trained():
            return False

        @staticmethod
        def _validate_forecast(forecast, horizon):
            from forecast.predict import ForecastPredictor

            ForecastPredictor._validate_forecast(forecast, horizon)

    monkeypatch.setattr(
        "routes.forecast.get_carbon_data",
        lambda **_: {
            "current": {"datetime": now.isoformat()},
            "forecast": points,
            "forecastSource": "provider",
            "source": "provider",
        },
    )
    monkeypatch.setattr("routes.forecast.get_predictor", lambda: NoModel())
    response = client.get("/api/forecast", headers=auth(token))
    assert response.status_code == 503
    assert response.get_json()["success"] is False


@pytest.mark.parametrize("method", ["greedy", "knapsack"])
def test_invalid_forecast_and_infeasible_interval_never_recommend(method, monkeypatch):
    now = datetime.now(timezone.utc)
    carbon = {
        "current": {"datetime": now.isoformat(), "carbonIntensity": 500},
        "forecast": [
            {"datetime": now.isoformat(), "carbonIntensity": 100},
            {"datetime": now.isoformat(), "carbonIntensity": 90},
        ],
        "forecastSource": "provider",
    }

    class NoModel:
        @staticmethod
        def is_trained():
            return False

    monkeypatch.setattr(optimizer_service, "get_carbon_data", lambda **_: carbon)
    monkeypatch.setattr("forecast.predict.get_predictor", lambda: NoModel())
    task = {
        "id": "candidate",
        "type": "flexible",
        "status": "pending",
        "duration": 10,
        "powerDraw": 50,
        "priorityScore": 10,
    }
    with pytest.raises(optimizer_service.RecommendationDataUnavailable):
        optimizer_service.recommend_schedule(
            [task],
            None,
            method,
            zone_id="US-CA",
        )

    carbon["forecast"] = []
    with pytest.raises(optimizer_service.RecommendationDataUnavailable):
        optimizer_service.recommend_schedule(
            [task],
            None,
            method,
            zone_id="US-CA",
        )

    valid_forecast = [
        {"datetime": (now + timedelta(hours=i)).isoformat(), "carbonIntensity": 100}
        for i in range(3)
    ]
    carbon["forecast"] = valid_forecast
    with pytest.raises(ValueError, match="permitted scheduling interval"):
        optimizer_service.recommend_schedule(
            [task],
            {
                "startTime": now.isoformat(),
                "endTime": (now + timedelta(hours=1)).isoformat(),
                "duration": 10,
            },
            method,
            zone_id="US-CA",
        )
