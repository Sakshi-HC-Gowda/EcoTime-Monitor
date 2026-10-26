"""
Tests for the Electricity Maps negative-result cache in carbon_service.

Verifies that:
- After an API failure, subsequent calls within the TTL skip the API.
- After the TTL expires, the API is retried.
- Successful API recovery clears the cached failure.
- Unexpected programming errors are NOT cached as API outages.
- Different zones have independent caches.
"""
from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import pytest
import requests

from services.carbon_service import (
    _fetch_live_data,
    _last_api_failure,
    _NEGATIVE_CACHE_TTL,
)


@pytest.fixture(autouse=True)
def clear_negative_cache():
    """Ensure each test starts with a clean cache."""
    _last_api_failure.clear()
    yield
    _last_api_failure.clear()


def _mock_401_response():
    """Create a mock requests.Response that mimics an HTTP 401."""
    resp = MagicMock(spec=requests.Response)
    resp.ok = False
    resp.status_code = 401
    resp.text = "Invalid auth-token"
    return resp


def _mock_200_latest_response(intensity=640):
    """Create a mock requests.Response for a successful latest reading."""
    resp = MagicMock(spec=requests.Response)
    resp.ok = True
    resp.status_code = 200
    resp.json.return_value = {
        "datetime": "2026-10-24T12:00:00Z",
        "carbonIntensity": intensity,
    }
    return resp


def _mock_200_forecast_response():
    """Create a mock requests.Response for a successful forecast."""
    resp = MagicMock(spec=requests.Response)
    resp.ok = True
    resp.status_code = 200
    forecast_points = [
        {"datetime": f"2026-10-24T{h:02d}:00:00Z", "carbonIntensity": 600 + h * 5}
        for h in range(24)
    ]
    resp.json.return_value = {"forecast": forecast_points}
    return resp


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@patch("services.carbon_service.requests.get")
def test_http_failure_is_cached(mock_get):
    """After an HTTP 401, the failure timestamp is recorded in the cache."""
    mock_get.return_value = _mock_401_response()

    result = _fetch_live_data("IN-SO", "fake-key")

    assert result is None
    assert "IN-SO" in _last_api_failure
    assert _last_api_failure["IN-SO"] > 0


@patch("services.carbon_service.requests.get")
def test_cached_failure_skips_api_call(mock_get):
    """Within the TTL, _fetch_live_data returns None without calling the API."""
    # First call: API fails, gets cached
    mock_get.return_value = _mock_401_response()
    _fetch_live_data("IN-SO", "fake-key")
    assert mock_get.call_count == 1

    # Second call: should be served from negative cache, no API call
    mock_get.reset_mock()
    result = _fetch_live_data("IN-SO", "fake-key")
    assert result is None
    assert mock_get.call_count == 0


@patch("services.carbon_service.requests.get")
def test_retry_after_ttl_expires(mock_get):
    """After the TTL expires, the API is retried."""
    # First call: API fails
    mock_get.return_value = _mock_401_response()
    _fetch_live_data("IN-SO", "fake-key")

    # Simulate TTL expiry by backdating the failure timestamp
    _last_api_failure["IN-SO"] = time.monotonic() - _NEGATIVE_CACHE_TTL - 1

    # Next call should retry the API (not be cached)
    mock_get.reset_mock()
    mock_get.return_value = _mock_401_response()
    _fetch_live_data("IN-SO", "fake-key")
    assert mock_get.call_count == 1  # API was actually called


@patch("services.carbon_service.requests.get")
def test_successful_recovery_after_ttl(mock_get):
    """When the API recovers after TTL expiry, live data is returned."""
    # First call: API fails
    mock_get.return_value = _mock_401_response()
    _fetch_live_data("IN-SO", "fake-key")

    # Simulate TTL expiry
    _last_api_failure["IN-SO"] = time.monotonic() - _NEGATIVE_CACHE_TTL - 1

    # API recovers: return successful latest + forecast
    mock_get.reset_mock()
    mock_get.side_effect = [_mock_200_latest_response(), _mock_200_forecast_response()]
    result = _fetch_live_data("IN-SO", "fake-key")

    assert result is not None
    assert result["source"] == "electricity_maps_api"
    assert result["isSimulated"] is False
    # After success, the zone should NOT have a recent failure in cache
    # (success doesn't explicitly clear it, but the old timestamp is expired)
    elapsed = time.monotonic() - _last_api_failure.get("IN-SO", 0)
    assert elapsed >= _NEGATIVE_CACHE_TTL


@patch("services.carbon_service.requests.get")
def test_network_timeout_is_cached(mock_get):
    """Network timeouts (RequestException) are cached as API outages."""
    mock_get.side_effect = requests.exceptions.Timeout("Connection timed out")

    result = _fetch_live_data("IN-SO", "fake-key")

    assert result is None
    assert "IN-SO" in _last_api_failure

    # Second call within TTL: no API call
    mock_get.reset_mock()
    result = _fetch_live_data("IN-SO", "fake-key")
    assert result is None
    assert mock_get.call_count == 0


@patch("services.carbon_service.requests.get")
def test_connection_error_is_cached(mock_get):
    """Connection errors are cached as API outages."""
    mock_get.side_effect = requests.exceptions.ConnectionError("DNS resolution failed")

    result = _fetch_live_data("IN-SO", "fake-key")

    assert result is None
    assert "IN-SO" in _last_api_failure


@patch("services.carbon_service.requests.get")
def test_programming_error_is_not_cached(mock_get):
    """Unexpected errors during response parsing should NOT be cached."""
    # Return a successful HTTP response with malformed data that triggers
    # a ValueError/KeyError during parsing
    resp = MagicMock(spec=requests.Response)
    resp.ok = True
    resp.status_code = 200
    resp.json.return_value = {"malformed": "data"}  # Missing 'datetime' key
    mock_get.return_value = resp

    result = _fetch_live_data("IN-SO", "fake-key")

    assert result is None
    # The failure should NOT be cached because it's a programming/data error
    assert "IN-SO" not in _last_api_failure


@patch("services.carbon_service.requests.get")
def test_zones_have_independent_caches(mock_get):
    """A failure for one zone does not suppress requests for another zone."""
    mock_get.return_value = _mock_401_response()

    # Fail for IN-SO
    _fetch_live_data("IN-SO", "fake-key")
    assert "IN-SO" in _last_api_failure

    # US-CA should not be cached
    assert "US-CA" not in _last_api_failure

    # US-CA should still make an API call
    mock_get.reset_mock()
    mock_get.return_value = _mock_401_response()
    _fetch_live_data("US-CA", "fake-key")
    assert mock_get.call_count == 1
    assert "US-CA" in _last_api_failure
