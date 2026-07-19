"""
Carbon Savings Calculator
=========================
Calculates CO2 savings (in grams) from scheduling tasks
inside Green Windows instead of running them at baseline grid intensity.

Formula per task:
  savings_g = (duration_hours) × (power_kW) × (baseline_intensity − window_intensity)

where the result is in gCO2e.
"""

from __future__ import annotations


def calculate_savings_grams(
    duration_minutes: float,
    power_watts: float,
    baseline_intensity: float,
    window_intensity: float,
) -> float:
    """
    Calculate CO2 savings in grams for a single task run in a green window.

    Args:
        duration_minutes: Task runtime duration in minutes
        power_watts: Task power consumption in Watts
        baseline_intensity: Reference grid intensity (gCO2e/kWh) — "dirty" baseline
        window_intensity: Actual carbon intensity during the green window (gCO2e/kWh)

    Returns:
        CO2 savings in grams. Returns 0.0 if window is dirtier than baseline.
    """
    hours = duration_minutes / 60.0
    kw = power_watts / 1000.0
    delta = max(0.0, baseline_intensity - window_intensity)
    savings = hours * kw * delta
    return round(savings, 4)


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
    window_intensity = window.get("avgCarbonIntensity", baseline_intensity)
    total = sum(
        calculate_savings_grams(
            t.get("duration", 0),
            t.get("powerDraw", 0),
            baseline_intensity,
            window_intensity,
        )
        for t in tasks
    )
    return round(total, 4)


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
        Reduction percentage in range [0, 100]
    """
    if baseline_grams <= 0:
        return 0.0
    return round(min(100.0, (savings_grams / baseline_grams) * 100.0), 2)
