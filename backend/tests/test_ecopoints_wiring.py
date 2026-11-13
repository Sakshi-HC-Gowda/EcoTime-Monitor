"""EcoPoints routes are authenticated, per-user, and awarded by the real schedule flow."""
from __future__ import annotations

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


def _register(client, email, org):
    r = client.post("/api/auth/register", json={
        "email": email, "password": "Password123!",
        "first_name": "A", "last_name": "B", "organization_name": org,
    })
    body = r.get_json()
    return {"Authorization": f"Bearer {body['token']}"}, str(body["user"]["id"])


def test_ecopoints_routes_require_authentication(client):
    assert client.get("/api/ecopoints/1/score").status_code == 401
    assert client.get("/api/badges/1").status_code == 401
    assert client.post("/api/ecopoints/award", json={}).status_code == 401
    assert client.get("/api/organizations/1/leaderboard").status_code == 401


def test_user_cannot_read_or_award_for_another_user(client):
    headers_a, id_a = _register(client, "a@example.com", "Org A")
    _, id_b = _register(client, "b@example.com", "Org B")
    assert client.get(f"/api/ecopoints/{id_b}/score", headers=headers_a).status_code == 403
    assert client.get(f"/api/badges/{id_b}", headers=headers_a).status_code == 403
    r = client.post("/api/ecopoints/award", headers=headers_a, json={
        "userId": id_b, "eventType": "follow_green_window", "eventId": "x", "activityId": "y"})
    assert r.status_code == 403


def test_scheduling_an_activity_awards_points_once(client):
    headers, user_id = _register(client, "c@example.com", "Org C")
    created = client.post("/api/activities", headers=headers, json={
        "name": "Nightly backup", "type": "flexible", "duration": 30,
        "priorityScore": 20, "flexibilityScore": 90, "activityType": "batch-processing"})
    activity_id = created.get_json()["data"]["id"]

    scheduled = client.post(f"/api/activities/{activity_id}/schedule", headers=headers, json={})
    data = scheduled.get_json()["data"]
    if not data.get("scheduled"):
        pytest.skip("No feasible simulated window at this time of day")

    score = client.get(f"/api/ecopoints/{user_id}/score", headers=headers)
    assert score.status_code == 200
    assert score.get_json()["totalPoints"] == 10
    history = client.get(f"/api/ecopoints/{user_id}", headers=headers).get_json()
    assert history["totalTransactions"] == 1
