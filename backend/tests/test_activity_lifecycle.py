"""
Tests for Digital Workloads lifecycle behavior:
- Scheduling with simulated carbon fallback
- Moving from Pending to Scheduled with persisted times
- Run Now execution, state transitions, and persistence
- Duplicate scheduling and duplicate execution prevention
- Status count derivation from persisted state
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from io import BytesIO
from unittest.mock import patch
import pytest

from app import create_app
from extensions import db
from models.activity import Activity
from models.upload_registration import UploadRegistration
from services import upload_service


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setattr(upload_service, "UPLOAD_ROOT", tmp_path / "uploads")
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


def _register(client, email="lifecycle@example.com", org="Lifecycle Org") -> str:
    res = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "first_name": "Life",
            "last_name": "Cycle",
            "organization_name": org,
        },
    )
    assert res.status_code == 201
    return res.get_json()["token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_schedule_activity_with_simulated_carbon_fallback(client):
    """
    When live Electricity Maps data is unavailable and returns an explanatory
    error with isSimulated=True, the optimizer must still produce a valid
    recommendation, persist the scheduled time and status, move the activity
    from Pending to Scheduled, and update status counts.
    """
    token = _register(client, "sched-sim@example.com", "Sched Sim Org")
    res = client.post(
        "/api/activities",
        headers=_auth(token),
        json={
            "name": "Batch Task",
            "type": "flexible",
            "activityType": "batch-processing",
            "duration": 20,
            "powerDraw": 150,
        },
    )
    assert res.status_code == 201
    task_id = res.get_json()["data"]["id"]

    # Initially in pending
    list_res = client.get("/api/activities", headers=_auth(token)).get_json()["data"]
    assert list_res["statusCounts"]["pending"] == 1
    assert list_res["statusCounts"]["scheduled"] == 0

    # Simulate Electricity Maps outage (falls back to explicitly labeled simulated data)
    with patch("services.carbon_service.get_electricity_maps_api_key", return_value="configured-key"), \
         patch("services.carbon_service._fetch_live_data", return_value=None):
        sched_res = client.post(
            f"/api/activities/{task_id}/schedule",
            headers=_auth(token),
        )

    assert sched_res.status_code == 200
    sched_data = sched_res.get_json()["data"]
    assert sched_data["scheduled"] is True
    assert sched_data["activity"]["status"] == "scheduled"
    assert sched_data["activity"]["assignedWindowId"] is not None
    assert sched_data["activity"]["scheduledStartTime"] is not None

    # Verify database persistence via single-activity get
    get_res = client.get(f"/api/activities/{task_id}", headers=_auth(token)).get_json()["data"]
    assert get_res["status"] == "scheduled"
    assert get_res["assignedWindowId"] == sched_data["activity"]["assignedWindowId"]
    assert get_res["scheduledStartTime"] == sched_data["activity"]["scheduledStartTime"]

    # Verify status counts updated from backend
    list_after = client.get("/api/activities", headers=_auth(token)).get_json()["data"]
    assert list_after["statusCounts"]["pending"] == 0
    assert list_after["statusCounts"]["scheduled"] == 1


def test_schedule_activity_prevents_duplicate_scheduling(client):
    """Repeated clicks to schedule must return 409 conflict and not overwrite schedule."""
    token = _register(client, "dup-sched@example.com", "Dup Sched Org")
    act = client.post(
        "/api/activities",
        headers=_auth(token),
        json={
            "name": "Repeat Sched Task",
            "type": "flexible",
            "activityType": "batch-processing",
            "duration": 15,
        },
    ).get_json()["data"]
    task_id = act["id"]

    with patch("services.carbon_service.get_electricity_maps_api_key", return_value="key"), \
         patch("services.carbon_service._fetch_live_data", return_value=None):
        first = client.post(f"/api/activities/{task_id}/schedule", headers=_auth(token))
        assert first.status_code == 200
        first_start = first.get_json()["data"]["activity"]["scheduledStartTime"]

        second = client.post(f"/api/activities/{task_id}/schedule", headers=_auth(token))
        assert second.status_code == 409
        assert "cannot be scheduled while scheduled" in second.get_json()["error"]

    persisted = client.get(f"/api/activities/{task_id}", headers=_auth(token)).get_json()["data"]
    assert persisted["status"] == "scheduled"
    assert persisted["scheduledStartTime"] == first_start


def test_schedule_fails_when_no_valid_forecast(client):
    """When carbon forecast is completely invalid/missing, 503 is returned and status stays pending."""
    token = _register(client, "fail-sched@example.com", "Fail Sched Org")
    act = client.post(
        "/api/activities",
        headers=_auth(token),
        json={
            "name": "No Forecast Task",
            "type": "flexible",
            "activityType": "batch-processing",
            "duration": 15,
        },
    ).get_json()["data"]
    task_id = act["id"]

    # Mock get_carbon_data returning broken forecast
    with patch("services.optimizer_service.get_carbon_data", return_value={
        "current": {"datetime": datetime.now(timezone.utc).isoformat(), "carbonIntensity": 200},
        "forecast": [],
        "forecastSource": "unavailable",
        "error": "Complete forecast outage",
        "isSimulated": False,
    }):
        sched_res = client.post(f"/api/activities/{task_id}/schedule", headers=_auth(token))
        assert sched_res.status_code == 503

    persisted = client.get(f"/api/activities/{task_id}", headers=_auth(token)).get_json()["data"]
    assert persisted["status"] == "pending"
    assert persisted["scheduledStartTime"] is None


def test_run_now_lifecycle_and_duplicate_prevention(client, app):
    """
    Run Now transitions scheduled activity to Running, records executionStartTime,
    updates status counts, rejects repeated Run Now with 409, and list_activities
    advances to Completed after duration elapses.
    """
    token = _register(client, "run-lifecycle@example.com", "Run Lifecycle Org")
    act = client.post(
        "/api/activities",
        headers=_auth(token),
        json={
            "name": "Simulated Run Task",
            "type": "flexible",
            "activityType": "batch-processing",
            "duration": 5,
        },
    ).get_json()["data"]
    task_id = act["id"]

    # Schedule first
    with patch("services.carbon_service.get_electricity_maps_api_key", return_value="key"), \
         patch("services.carbon_service._fetch_live_data", return_value=None):
        sched_res = client.post(f"/api/activities/{task_id}/schedule", headers=_auth(token))
        assert sched_res.status_code == 200

    # Run Now
    run_res = client.post(f"/api/activities/{task_id}/run", headers=_auth(token))
    assert run_res.status_code == 200
    run_data = run_res.get_json()["data"]
    assert run_data["executionMode"] == "simulated"
    assert run_data["activity"]["status"] == "running"
    assert run_data["activity"]["progress"] == 0.0

    # Verify DB persistence
    get_run = client.get(f"/api/activities/{task_id}", headers=_auth(token)).get_json()["data"]
    assert get_run["status"] == "running"
    assert get_run["executionStartTime"] is not None

    # Status counts reflect running state
    list_running = client.get("/api/activities", headers=_auth(token)).get_json()["data"]
    assert list_running["statusCounts"]["scheduled"] == 0
    assert list_running["statusCounts"]["running"] == 1

    # Repeated Run Now rejected with 409
    dup_run = client.post(f"/api/activities/{task_id}/run", headers=_auth(token))
    assert dup_run.status_code == 409
    assert "must be scheduled before it can run" in dup_run.get_json()["error"]

    # Advance time beyond duration in DB and verify completion
    with app.app_context():
        stored = db.session.get(Activity, task_id)
        stored.execution_start_time = datetime.now(timezone.utc) - timedelta(minutes=6)
        db.session.commit()

    # Querying activities triggers advance_simulated_activities
    list_completed = client.get("/api/activities", headers=_auth(token)).get_json()["data"]
    assert list_completed["statusCounts"]["running"] == 0
    assert list_completed["statusCounts"]["completed"] == 1
    completed_task = next(item for item in list_completed["items"] if item["id"] == task_id)
    assert completed_task["status"] == "completed"
    assert completed_task["progress"] == 100.0


def test_file_upload_real_execution_and_persistence(client):
    """File upload executes actual storage operation, persisting to Completed."""
    token = _register(client, "upload-real@example.com", "Upload Real Org")
    act = client.post(
        "/api/activities",
        headers=_auth(token),
        json={
            "name": "Dataset CSV",
            "type": "flexible",
            "activityType": "file-upload",
            "duration": 10,
        },
    ).get_json()["data"]
    act_id = act["id"]

    # Register file
    reg_res = client.post(
        "/api/upload",
        headers=_auth(token),
        data={"activityId": act_id, "file": (BytesIO(b"data,val\na,1\n"), "dataset.csv")},
        content_type="multipart/form-data",
    )
    assert reg_res.status_code == 201
    upload_id = reg_res.get_json()["data"]["id"]

    # Schedule upload with simulated carbon fallback
    with patch("services.carbon_service.get_electricity_maps_api_key", return_value="key"), \
         patch("services.carbon_service._fetch_live_data", return_value=None):
        sched_res = client.post(f"/api/uploads/{upload_id}/schedule", headers=_auth(token))
        assert sched_res.status_code == 200

    # Execute upload now
    exec_res = client.post(
        f"/api/uploads/{upload_id}/execute",
        headers=_auth(token),
        json={"runNow": True},
    )
    assert exec_res.status_code == 200
    assert exec_res.get_json()["data"]["status"] == "completed"

    # Activity status is also completed
    act_res = client.get(f"/api/activities/{act_id}", headers=_auth(token)).get_json()["data"]
    assert act_res["status"] == "completed"
    assert act_res["progress"] == 100.0
