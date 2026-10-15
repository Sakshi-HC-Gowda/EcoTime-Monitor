from __future__ import annotations

from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path

import pytest

from app import create_app
from extensions import db
from models.activity import Activity
from models.activity_history import ActivityHistory
from models.upload_registration import UploadRegistration
from services import upload_service


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


def register_user(client, email: str, organization: str) -> str:
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "first_name": "Upload",
            "last_name": "Tester",
            "organization_name": organization,
        },
    )
    assert response.status_code == 201
    return response.get_json()["token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def create_activity(client, token, **updates):
    response = client.post(
        "/api/activities",
        headers=auth(token),
        json={
            "name": "Supported upload",
            "type": "flexible",
            "activityType": "file-upload",
            "duration": 10,
            "powerDraw": 50,
            **updates,
        },
    )
    assert response.status_code == 201, response.get_data(as_text=True)
    return response.get_json()["data"]


def register_file(client, token, activity_id, filename="dataset.csv", content=b"a,b\n1,2\n"):
    return client.post(
        "/api/upload",
        headers=auth(token),
        data={
            "activityId": activity_id,
            "file": (BytesIO(content), filename, "application/octet-stream"),
        },
        content_type="multipart/form-data",
    )


def test_successful_upload_is_staged_then_actually_stored_and_downloadable(client):
    token = register_user(client, "upload-success@example.com", "Upload Success")
    activity = create_activity(client, token)
    organization_id = activity["organizationId"]
    registered = client.post(
        "/api/upload",
        headers=auth(token),
        data={
            "activityId": activity["id"],
            "organization_id": organization_id + 500,
            "file": (BytesIO(b"a,b\n1,2\n"), "dataset.csv", "application/octet-stream"),
        },
        content_type="multipart/form-data",
    )

    assert registered.status_code == 201
    upload = registered.get_json()["data"]
    assert upload["status"] == "pending"

    with client.application.app_context():
        stored = db.session.get(UploadRegistration, upload["id"])
        assert stored.organization_id == organization_id
        assert db.session.get(Activity, activity["id"]).status == "idle"

    executed = client.post(
        f"/api/uploads/{upload['id']}/execute",
        headers=auth(token),
        json={"runNow": True},
    )
    assert executed.status_code == 200
    assert executed.get_json()["data"]["status"] == "completed"

    download = client.get(
        f"/api/uploads/{upload['id']}/download",
        headers=auth(token),
    )
    assert download.status_code == 200
    assert download.data == b"a,b\n1,2\n"


def test_upload_requires_file(client):
    token = register_user(client, "upload-missing@example.com", "Upload Missing")
    activity = create_activity(client, token)

    response = client.post(
        "/api/upload",
        headers=auth(token),
        data={"activityId": activity["id"]},
        content_type="multipart/form-data",
    )

    assert response.status_code == 400
    assert "file is required" in response.get_json()["error"].lower()


@pytest.mark.parametrize(
    ("filename", "content", "expected"),
    [
        ("program.exe", b"not allowed", "Unsupported file type"),
        ("bad.json", b"{not-json}", "not valid JSON"),
        ("bad.zip", b"not a zip file", "invalid file signature"),
    ],
)
def test_rejects_unsupported_or_malformed_files(client, filename, content, expected):
    token = register_user(client, f"reject-{filename}@example.com", "Reject Files")
    activity = create_activity(client, token)

    response = register_file(client, token, activity["id"], filename, content)

    assert response.status_code == 400
    assert expected in response.get_json()["error"]
    assert client.get(
        f"/api/activities/{activity['id']}/uploads",
        headers=auth(token),
    ).get_json()["data"] == []


def test_backend_enforces_maximum_file_size(client, monkeypatch):
    token = register_user(client, "upload-size@example.com", "Upload Size")
    activity = create_activity(client, token)
    monkeypatch.setattr(upload_service, "MAX_UPLOAD_BYTES", 5)

    response = register_file(client, token, activity["id"], "too-large.txt", b"123456")

    assert response.status_code == 413
    assert "100 MiB" in response.get_json()["error"] or "size limit" in response.get_json()["error"]


def test_flask_request_size_limit_returns_json(client):
    token = register_user(client, "upload-request-limit@example.com", "Upload Request Limit")
    activity = create_activity(client, token)
    client.application.config["MAX_CONTENT_LENGTH"] = 128

    response = register_file(client, token, activity["id"], "large.txt", b"x" * 256)

    assert response.status_code == 413
    assert response.is_json
    assert response.get_json()["success"] is False
    assert "100 MiB" in response.get_json()["error"]


def test_execution_failure_is_persisted_and_retry_is_safe(client, monkeypatch):
    token = register_user(client, "upload-failure@example.com", "Upload Failure")
    activity = create_activity(client, token)
    upload = register_file(client, token, activity["id"]).get_json()["data"]
    monkeypatch.setattr(
        upload_service.os,
        "link",
        lambda *_args: (_ for _ in ()).throw(OSError("disk unavailable")),
    )

    failed = client.post(
        f"/api/uploads/{upload['id']}/execute",
        headers=auth(token),
        json={"runNow": True},
    )
    assert failed.status_code == 500
    persisted = client.get(
        f"/api/uploads/{upload['id']}",
        headers=auth(token),
    ).get_json()["data"]
    assert persisted["status"] == "failed"
    assert persisted["error"]
    with client.application.app_context():
        assert db.session.get(Activity, activity["id"]).status == "failed"

    monkeypatch.undo()
    retried = client.post(
        f"/api/uploads/{upload['id']}/execute",
        headers=auth(token),
        json={"runNow": True},
    )
    assert retried.status_code == 200
    assert retried.get_json()["data"]["status"] == "completed"


def test_upload_status_and_activity_history_are_persisted(client, app):
    token = register_user(client, "upload-history@example.com", "Upload History")
    activity = create_activity(client, token)
    upload = register_file(client, token, activity["id"]).get_json()["data"]
    client.post(
        f"/api/uploads/{upload['id']}/execute",
        headers=auth(token),
        json={"runNow": True},
    )

    with app.app_context():
        stored = db.session.get(UploadRegistration, upload["id"])
        activity_record = db.session.get(Activity, activity["id"])
        transitions = ActivityHistory.query.filter_by(activity_id=activity["id"]).all()
        assert stored.status == "completed"
        assert activity_record.status == "completed"
        assert [row.new_status for row in transitions] == ["idle", "running", "completed"]


def test_schedule_rejects_inflexible_urgent_and_deadline_infeasible_activities(client, monkeypatch):
    token = register_user(client, "upload-schedule@example.com", "Upload Schedule")
    inflexible = create_activity(client, token, type="non-flexible")
    urgent = create_activity(client, token, priorityScore=90)
    deadline = create_activity(
        client,
        token,
        deadline=(datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
    )
    registrations = [
        register_file(client, token, activity["id"]).get_json()["data"]
        for activity in (inflexible, urgent, deadline)
    ]
    monkeypatch.setattr(
        upload_service.optimizer_service,
        "recommend_schedule",
        lambda **_: {
            "recommendations": [{
                "activityId": deadline["id"],
                "status": "scheduled",
                "startTime": (datetime.now(timezone.utc) + timedelta(minutes=1)).isoformat(),
                "windowId": "green-window",
                "reason": "Test recommendation",
            }]
        },
    )

    for registration, expected in zip(
        registrations[:2],
        ("Inflexible", "Urgent"),
        strict=True,
    ):
        response = client.post(
            f"/api/uploads/{registration['id']}/schedule",
            headers=auth(token),
        )
        assert response.status_code == 409
        assert expected in response.get_json()["error"]

    too_late = client.post(
        f"/api/uploads/{registrations[2]['id']}/schedule",
        headers=auth(token),
    )
    assert too_late.status_code == 409
    assert "deadline" in too_late.get_json()["error"]


def test_valid_schedule_uses_optimizer_recommendation_and_executes_only_when_due(client, monkeypatch):
    token = register_user(client, "upload-schedulable@example.com", "Upload Schedulable")
    activity = create_activity(client, token)
    upload = register_file(client, token, activity["id"]).get_json()["data"]
    start = datetime.now(timezone.utc) + timedelta(minutes=2)
    monkeypatch.setattr(
        upload_service.optimizer_service,
        "recommend_schedule",
        lambda **_: {
            "recommendations": [{
                "activityId": activity["id"],
                "status": "scheduled",
                "startTime": start.isoformat(),
                "windowId": "green-window",
                "reason": "Complete duration fits before the deadline.",
            }]
        },
    )

    scheduled = client.post(
        f"/api/uploads/{upload['id']}/schedule",
        headers=auth(token),
    )
    assert scheduled.status_code == 200
    assert scheduled.get_json()["data"]["upload"]["status"] == "scheduled"
    assert scheduled.get_json()["data"]["recommendation"]["startTime"] == start.isoformat()

    bounds_change = client.patch(
        f"/api/activities/{activity['id']}",
        headers=auth(token),
        json={"deadline": (start + timedelta(minutes=5)).isoformat()},
    )
    assert bounds_change.status_code == 400
    assert "bounds cannot change" in bounds_change.get_json()["error"]

    too_early = client.post(
        f"/api/uploads/{upload['id']}/execute",
        headers=auth(token),
        json={"runNow": False},
    )
    assert too_early.status_code == 409
    assert "not due yet" in too_early.get_json()["error"]


def test_upload_status_history_and_download_are_isolated_by_organization(client):
    token_a = register_user(client, "upload-a@example.com", "Upload Org A")
    token_b = register_user(client, "upload-b@example.com", "Upload Org B")
    activity_a = create_activity(client, token_a)
    activity_b = create_activity(client, token_b)
    upload = register_file(client, token_a, activity_a["id"]).get_json()["data"]

    foreign_activity = client.get(
        f"/api/activities/{activity_a['id']}/uploads",
        headers=auth(token_b),
    )
    foreign_status = client.get(
        f"/api/uploads/{upload['id']}",
        headers=auth(token_b),
    )
    foreign_download = client.get(
        f"/api/uploads/{upload['id']}/download",
        headers=auth(token_b),
    )
    foreign_schedule = client.post(
        f"/api/uploads/{upload['id']}/schedule",
        headers=auth(token_b),
    )
    foreign_execute = client.post(
        f"/api/uploads/{upload['id']}/execute",
        headers=auth(token_b),
        json={"runNow": True},
    )
    foreign_activity_upload = client.post(
        "/api/upload",
        headers=auth(token_b),
        data={
            "activityId": activity_a["id"],
            "file": (BytesIO(b"a,b\n"), "foreign.csv"),
        },
        content_type="multipart/form-data",
    )

    assert all(
        response.status_code == 404
        for response in (
            foreign_activity,
            foreign_status,
            foreign_download,
            foreign_schedule,
            foreign_execute,
            foreign_activity_upload,
        )
    )
    assert client.get(
        f"/api/activities/{activity_b['id']}/uploads",
        headers=auth(token_b),
    ).get_json()["data"] == []


def test_unsupported_workload_cannot_be_marked_executing(client):
    token = register_user(client, "planning-only@example.com", "Planning Only")
    activity = client.post(
        "/api/activities",
        headers=auth(token),
        json={
            "name": "Unsupported execution",
            "type": "flexible",
            "activityType": "batch-processing",
            "duration": 10,
            "powerDraw": 20,
        },
    ).get_json()["data"]

    response = client.patch(
        f"/api/activities/{activity['id']}",
        headers=auth(token),
        json={"status": "running"},
    )

    assert response.status_code == 400
    assert "supported workload executor" in response.get_json()["error"]


def test_file_upload_cannot_be_marked_completed_without_execution(client):
    token = register_user(client, "manual-completion@example.com", "Manual Completion")
    activity = create_activity(client, token)

    response = client.patch(
        f"/api/activities/{activity['id']}",
        headers=auth(token),
        json={"status": "completed"},
    )

    assert response.status_code == 400
    assert "upload executor" in response.get_json()["error"]


def test_existing_final_file_is_never_overwritten(client):
    token = register_user(client, "upload-collision@example.com", "Upload Collision")
    activity = create_activity(client, token)
    upload = register_file(client, token, activity["id"]).get_json()["data"]

    with client.application.app_context():
        registration = db.session.get(UploadRegistration, upload["id"])
        final_path = Path(registration.final_path)
        final_path.write_bytes(b"existing unrelated content")

    response = client.post(
        f"/api/uploads/{upload['id']}/execute",
        headers=auth(token),
        json={"runNow": True},
    )

    assert response.status_code == 500
    assert final_path.read_bytes() == b"existing unrelated content"
    assert client.get(
        f"/api/uploads/{upload['id']}",
        headers=auth(token),
    ).get_json()["data"]["status"] == "failed"


def test_upload_filename_is_sanitized_and_stored_in_private_org_directory(client):
    token = register_user(client, "upload-path@example.com", "Upload Path")
    activity = create_activity(client, token)

    response = register_file(
        client,
        token,
        activity["id"],
        filename="../../outside.csv",
    )

    assert response.status_code == 201
    with client.application.app_context():
        registration = db.session.get(
            UploadRegistration,
            response.get_json()["data"]["id"],
        )
        staged = Path(registration.staging_path).resolve()
        assert registration.original_filename == "outside.csv"
        assert staged.parent.name.startswith("org-")
        assert staged.is_relative_to(upload_service.UPLOAD_ROOT.resolve())