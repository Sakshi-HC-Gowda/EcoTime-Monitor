from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app import create_app
from extensions import db
from services import optimizer_service


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


@pytest.fixture
def carbon_fixture(monkeypatch):
    start = datetime(2030, 1, 1, tzinfo=timezone.utc)
    forecast = [
        {
            "datetime": (start + timedelta(hours=hour)).isoformat(),
            "carbonIntensity": value,
        }
        for hour, value in enumerate(
            [500, 100, 100, 500, 100, 100, 500, 500, 500, 500, 500, 500,
             500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500]
        )
    ]
    carbon = {
        "zone": "TEST",
        "current": {"datetime": (start - timedelta(minutes=1)).isoformat(), "carbonIntensity": 500},
        "history": [],
        "forecast": forecast,
        "isSimulated": True,
        "source": "simulation",
        "historySource": "simulation",
        "forecastSource": "simulation",
        "observedAt": (start - timedelta(minutes=1)).isoformat(),
    }

    class UntrainedPredictor:
        @staticmethod
        def is_trained():
            return False

    monkeypatch.setattr(optimizer_service, "get_carbon_data", lambda **_: carbon)
    monkeypatch.setattr("forecast.predict.get_predictor", lambda: UntrainedPredictor())
    return carbon, start


def task(task_id="activity-1", **updates):
    return {
        "id": task_id,
        "name": task_id,
        "type": "flexible",
        "status": "pending",
        "duration": 30,
        "powerDraw": 100,
        "priorityScore": 30,
        "flexibilityScore": 80,
        **updates,
    }


def interval(start, end):
    return {
        "startTime": start.isoformat(),
        "endTime": end.isoformat(),
        "duration": (end - start).total_seconds() / 60,
    }


def recommend(carbon_fixture, tasks, method="greedy", window_end_hour=8):
    _, start = carbon_fixture
    return optimizer_service.recommend_schedule(
        tasks=tasks,
        permitted_window=interval(start, start + timedelta(hours=window_end_hour)),
        method=method,
        baseline_intensity=600,
        zone_id="US-CA",
    )


@pytest.mark.parametrize("method", ["greedy", "knapsack"])
def test_rejects_window_when_activity_cannot_finish_before_deadline(carbon_fixture, method):
    _, start = carbon_fixture
    result = recommend(
        carbon_fixture,
        [task(deadline=(start + timedelta(hours=1, minutes=20)).isoformat())],
        method=method,
    )

    assert result["result"]["selectedTasks"] == []
    assert "complete activity duration" in result["recommendations"][0]["reason"]


def test_scheduled_activity_finishes_before_its_deadline(carbon_fixture):
    _, start = carbon_fixture
    deadline = start + timedelta(hours=1, minutes=45)
    result = recommend(
        carbon_fixture,
        [task(deadline=deadline.isoformat())],
    )

    selected = result["result"]["selectedTasks"]
    assert len(selected) == 1
    assert datetime.fromisoformat(selected[0]["scheduledEndTime"]) <= deadline
    assert selected[0]["estimatedEnergyUnit"] == "kWh"
    assert selected[0]["carbonImpactUnit"] == "gCO2e"
    assert result["recommendations"][0]["carbonSavingsUnit"] == "gCO2e"


@pytest.mark.parametrize("method", ["greedy", "knapsack"])
def test_inflexible_and_urgent_activities_are_never_delayed(carbon_fixture, method):
    result = recommend(
        carbon_fixture,
        [
            task("inflexible", type="non-flexible"),
            task("urgent", priorityScore=90),
        ],
        method=method,
    )

    assert result["result"]["selectedTasks"] == []
    assert "inflexible" in result["recommendations"][0]["reason"]
    assert "urgent" in result["recommendations"][1]["reason"]


@pytest.mark.parametrize("method", ["greedy", "knapsack"])
def test_rejects_green_window_shorter_than_activity(carbon_fixture, method):
    carbon, start = carbon_fixture
    carbon["forecast"] = [
        {"datetime": (start + timedelta(hours=hour)).isoformat(), "carbonIntensity": value}
        for hour, value in enumerate([500, 100, 500, 500, 500, 500])
    ]

    result = recommend(
        carbon_fixture,
        [task(duration=90)],
        method=method,
        window_end_hour=6,
    )

    assert result["result"]["selectedTasks"] == []
    assert "complete activity duration" in result["recommendations"][0]["reason"]


def test_no_lower_carbon_window_is_explained(carbon_fixture):
    carbon, start = carbon_fixture
    carbon["forecast"] = [
        {"datetime": (start + timedelta(hours=hour)).isoformat(), "carbonIntensity": 300}
        for hour in range(8)
    ]

    result = recommend(carbon_fixture, [task()])

    assert result["result"]["selectedTasks"] == []
    assert "No lower-carbon window" in result["recommendations"][0]["reason"]
    assert "no lower-carbon band" in result["carbonData"]["classification"]


@pytest.mark.parametrize("method", ["greedy", "knapsack"])
def test_optimizers_enforce_capacity_and_assign_non_overlapping_slots(carbon_fixture, method):
    carbon, start = carbon_fixture
    carbon["forecast"] = [
        {"datetime": (start + timedelta(hours=hour)).isoformat(), "carbonIntensity": value}
        for hour, value in enumerate([500, 100, 100, 500, 500, 500, 500, 500])
    ]
    activities = [task(f"task-{index}", duration=50) for index in range(3)]
    result = recommend(carbon_fixture, activities, method=method, window_end_hour=4)
    selected = result["result"]["selectedTasks"]

    assert len(selected) == 2
    assert sum(item["duration"] for item in selected) <= result["result"]["windowCapacity"]
    ordered = sorted(selected, key=lambda item: item["scheduledStartTime"])
    first_end = datetime.fromisoformat(ordered[0]["scheduledEndTime"])
    second_start = datetime.fromisoformat(ordered[1]["scheduledStartTime"])
    assert second_start >= first_end


def test_provider_api_failure_does_not_return_a_recommendation(client, monkeypatch):
    registered = client.post(
        "/api/auth/register",
        json={
            "email": "phase2@example.com",
            "password": "Password123!",
            "first_name": "Phase",
            "last_name": "Two",
            "organization_name": "Phase Two",
        },
    ).get_json()
    token = registered["token"]
    activity = client.post(
        "/api/activities",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "API failure task",
            "type": "flexible",
            "duration": 30,
            "powerDraw": 100,
        },
    ).get_json()["data"]

    monkeypatch.setattr(
        optimizer_service,
        "get_carbon_data",
        lambda **_: {
            "error": "Provider unavailable",
            "source": "simulation",
            "forecastSource": "simulation",
        },
    )
    response = client.post(
        "/api/recommendations",
        headers={"Authorization": f"Bearer {token}"},
        json={"tasks": [{"id": activity["id"]}], "method": "greedy"},
    )

    assert response.status_code == 503
    assert response.get_json()["success"] is False
    assert "Provider unavailable" in response.get_json()["error"]


def test_activity_scheduling_bounds_round_trip_through_storage(client):
    token = client.post(
        "/api/auth/register",
        json={
            "email": "bounds@example.com",
            "password": "Password123!",
            "first_name": "Bounds",
            "last_name": "User",
            "organization_name": "Bounds Org",
        },
    ).get_json()["token"]
    earliest = datetime.now(timezone.utc) + timedelta(hours=1)
    deadline = earliest + timedelta(hours=2)
    response = client.post(
        "/api/activities",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Bounded activity",
            "type": "flexible",
            "duration": 30,
            "powerDraw": 100,
            "earliestStart": earliest.isoformat(),
            "deadline": deadline.isoformat(),
        },
    )

    assert response.status_code == 201
    activity = response.get_json()["data"]
    assert datetime.fromisoformat(activity["earliestStart"]) == earliest
    assert datetime.fromisoformat(activity["deadline"]) == deadline


def test_api_unavailability_is_labeled_and_not_replaced_by_api_shaped_data(monkeypatch):
    from services import carbon_service

    monkeypatch.setattr(carbon_service, "get_electricity_maps_api_key", lambda: "configured")
    monkeypatch.setattr(carbon_service, "_fetch_live_data", lambda *_: None)

    result = carbon_service.get_carbon_data("US-CA")

    assert result["source"] == "simulation"
    assert result["forecastSource"] == "simulation"
    assert result["observedAt"] == result["current"]["datetime"]
    assert "unavailable" in result["error"]


def test_trained_forecast_failure_does_not_fall_back_to_simulation(monkeypatch):
    from forecast.predict import ForecastPredictor

    predictor = ForecastPredictor.__new__(ForecastPredictor)
    predictor._model = object()
    predictor._feature_names = []
    history_start = datetime(2030, 1, 1, tzinfo=timezone.utc)
    history = [
        {
            "datetime": (history_start + timedelta(hours=hour)).isoformat(),
            "carbonIntensity": 200,
        }
        for hour in range(24)
    ]

    def fail_model(*_args, **_kwargs):
        raise RuntimeError("model unavailable")

    def fail_simulation(*_args, **_kwargs):
        raise AssertionError("simulation fallback must not run")

    predictor._ml_forecast = fail_model
    predictor._simulation_forecast = fail_simulation

    with pytest.raises(RuntimeError, match="model unavailable"):
        predictor.predict("US-CA", history=history)


def test_recommendations_and_carbon_data_endpoints_require_auth(client):
    response = client.post(
        "/api/recommendations",
        json={"tasks": [{"id": "untrusted"}], "method": "greedy"},
    )
    assert response.status_code == 401
    for path in ("/api/carbon", "/api/windows", "/api/zones", "/api/forecast", "/api/forecast/info"):
        assert client.get(path).status_code == 401
