from __future__ import annotations

import pytest

from app import create_app
from extensions import db
from models.activity import Activity
from models.activity_history import ActivityHistory
from models.badge import Badge
from models.eco_point_transaction import EcoPointTransaction
from models.role import Role
from models.sustainability_score import SustainabilityScore
from models.user import User


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


def _register(client, email: str, org_name: str) -> dict:
    res = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "first_name": "Test",
            "last_name": "User",
            "organization_name": org_name,
        },
    )
    assert res.status_code == 201, res.get_data(as_text=True)
    return res.get_json()


def _create_employee(client, admin_token: str, org_id: int, email: str) -> dict:
    res = client.post(
        f"/api/organizations/{org_id}/members",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "email": email,
            "password": "Password123!",
            "first_name": "Employee",
            "last_name": "User",
        },
    )
    assert res.status_code == 201, res.get_data(as_text=True)
    # Log in as the employee to get a token
    login_res = client.post(
        "/api/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert login_res.status_code == 200
    return login_res.get_json()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# 1. Unauthenticated requests receive HTTP 401
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("post", "/api/ecopoints/award", {"userId": "1", "eventType": "complete_green_window", "eventId": "1", "activityId": "act-1"}),
        ("get", "/api/ecopoints/1", None),
        ("get", "/api/ecopoints/1/score", None),
        ("get", "/api/ecopoints/transactions", None),
        ("get", "/api/badges/1", None),
        ("get", "/api/organizations/1/leaderboard", None),
        ("post", "/api/organizations/1/leaderboard/opt-in", {"enabled": True}),
    ],
)
def test_unauthenticated_requests_receive_401(client, method, path, payload):
    if method == "post":
        res = client.post(path, json=payload)
    else:
        res = client.get(path)
    assert res.status_code == 401, f"Expected 401 for {method.upper()} {path}, got {res.status_code}"


# ---------------------------------------------------------------------------
# 2. Ordinary users cannot invoke arbitrary point awards
# ---------------------------------------------------------------------------

def test_ordinary_user_cannot_award_points(client):
    admin = _register(client, "admin1@org1.com", "Org 1")
    employee = _create_employee(client, admin["token"], admin["user"]["organizationId"], "emp1@org1.com")

    res = client.post(
        "/api/ecopoints/award",
        headers=_auth(employee["token"]),
        json={
            "userId": str(employee["user"]["id"]),
            "eventType": "complete_green_window",
            "eventId": "1",
            "activityId": "act-1",
        },
    )
    assert res.status_code == 403
    data = res.get_json()
    assert "permission" in data.get("error", "").lower() or not data.get("success", True)


# ---------------------------------------------------------------------------
# 3. An authenticated user cannot read another user's Sustainability data
# ---------------------------------------------------------------------------

def test_user_cannot_read_another_users_data(client, app):
    admin_a = _register(client, "admin-a@org-a.com", "Company A")
    emp_a1 = _create_employee(client, admin_a["token"], admin_a["user"]["organizationId"], "emp-a1@org-a.com")
    emp_a2 = _create_employee(client, admin_a["token"], admin_a["user"]["organizationId"], "emp-a2@org-a.com")

    target_user_id = str(emp_a2["user"]["id"])

    # Employee A1 tries to inspect Employee A2's transactions
    res_tx = client.get(
        f"/api/ecopoints/{target_user_id}",
        headers=_auth(emp_a1["token"]),
    )
    assert res_tx.status_code == 403

    # Employee A1 tries to inspect Employee A2's score
    res_score = client.get(
        f"/api/ecopoints/{target_user_id}/score",
        headers=_auth(emp_a1["token"]),
    )
    assert res_score.status_code == 403

    # Employee A1 tries to inspect Employee A2's transactions via query parameter
    res_tx_query = client.get(
        f"/api/ecopoints/transactions?userId={target_user_id}",
        headers=_auth(emp_a1["token"]),
    )
    assert res_tx_query.status_code == 403

    # Employee A1 tries to inspect Employee A2's badges
    res_badges = client.get(
        f"/api/badges/{target_user_id}",
        headers=_auth(emp_a1["token"]),
    )
    assert res_badges.status_code == 403


# ---------------------------------------------------------------------------
# 4. A user cannot change another user's leaderboard preference
# ---------------------------------------------------------------------------

def test_user_cannot_change_another_users_opt_in(client):
    admin = _register(client, "admin@org.com", "Org Preference")
    org_id = admin["user"]["organizationId"]
    emp1 = _create_employee(client, admin["token"], org_id, "emp1@org.com")
    emp2 = _create_employee(client, admin["token"], org_id, "emp2@org.com")

    # Employee 1 attempts to change Employee 2's opt-in preference
    res = client.post(
        f"/api/organizations/{org_id}/leaderboard/opt-in",
        headers=_auth(emp1["token"]),
        json={"userId": str(emp2["user"]["id"]), "enabled": True},
    )
    assert res.status_code == 403
    assert "cannot change another user" in res.get_json().get("error", "").lower()


# ---------------------------------------------------------------------------
# 5. Users cannot access another organization's leaderboard
# ---------------------------------------------------------------------------

def test_users_cannot_access_other_organization_leaderboard(client):
    admin_a = _register(client, "admin@org-alpha.com", "Org Alpha")
    admin_b = _register(client, "admin@org-beta.com", "Org Beta")

    org_a_id = admin_a["user"]["organizationId"]
    org_b_id = admin_b["user"]["organizationId"]

    # User from Org A tries to access Org B's leaderboard
    res_get = client.get(
        f"/api/organizations/{org_b_id}/leaderboard",
        headers=_auth(admin_a["token"]),
    )
    assert res_get.status_code == 403
    assert "access to this organization" in res_get.get_json().get("error", "").lower()

    # User from Org A tries to opt-in to Org B's leaderboard
    res_opt = client.post(
        f"/api/organizations/{org_b_id}/leaderboard/opt-in",
        headers=_auth(admin_a["token"]),
        json={"enabled": True},
    )
    assert res_opt.status_code == 403


# ---------------------------------------------------------------------------
# 6. Authorized users can access their own data
# ---------------------------------------------------------------------------

def test_authorized_users_can_access_own_data(client, app):
    admin = _register(client, "self@org.com", "Self Org")
    token = admin["token"]
    user_id = str(admin["user"]["id"])

    with app.app_context():
        # Seed a SustainabilityScore record for this user
        score = SustainabilityScore(
            id="score-self-1",
            user_id=user_id,
            organization_id=str(admin["user"]["organizationId"]),
            score=50.0,
            total_points=50,
            current_streak=3,
            longest_streak=5,
            leaderboard_opt_in=True,
        )
        db.session.add(score)
        db.session.commit()

    # Get own transactions
    res_tx = client.get(f"/api/ecopoints/{user_id}", headers=_auth(token))
    assert res_tx.status_code == 200
    assert res_tx.get_json()["userId"] == user_id

    # Get own transactions via "me" alias
    res_tx_me = client.get("/api/ecopoints/me", headers=_auth(token))
    assert res_tx_me.status_code == 200
    assert res_tx_me.get_json()["userId"] == user_id

    # Get own transactions via /transactions endpoint
    res_my_tx = client.get("/api/ecopoints/transactions", headers=_auth(token))
    assert res_my_tx.status_code == 200
    assert res_my_tx.get_json()["userId"] == user_id

    # Get own score
    res_score = client.get(f"/api/ecopoints/{user_id}/score", headers=_auth(token))
    assert res_score.status_code == 200
    assert res_score.get_json()["totalPoints"] == 50
    assert res_score.get_json()["currentStreak"] == 3

    # Get own score via "me" alias
    res_score_me = client.get("/api/ecopoints/me/score", headers=_auth(token))
    assert res_score_me.status_code == 200
    assert res_score_me.get_json()["totalPoints"] == 50

    # Get own badges
    res_badges = client.get(f"/api/badges/{user_id}", headers=_auth(token))
    assert res_badges.status_code == 200
    assert res_badges.get_json()["userId"] == user_id


# ---------------------------------------------------------------------------
# 7. Legitimate leaderboard opt-in and opt-out still work
# ---------------------------------------------------------------------------

def test_legitimate_leaderboard_opt_in_and_out(client):
    admin = _register(client, "leader@org.com", "Leader Org")
    token = admin["token"]
    org_id = admin["user"]["organizationId"]
    user_id = str(admin["user"]["id"])

    # Opt in
    res_in = client.post(
        f"/api/organizations/{org_id}/leaderboard/opt-in",
        headers=_auth(token),
        json={"enabled": True},
    )
    assert res_in.status_code == 200
    assert res_in.get_json()["leaderboardOptIn"] is True

    # View leaderboard — user should appear
    res_board = client.get(
        f"/api/organizations/{org_id}/leaderboard",
        headers=_auth(token),
    )
    assert res_board.status_code == 200
    entries = res_board.get_json()["leaderboard"]
    assert any(entry["userId"] == user_id for entry in entries)

    # Opt out
    res_out = client.post(
        f"/api/organizations/{org_id}/leaderboard/opt-in",
        headers=_auth(token),
        json={"enabled": False},
    )
    assert res_out.status_code == 200
    assert res_out.get_json()["leaderboardOptIn"] is False

    # View leaderboard — user should no longer appear
    res_board_after = client.get(
        f"/api/organizations/{org_id}/leaderboard",
        headers=_auth(token),
    )
    assert res_board_after.status_code == 200
    entries_after = res_board_after.get_json()["leaderboard"]
    assert not any(entry["userId"] == user_id for entry in entries_after)


# ---------------------------------------------------------------------------
# 8. Admin point awarding with organization boundary enforcement & commit
# ---------------------------------------------------------------------------

def test_admin_point_awarding_and_org_enforcement(client, app):
    admin_a = _register(client, "admin-a@corp-a.com", "Corp A")
    admin_b = _register(client, "admin-b@corp-b.com", "Corp B")
    token_a = admin_a["token"]
    token_b = admin_b["token"]
    org_a_id = admin_a["user"]["organizationId"]

    # Create an activity belonging to Corp A
    act_res = client.post(
        "/api/activities",
        headers=_auth(token_a),
        json={
            "name": "Sustainable Activity",
            "type": "flexible",
            "activityType": "batch-processing",
            "duration": 15,
            "powerDraw": 80,
        },
    )
    assert act_res.status_code == 201
    act_id = act_res.get_json()["data"]["id"]

    with app.app_context():
        # Get history event id
        hist = ActivityHistory.query.filter_by(activity_id=act_id).first()
        assert hist is not None
        hist_id = str(hist.id)

    # Admin B tries to award points for Corp A's activity -> 403 Forbidden
    res_cross = client.post(
        "/api/ecopoints/award",
        headers=_auth(token_b),
        json={
            "userId": str(admin_b["user"]["id"]),
            "eventType": "complete_green_window",
            "eventId": hist_id,
            "activityId": act_id,
        },
    )
    assert res_cross.status_code == 403
    assert "organization" in res_cross.get_json().get("error", "").lower()

    # Admin A awards points legitimately for Corp A's activity -> 201 Created
    res_award = client.post(
        "/api/ecopoints/award",
        headers=_auth(token_a),
        json={
            "userId": str(admin_a["user"]["id"]),
            "eventType": "complete_green_window",
            "eventId": hist_id,
            "activityId": act_id,
        },
    )
    assert res_award.status_code == 201
    assert res_award.get_json()["transaction"]["points"] == 10

    # Verify that the award actually committed to DB and persists in a new request
    res_score = client.get(
        f"/api/ecopoints/{admin_a['user']['id']}/score",
        headers=_auth(token_a),
    )
    assert res_score.status_code == 200
    assert res_score.get_json()["totalPoints"] == 10


# ---------------------------------------------------------------------------
# 9. Award endpoint regression tests for target user validation
# ---------------------------------------------------------------------------

def _setup_org_activity(client, admin_token: str) -> tuple[str, str]:
    """Helper to create an activity and retrieve its initial history event ID."""
    act_res = client.post(
        "/api/activities",
        headers=_auth(admin_token),
        json={
            "name": "Regression Activity",
            "type": "flexible",
            "activityType": "batch-processing",
            "duration": 20,
            "powerDraw": 60,
        },
    )
    assert act_res.status_code == 201
    act_id = act_res.get_json()["data"]["id"]

    hist = ActivityHistory.query.filter_by(activity_id=act_id).first()
    assert hist is not None
    return act_id, str(hist.id)


def test_award_points_rejects_non_numeric_user_id(client, app):
    admin = _register(client, "admin-nan@org-nan.com", "Org NaN")
    token = admin["token"]

    with app.app_context():
        act_id, hist_id = _setup_org_activity(client, token)

    # Test with string literal "demo-user"
    res = client.post(
        "/api/ecopoints/award",
        headers=_auth(token),
        json={
            "userId": "demo-user",
            "eventType": "complete_green_window",
            "eventId": hist_id,
            "activityId": act_id,
        },
    )
    assert res.status_code == 400
    assert "valid integer" in res.get_json().get("error", "").lower()

    # Test with boolean True
    res_bool = client.post(
        "/api/ecopoints/award",
        headers=_auth(token),
        json={
            "userId": True,
            "eventType": "complete_green_window",
            "eventId": hist_id,
            "activityId": act_id,
        },
    )
    assert res_bool.status_code == 400
    assert "valid integer" in res_bool.get_json().get("error", "").lower()

    # Verify no records were created in DB
    with app.app_context():
        assert EcoPointTransaction.query.filter_by(user_id="demo-user").count() == 0
        assert SustainabilityScore.query.filter_by(user_id="demo-user").count() == 0
        assert Badge.query.filter_by(user_id="demo-user").count() == 0


def test_award_points_rejects_nonexistent_numeric_user_id(client, app):
    admin = _register(client, "admin-nonexistent@org-ne.com", "Org NE")
    token = admin["token"]

    with app.app_context():
        act_id, hist_id = _setup_org_activity(client, token)

    res = client.post(
        "/api/ecopoints/award",
        headers=_auth(token),
        json={
            "userId": "999999",
            "eventType": "complete_green_window",
            "eventId": hist_id,
            "activityId": act_id,
        },
    )
    assert res.status_code == 404
    assert "does not exist" in res.get_json().get("error", "").lower()

    # Verify no records were created in DB
    with app.app_context():
        assert EcoPointTransaction.query.filter_by(user_id="999999").count() == 0
        assert SustainabilityScore.query.filter_by(user_id="999999").count() == 0
        assert Badge.query.filter_by(user_id="999999").count() == 0


def test_award_points_rejects_user_from_different_organization(client, app):
    admin_a = _register(client, "admin-org1@corp1.com", "Corp 1")
    admin_b = _register(client, "admin-org2@corp2.com", "Corp 2")
    emp_b = _create_employee(
        client,
        admin_b["token"],
        admin_b["user"]["organizationId"],
        "emp-b@corp2.com",
    )

    with app.app_context():
        act_id, hist_id = _setup_org_activity(client, admin_a["token"])

    # Admin A attempts to award points to emp_b (who is in Corp 2)
    res = client.post(
        "/api/ecopoints/award",
        headers=_auth(admin_a["token"]),
        json={
            "userId": str(emp_b["user"]["id"]),
            "eventType": "complete_green_window",
            "eventId": hist_id,
            "activityId": act_id,
        },
    )
    assert res.status_code == 403
    assert "belong to your organization" in res.get_json().get("error", "").lower()

    # Verify no records created for emp_b
    emp_b_id_str = str(emp_b["user"]["id"])
    with app.app_context():
        assert EcoPointTransaction.query.filter_by(user_id=emp_b_id_str).count() == 0
        assert SustainabilityScore.query.filter_by(user_id=emp_b_id_str).count() == 0
        assert Badge.query.filter_by(user_id=emp_b_id_str).count() == 0


def test_award_points_succeeds_for_valid_user_in_same_organization(client, app):
    admin = _register(client, "admin-same@corp-same.com", "Corp Same")
    emp = _create_employee(
        client,
        admin["token"],
        admin["user"]["organizationId"],
        "emp-same@corp-same.com",
    )
    emp_id_str = str(emp["user"]["id"])

    with app.app_context():
        act_id, hist_id = _setup_org_activity(client, admin["token"])

    # Admin awards points to employee belonging to the same organization
    res = client.post(
        "/api/ecopoints/award",
        headers=_auth(admin["token"]),
        json={
            "userId": emp_id_str,
            "eventType": "complete_green_window",
            "eventId": hist_id,
            "activityId": act_id,
        },
    )
    assert res.status_code == 201
    data = res.get_json()
    assert data["transaction"]["points"] == 10
    assert data["transaction"]["userId"] == emp_id_str

    # Verify database persistence across requests
    res_score = client.get(
        f"/api/ecopoints/{emp_id_str}/score",
        headers=_auth(emp["token"]),
    )
    assert res_score.status_code == 200
    assert res_score.get_json()["totalPoints"] == 10

    res_tx = client.get(
        f"/api/ecopoints/{emp_id_str}",
        headers=_auth(emp["token"]),
    )
    assert res_tx.status_code == 200
    assert len(res_tx.get_json()["transactions"]) == 1

    with app.app_context():
        tx_count = EcoPointTransaction.query.filter_by(user_id=emp_id_str).count()
        assert tx_count == 1
