import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import create_app
from extensions import db
from services.activity_service import create_activity


@pytest.fixture()
def client():
    app = create_app(config_name="testing")
    with app.test_client() as client:
        with app.app_context():
            db.drop_all()
            db.create_all()
        yield client


def test_scheduler_endpoints_schedule_and_complete_activity(client):
    with client.application.app_context():
        activity, err = create_activity({
            "name": "Archive media",
            "type": "flexible",
            "activityType": "cloud-backup",
            "duration": 45,
            "powerDraw": 250,
            "priorityScore": 70,
            "flexibilityScore": 80,
        })
    assert err is None

    response = client.get("/api/scheduler")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert len(payload["data"]["activities"]) == 1

    schedule_response = client.post(
        "/api/scheduler",
        json={
            "activityId": activity["id"],
            "scheduledAt": "2026-08-10T09:00:00Z",
            "status": "scheduled",
        },
    )
    assert schedule_response.status_code == 200
    scheduled_payload = schedule_response.get_json()
    assert scheduled_payload["success"] is True
    assert scheduled_payload["data"]["activity"]["status"] == "scheduled"
    assert scheduled_payload["data"]["recommendation"]["status"] == "pending"

    complete_response = client.patch(
        "/api/scheduler",
        json={
            "activityId": activity["id"],
            "action": "complete",
        },
    )
    assert complete_response.status_code == 200
    completed_payload = complete_response.get_json()
    assert completed_payload["success"] is True
    assert completed_payload["data"]["activity"]["status"] == "completed"
