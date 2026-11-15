from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from flask_jwt_extended import create_access_token

from app import create_app


def test_electricity_maps_put_preflight_allows_frontend_origin():
    app = create_app("testing")
    response = app.test_client().options(
        "/api/config/electricity-maps",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == "http://localhost:5173"
    assert "PUT" in response.headers["Access-Control-Allow-Methods"]
    allowed_headers = response.headers["Access-Control-Allow-Headers"].lower()
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers


def test_authenticated_put_accepts_token_without_returning_it(monkeypatch):
    app = create_app("testing")
    user = SimpleNamespace(
        id=7,
        organization_id=3,
        role=SimpleNamespace(name="Organization Admin"),
    )
    monkeypatch.setattr("auth_utils.get_current_user", lambda: user)

    with app.app_context():
        jwt = create_access_token(identity="7")

    with patch("routes.optimizer.save_organization_token", return_value=True) as save_token, \
         patch("routes.optimizer.clear_api_failure_cache"):
        response = app.test_client().put(
            "/api/config/electricity-maps",
            headers={
                "Authorization": f"Bearer {jwt}",
                "Origin": "http://localhost:5173",
            },
            json={"token": "test-provider-token"},
        )

    assert response.status_code == 200
    assert response.get_json()["data"] == {
        "configured": True,
        "source": "organization",
    }
    assert "test-provider-token" not in response.get_data(as_text=True)
    save_token.assert_called_once_with(3, "test-provider-token")
