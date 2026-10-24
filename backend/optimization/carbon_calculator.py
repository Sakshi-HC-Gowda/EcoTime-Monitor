"""
Carbon Savings Calculator
=========================
Calculates estimated energy use, emissions, and savings using a single set of
units: minutes, watts, kWh, and gCO2e.

E (kWh) = power (W) × duration (min) / 60000
C (gCO2e) = E × intensity (gCO2e/kWh)
S (gCO2e) = baseline emissions - recommended emissions
"""

from __future__ import annotations

import math


def _round_calculation(value: float, digits: int = 4) -> float:
    """Round consistently with the browser calculations, away from zero at ties."""
    scale = 10**digits
    scaled_magnitude = abs(value) * scale
    if not math.isfinite(scaled_magnitude):
        return value
    magnitude = math.floor(scaled_magnitude + 0.5) / scale
    return math.copysign(magnitude, value)


def _non_negative_finite(value: float, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a non-negative finite number.")
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"{name} must be a non-negative finite number.")
    return float(value)


def calculate_energy_kwh(power_watts: float, duration_minutes: float) -> float:
    """Estimate energy in kWh from estimated power (W) and duration (minutes)."""
    power = _non_negative_finite(power_watts, "Power")
    duration = _non_negative_finite(duration_minutes, "Duration")
    energy = (power * duration) / 60000.0
    if not math.isfinite(energy):
        raise ValueError("Calculated energy must be a finite number.")
    return _round_calculation(energy)


def calculate_emissions_grams(energy_kwh: float, intensity_g_per_kwh: float) -> float:
    """Estimate emissions in gCO2e from energy (kWh) and intensity (gCO2e/kWh)."""
    energy = _non_negative_finite(energy_kwh, "Energy")
    intensity = _non_negative_finite(intensity_g_per_kwh, "Carbon intensity")
    emissions = energy * intensity
    if not math.isfinite(emissions):
        raise ValueError("Calculated emissions must be a finite number.")
    return _round_calculation(emissions)


def calculate_savings_from_emissions(
    baseline_emissions_grams: float,
    recommended_emissions_grams: float,
) -> float:
    """Return baseline emissions minus recommended emissions in gCO2e."""
    baseline = _non_negative_finite(
        baseline_emissions_grams, "Baseline emissions"
    )
    recommended = _non_negative_finite(
        recommended_emissions_grams, "Recommended emissions"
    )
    return _round_calculation(baseline - recommended)


def calculate_emissions_comparison(
    energy_kwh: float,
    baseline_intensity: float,
    recommended_intensity: float,
) -> dict[str, float]:
    """Calculate comparable baseline/recommended emissions and signed savings."""
    baseline = calculate_emissions_grams(energy_kwh, baseline_intensity)
    recommended = calculate_emissions_grams(energy_kwh, recommended_intensity)
    return {
        "baselineEmissionsGrams": baseline,
        "recommendedEmissionsGrams": recommended,
        "savingsGrams": calculate_savings_from_emissions(baseline, recommended),
    }


def calculate_savings_grams(
    duration_minutes: float,
    power_watts: float,
    baseline_intensity: float,
    window_intensity: float,
) -> float:
    """
    Calculate estimated emissions savings in gCO2e for a task.

    Args:
        duration_minutes: Task runtime duration in minutes
        power_watts: Estimated task power in Watts
        baseline_intensity: Reference grid intensity (gCO2e/kWh) — "dirty" baseline
        window_intensity: Recommended-time intensity (gCO2e/kWh)

    Returns:
        Baseline emissions minus recommended emissions. This can be negative.
    """
    energy_kwh = calculate_energy_kwh(power_watts, duration_minutes)
    return calculate_emissions_comparison(
        energy_kwh, baseline_intensity, window_intensity
    )["savingsGrams"]


def calculate_total_savings(
    tasks: list[dict],
    window: dict,
    baseline_intensity: float,
) -> float:
    """
    Calculate total CO2 savings for a list of tasks scheduled in one window.

    Args:
        tasks: List of task dicts with 'duration' (minutes) and 'powerDraw' (Watts)
        window: Green window dict with 'avgCarbonIntensity'
        baseline_intensity: Reference baseline intensity (gCO2e/kWh)

    Returns:
        Total CO2 savings in grams across all tasks
    """
    if not isinstance(tasks, list):
        raise ValueError("Tasks must be provided as a list.")
    if not isinstance(window, dict) or "avgCarbonIntensity" not in window:
        raise ValueError("Window carbon intensity is required.")
    window_intensity = window["avgCarbonIntensity"]
    calculate_emissions_grams(0.0, baseline_intensity)
    calculate_emissions_grams(0.0, window_intensity)
    baseline_total = 0.0
    recommended_total = 0.0
    for task in tasks:
        if not isinstance(task, dict) or "duration" not in task or "powerDraw" not in task:
            raise ValueError("Every task requires estimated duration and power.")
        comparison = calculate_emissions_comparison(
            calculate_energy_kwh(task["powerDraw"], task["duration"]),
            baseline_intensity,
            window_intensity,
        )
        baseline_total += comparison["baselineEmissionsGrams"]
        recommended_total += comparison["recommendedEmissionsGrams"]
    return calculate_savings_from_emissions(baseline_total, recommended_total)


def calculate_reduction_percent(
    savings_grams: float,
    baseline_grams: float,
) -> float:
    """
    Calculate the percentage CO2 reduction achieved vs baseline.

    Args:
        savings_grams: Actual CO2 savings achieved
        baseline_grams: CO2 that would have been emitted at baseline

    Returns:
        Signed percentage: negative when recommended emissions exceed baseline emissions.
    """
    baseline = _non_negative_finite(baseline_grams, "Baseline emissions")
    savings = _finite_number(savings_grams, "Emissions savings")
    if baseline == 0:
        return 0.0
    reduction_percent = (savings / baseline) * 100.0
    if not math.isfinite(reduction_percent):
        raise ValueError("Reduction percentage must be a finite number.")
    return _round_calculation(reduction_percent, 2)


def _finite_number(value: float, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number.")
    return float(value)
