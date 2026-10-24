import math

import pytest

from optimization.carbon_calculator import (
    calculate_emissions_comparison,
    calculate_emissions_grams,
    calculate_energy_kwh,
    calculate_reduction_percent,
    calculate_savings_from_emissions,
    calculate_savings_grams,
    calculate_total_savings,
)
from optimization.eco_score import calculate_carbon_score, calculate_eco_score
from services.optimizer_service import compute_eco_score


def test_energy_and_emissions_use_documented_units():
    assert calculate_energy_kwh(500, 60) == 0.5
    assert calculate_emissions_grams(0.5, 400) == 200
    assert calculate_energy_kwh(0.05, 60) == 0.0001
    assert calculate_emissions_comparison(0.5, 600, 400) == {
        "baselineEmissionsGrams": 300,
        "recommendedEmissionsGrams": 200,
        "savingsGrams": 100,
    }


@pytest.mark.parametrize(
    ("power", "duration", "expected"),
    [(0, 60, 0), (500, 0, 0), (0, 0, 0)],
)
def test_zero_power_or_duration(power, duration, expected):
    assert calculate_energy_kwh(power, duration) == expected


@pytest.mark.parametrize(
    ("power", "duration"),
    [
        (None, 60),
        (500, None),
        (-1, 60),
        (500, -1),
        (math.nan, 60),
        (500, math.inf),
        (True, 60),
    ],
)
def test_invalid_energy_inputs_are_rejected(power, duration):
    with pytest.raises(ValueError):
        calculate_energy_kwh(power, duration)


def test_emissions_require_a_valid_carbon_intensity():
    with pytest.raises(ValueError, match="Carbon intensity"):
        calculate_emissions_grams(0.5, None)
    with pytest.raises(ValueError, match="Carbon intensity"):
        calculate_emissions_grams(0.5, math.nan)
    with pytest.raises(ValueError):
        calculate_emissions_grams(math.inf, 400)
    with pytest.raises(ValueError, match="Carbon intensity"):
        calculate_total_savings([], {"avgCarbonIntensity": None}, 400)


def test_finite_inputs_that_overflow_estimates_are_rejected():
    with pytest.raises(ValueError, match="Calculated energy"):
        calculate_energy_kwh(1e308, 1e308)
    with pytest.raises(ValueError, match="Calculated emissions"):
        calculate_emissions_grams(1e308, 1e308)


def test_savings_are_baseline_minus_recommended_emissions_and_can_be_negative():
    assert calculate_savings_grams(60, 500, 600, 400) == 100
    assert calculate_savings_grams(60, 500, 400, 600) == -100
    assert calculate_reduction_percent(-100, 200) == -50
    assert calculate_savings_from_emissions(400, 600) == -200
    assert calculate_savings_from_emissions(0.00005, 0) == 0.0001
    assert calculate_reduction_percent(100, 300) == 33.33


def test_window_savings_requires_carbon_intensity():
    with pytest.raises(ValueError, match="carbon intensity is required"):
        calculate_total_savings(
            [{"duration": 60, "powerDraw": 500}],
            {},
            400,
        )


def test_ecoscore_formula_is_the_same_for_recommendation_and_dashboard_inputs():
    carbon_score = calculate_carbon_score(200, 380, 800)
    expected = calculate_eco_score(carbon_score, 80, 30)
    recommendation = compute_eco_score(
        {
            "id": "activity-1",
            "type": "flexible",
            "status": "pending",
            "flexibilityScore": 80,
            "priorityScore": 30,
        },
        current_intensity=200,
        baseline_intensity=380,
        peak_intensity=800,
    )

    assert recommendation["carbonScore"] == carbon_score
    assert recommendation["ecoScore"] == expected


@pytest.mark.parametrize(
    "inputs",
    [
        (math.nan, 380, 800),
        (-1, 380, 800),
        (200, math.inf, 800),
        (200, 380, -1),
    ],
)
def test_ecoscore_rejects_invalid_intensity_inputs(inputs):
    with pytest.raises(ValueError):
        calculate_carbon_score(*inputs)


@pytest.mark.parametrize("score", [-1, 101, math.inf, math.nan])
def test_ecoscore_rejects_invalid_component_scores(score):
    with pytest.raises(ValueError):
        calculate_eco_score(score, 50, 50)
