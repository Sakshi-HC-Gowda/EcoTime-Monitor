import pytest

from app import create_app
from extensions import db


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


def register(client, email, organization_name):
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "first_name": "Test",
            "last_name": "User",
            "organization_name": organization_name,
        },
    )
    assert response.status_code == 201, response.get_data(as_text=True)
    return response.get_json()


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def activity_payload(name):
    return {
        "name": name,
        "type": "flexible",
        "activityType": "batch-processing",
        "duration": 30,
        "powerDraw": 100,
    }


def test_company_isolation_for_activity_and_optimizer_apis(client):
    admin_a = register(client, "admin-a@example.com", "Company A")
    admin_b = register(client, "admin-b@example.com", "Company B")
    token_a = admin_a["token"]
    token_b = admin_b["token"]

    employee_a = client.post(
        "/api/organizations/1/members",
        headers=auth_header(token_a),
        json={
            "email": "employee-a@example.com",
            "password": "Password123!",
            "first_name": "Employee",
            "last_name": "A",
        },
    )
    employee_b = client.post(
        "/api/organizations/2/members",
        headers=auth_header(token_b),
        json={
            "email": "employee-b@example.com",
            "password": "Password123!",
            "first_name": "Employee",
            "last_name": "B",
        },
    )
    assert employee_a.status_code == 201
    assert employee_b.status_code == 201

    activity_a = client.post(
        "/api/activities",
        headers=auth_header(token_a),
        json=activity_payload("Company A task"),
    )
    activity_b = client.post(
        "/api/activities",
        headers=auth_header(token_b),
        json=activity_payload("Company B task"),
    )
    assert activity_a.status_code == 201
    assert activity_b.status_code == 201
    activity_a_id = activity_a.get_json()["data"]["id"]
    activity_b_id = activity_b.get_json()["data"]["id"]

    company_a_list = client.get("/api/activities", headers=auth_header(token_a))
    assert company_a_list.status_code == 200
    assert {item["id"] for item in company_a_list.get_json()["data"]["items"]} == {activity_a_id}

    for method, path, payload in [
        ("get", f"/api/organizations/2", None),
        ("get", "/api/organizations/2/members", None),
        ("get", f"/api/activities/{activity_b_id}", None),
        ("patch", f"/api/activities/{activity_b_id}", {"status": "completed"}),
        ("delete", f"/api/activities/{activity_b_id}", None),
        ("get", f"/api/eco-score?taskId={activity_b_id}&currentIntensity=100", None),
    ]:
        response = getattr(client, method)(
            path,
            headers=auth_header(token_a),
            json=payload,
        ) if payload is not None else getattr(client, method)(path, headers=auth_header(token_a))
        assert response.status_code in {403, 404}, (method, path, response.get_data(as_text=True))

    bulk = client.post(
        "/api/activities/bulk",
        headers=auth_header(token_a),
        json={"updates": [{"id": activity_b_id, "status": "completed"}]},
    )
    assert bulk.status_code == 403

    scheduler = client.post(
        "/api/scheduler",
        headers=auth_header(token_a),
        json={
            "tasks": [activity_b.get_json()["data"]],
            "window": {"id": "window-b", "duration": 60, "avgCarbonIntensity": 100},
        },
    )
    assert scheduler.status_code == 403

    employee_token = client.post(
        "/api/auth/login",
        json={"email": "employee-a@example.com", "password": "Password123!"},
    ).get_json()["token"]
    assert client.get(
        "/api/organizations/1/members",
        headers=auth_header(employee_token),
    ).status_code == 403
    assert client.post(
        "/api/config/simulation",
        headers=auth_header(employee_token),
        json={"zone": "US-CA"},
    ).status_code == 403

    assert client.get("/api/activities").status_code == 401
    assert client.get("/api/users/me").status_code == 401


def test_activity_ownership_is_server_derived(client):
    admin_a = register(client, "owner-a@example.com", "Owner A")
    admin_b = register(client, "owner-b@example.com", "Owner B")

    response = client.post(
        "/api/activities",
        headers=auth_header(admin_a["token"]),
        json={**activity_payload("Server-owned task"), "organization_id": 2},
    )
    assert response.status_code == 201
    assert response.get_json()["data"]["organizationId"] == 1

    listed_by_b = client.get(
        "/api/activities",
        headers=auth_header(admin_b["token"]),
    )
    assert listed_by_b.status_code == 200
    assert listed_by_b.get_json()["data"]["items"] == []
