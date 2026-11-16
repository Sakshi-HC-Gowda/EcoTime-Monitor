from __future__ import annotations

from unittest.mock import MagicMock, patch

import requests
import pytest
from sqlalchemy.exc import ProgrammingError

from app import create_app
from models.organization_provider_credential import OrganizationProviderCredential
from services import carbon_service
from services.provider_credentials import (
    get_electricity_maps_token,
    get_environment_token,
)


def _response(status_code: int, payload: dict) -> MagicMock:
    response = MagicMock(spec=requests.Response)
    response.status_code = status_code
    response.ok = 200 <= status_code < 300
    response.text = "provider response"
    response.json.return_value = payload
    return response


@pytest.fixture
def app():
    return create_app("testing")


def test_placeholder_environment_token_is_not_used(monkeypatch):
    monkeypatch.setenv("ELECTRICITY_MAPS_API_KEY", "your_api_key_here")

    assert get_environment_token() is None


def test_missing_credentials_table_uses_environment_fallback_without_traceback(
    app, monkeypatch, caplog
):
    monkeypatch.setenv("ELECTRICITY_MAPS_API_KEY", "environment-token")

    with app.app_context():
        with patch.object(
            OrganizationProviderCredential.query,
            "filter_by",
            side_effect=ProgrammingError(
                'relation "organization_provider_credentials" does not exist',
                {},
                type("PostgresError", (), {"pgcode": "42P01"})(),
            ),
        ), patch("services.provider_credentials.db.session.rollback"):
            token, source = get_electricity_maps_token(42)

    assert token == "environment-token"
    assert source == "environment"
    assert caplog.records
    assert caplog.records[-1].exc_info is None
    assert "apply Alembic revision 20261115_provider_credentials" in caplog.text


@patch("services.carbon_service.requests.get")
def test_valid_provider_response_is_marked_provider_reported(mock_get):
    mock_get.side_effect = [
        _response(200, {
            "datetime": "2026-10-24T12:00:00Z",
            "carbonIntensity": 635,
        }),
        _response(200, {
            "forecast": [{
                "datetime": "2026-10-24T13:00:00Z",
                "carbonIntensity": 620,
            }],
        }),
    ]

    result = carbon_service._fetch_live_data("IN-SO", "test-token")

    assert result is not None
    assert result["isSimulated"] is False
    assert result["source"] == "electricity_maps_api"
    assert result["current"]["carbonIntensity"] == 635


@patch("services.carbon_service.requests.get")
@patch("services.carbon_service.get_electricity_maps_api_key", return_value="invalid-token")
def test_invalid_provider_token_returns_labelled_simulation(mock_key, mock_get):
    mock_get.return_value = _response(401, {"error": "unauthorized"})
    carbon_service.clear_api_failure_cache("IN-SO")

    result = carbon_service.get_carbon_data("IN-SO")

    assert result["isSimulated"] is True
    assert result["source"] == "simulation"
    assert "rejected" in result["error"]
    mock_key.assert_called_once_with(None)


@patch("services.carbon_service.requests.get")
@patch("services.carbon_service.get_electricity_maps_api_key", return_value="test-token")
def test_provider_timeout_returns_labelled_simulation(mock_key, mock_get):
    mock_get.side_effect = requests.exceptions.Timeout("timed out")
    carbon_service.clear_api_failure_cache("IN-SO")

    result = carbon_service.get_carbon_data("IN-SO")

    assert result["isSimulated"] is True
    assert result["source"] == "simulation"
    assert "timed out" in result["error"]


@patch("services.carbon_service.requests.get")
def test_successful_provider_data_is_reused_briefly(mock_get):
    mock_get.side_effect = [
        _response(200, {
            "datetime": "2026-10-24T12:00:00Z",
            "carbonIntensity": 635,
        }),
        _response(200, {
            "forecast": [{
                "datetime": "2026-10-24T13:00:00Z",
                "carbonIntensity": 620,
            }],
        }),
    ]
    carbon_service.clear_api_failure_cache()

    first = carbon_service.get_carbon_data("IN-SO", api_key="cache-token")
    second = carbon_service.get_carbon_data("IN-SO", api_key="cache-token")

    assert first["source"] == "electricity_maps_api"
    assert second == first
    assert mock_get.call_count == 2


def test_clearing_provider_failure_cache_allows_retry():
    carbon_service._last_api_failure["IN-SO"] = 1.0
    carbon_service._last_api_error["IN-SO"] = "old error"

    carbon_service.clear_api_failure_cache("IN-SO")

    assert "IN-SO" not in carbon_service._last_api_failure
    assert "IN-SO" not in carbon_service._last_api_error
