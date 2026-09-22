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


def register(client, email, password, org_name="Test Org"):
    return client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": password,
            "first_name": "Test",
            "last_name": "User",
            "organization_name": org_name,
        },
    )


def test_register_and_login_and_me(client):
    res = register(client, "admin@company-a.com", "Password123!")
    assert res.status_code == 201, res.get_data(as_text=True)
    payload = res.get_json()
    assert payload["user"]["email"] == "admin@company-a.com"
    assert payload["token"]

    login_res = client.post(
        "/api/auth/login",
        json={"email": "admin@company-a.com", "password": "Password123!"},
    )
    assert login_res.status_code == 200, login_res.get_data(as_text=True)
    token = login_res.get_json()["token"]

    me = client.get(
        "/api/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200
    data = me.get_json()
    assert data["email"] == "admin@company-a.com"
    assert data["organization"]["name"] == "Test Org"
    assert data["role"]["name"] == "Organization Admin"


def test_duplicate_registration_is_rejected(client):
    first = register(client, "dup@company.com", "Password123!")
    assert first.status_code == 201

    second = register(client, "dup@company.com", "Password123!")
    assert second.status_code == 409


def test_employee_cannot_access_admin_members(client):
    admin = register(client, "admin@company-a.com", "Password123!", "Company A")
    admin_token = admin.get_json()["token"]

    employee = client.post(
        "/api/organizations/1/members",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "email": "employee@company-a.com",
            "password": "Password123!",
            "first_name": "Employee",
            "last_name": "User",
        },
    )
    assert employee.status_code == 201
    employee_token = client.post(
        "/api/auth/login",
        json={"email": "employee@company-a.com", "password": "Password123!"},
    ).get_json()["token"]

    members = client.get(
        "/api/organizations/1/members",
        headers={"Authorization": f"Bearer {employee_token}"},
    )
    assert members.status_code == 403

    admin_members = client.get(
        "/api/organizations/1/members",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert admin_members.status_code == 200
    assert len(admin_members.get_json()["members"]) >= 1


def test_existing_organization_cannot_be_joined_by_name(client):
    register(client, "admin@company-a.com", "Password123!", "Company A")
    response = register(client, "intruder@company-a.com", "Password123!", "Company A")
    assert response.status_code == 409


def test_employee_cannot_create_members_or_take_over_org(client):
    admin = register(client, "admin@company-a.com", "Password123!", "Company A")
    admin_token = admin.get_json()["token"]
    employee = client.post(
        "/api/organizations/1/members",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "email": "employee@company-a.com",
            "password": "Password123!",
            "first_name": "Employee",
            "last_name": "User",
        },
    )
    employee_token = client.post(
        "/api/auth/login",
        json={"email": "employee@company-a.com", "password": "Password123!"},
    ).get_json()["token"]
    assert client.post(
        "/api/organizations/1/members",
        headers={"Authorization": f"Bearer {employee_token}"},
        json={"email": "other@company-a.com", "password": "Password123!", "first_name": "Other", "last_name": "User"},
    ).status_code == 403
    assert client.post(
        "/api/organizations",
        headers={"Authorization": f"Bearer {employee_token}"},
        json={"name": "Company A"},
    ).status_code == 409
    assert employee.status_code == 201


def test_password_is_hashed_and_never_returned(client, app):
    response = register(client, "secure@company.com", "Password123!")
    assert "password" not in response.get_json()["user"]
    with app.app_context():
        from models.user import User
        user = User.query.filter_by(email="secure@company.com").one()
        assert user.password_hash != "Password123!"


def test_production_requires_secret_key(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        create_app("production")


def test_cross_org_user_cannot_access_company_b(client):
    company_a = register(client, "a@company-a.com", "Password123!", "Company A")
    company_a_token = company_a.get_json()["token"]

    company_b = register(client, "b@company-b.com", "Password123!", "Company B")
    assert company_b.status_code == 201

    company_b_org = client.get(
        "/api/organizations/2",
        headers={"Authorization": f"Bearer {company_a_token}"},
    )
    assert company_b_org.status_code == 403

    company_b_members = client.get(
        "/api/organizations/2/members",
        headers={"Authorization": f"Bearer {company_a_token}"},
    )
    assert company_b_members.status_code == 403


def test_protected_endpoint_requires_auth(client):
    res = client.get("/api/users/me")
    assert res.status_code == 401


def test_invalid_login_rejected(client):
    register(client, "bad@company.com", "Password123!", "Company A")
    login_res = client.post(
        "/api/auth/login",
        json={"email": "bad@company.com", "password": "wrongpass"},
    )
    assert login_res.status_code == 401


def test_registration_and_me_accepts_organization_name_payload(client):
    res = client.post(
        "/api/auth/register",
        json={
            "name": "Org Admin",
            "email": "orgadmin@example.com",
            "password": "Password123!",
            "organizationName": "Alpha Corp",
        },
    )
    assert res.status_code == 201, res.get_data(as_text=True)
    payload = res.get_json()
    assert payload["user"]["organization"]["name"] == "Alpha Corp"
    me = client.get(
        "/api/users/me",
        headers={"Authorization": f"Bearer {payload['token']}"},
    )
    assert me.status_code == 200
    assert me.get_json()["organization"]["name"] == "Alpha Corp"


def test_company_a_admin_cannot_access_company_b_admin_endpoints(client):
    company_a = register(client, "a1@company-a.com", "Password123!", "Company A")
    company_b = register(client, "b1@company-b.com", "Password123!", "Company B")
    a_token = company_a.get_json()["token"]

    forbidden = client.get(
        "/api/organizations/2/members",
        headers={"Authorization": f"Bearer {a_token}"},
    )
    assert forbidden.status_code == 403

    forced = client.post(
        "/api/organizations/2/members",
        headers={"Authorization": f"Bearer {a_token}"},
        json={
            "email": "intruder@company-b.com",
            "password": "Password123!",
            "first_name": "Intruder",
            "last_name": "User",
        },
    )
    assert forced.status_code == 403
    assert company_b.status_code == 201


def test_employee_cannot_change_another_users_role_or_delete_members(client):
    admin = register(client, "admin@tenant-one.com", "Password123!", "Tenant One")
    admin_token = admin.get_json()["token"]

    created = client.post(
        "/api/organizations/1/members",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "email": "employee@tenant-one.com",
            "password": "Password123!",
            "first_name": "Employee",
            "last_name": "User",
        },
    )
    assert created.status_code == 201, created.get_data(as_text=True)
    employee_token = client.post(
        "/api/auth/login",
        json={"email": "employee@tenant-one.com", "password": "Password123!"},
    ).get_json()["token"]

    role_change = client.patch(
        "/api/organizations/1/members/1",
        headers={"Authorization": f"Bearer {employee_token}"},
        json={"role":"Organization Admin"},
    )
    assert role_change.status_code == 403

    delete_member = client.delete(
        "/api/organizations/1/members/1",
        headers={"Authorization": f"Bearer {employee_token}"},
    )
    assert delete_member.status_code == 403


def test_organization_membership_and_database_integrity_are_consistent(client):
    res = register(client, "integrity@company.com", "Password123!", "Integrity Org")
    token = res.get_json()["token"]
    me = client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    payload = me.get_json()
    assert payload["organizationId"] == 1
    assert payload["organization"]["name"] == "Integrity Org"
    assert payload["role"]["name"] == "Organization Admin"
