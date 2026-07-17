"""
EcoScore Calculator
===================
Calculates a composite EcoScore for a task based on:
  - CarbonScore   (0-100): How clean is the grid right now?
  - FlexibilityScore (0-100): How deferrable is this task?
  - PriorityScore  (0-100): How urgently must it run?

Formula:
  EcoScore = 0.5 * CarbonScore + 0.3 * FlexibilityScore + 0.2 * PriorityScore

Recommendation thresholds:
  - ecoScore >= 70 and carbonScore >= 75 → Execute Now / Resume
  - ecoScore <= 35 or carbonScore <= 30  → Delay / Pause
  - otherwise                             → Schedule Automatically
"""

from __future__ import annotations

from typing import Literal

Recommendation = Literal[
    "Execute Now",
    "Delay Execution",
    "Schedule Automatically",
    "Pause Activity",
    "Resume Activity",
]


def calculate_carbon_score(
    current_intensity: float,
    baseline_intensity: float,
    peak_intensity: float,
) -> float:
    """
    Maps current grid intensity to a 0-100 clean-energy score.

    100 = grid is at its cleanest (minimal intensity)
    0   = grid is at peak dirty (maximum intensity)

    Args:
        current_intensity: Live grid carbon intensity in gCO2e/kWh
        baseline_intensity: Average/expected intensity for this zone
        peak_intensity: Maximum intensity observed/expected

    Returns:
        Carbon score in range [0, 100]
    """
    # Use a range anchored from 50% of baseline to peak so moderate grids
    # still yield a meaningful spread.
    range_val = max(50.0, peak_intensity - baseline_intensity * 0.5)
    carbon_diff = peak_intensity - current_intensity
    score = max(0.0, min(100.0, (carbon_diff / range_val) * 100.0))
    return round(score, 1)


def calculate_eco_score(
    carbon_score: float,
    flexibility_score: float,
    priority_score: float,
) -> float:
    """
    Weighted composite EcoScore.

    Args:
        carbon_score: Grid cleanliness score [0-100]
        flexibility_score: Task deferability score [0-100]
        priority_score: Task urgency score [0-100]

    Returns:
        EcoScore in range [0, 100], rounded to 1 decimal place
    """
    score = (
        0.5 * carbon_score
        + 0.3 * flexibility_score
        + 0.2 * priority_score
    )
    return round(score, 1)


def get_recommendation(
    task_type: str,
    task_status: str,
    flexibility_score: float,
    priority_score: float,
    current_intensity: float,
    baseline_intensity: float,
    peak_intensity: float,
) -> dict:
    """
    Full EcoScore evaluation for a task given current grid conditions.

    Args:
        task_type: 'flexible' or 'non-flexible'
        task_status: Current status of the task
        flexibility_score: How deferrable the task is [0-100]
        priority_score: How urgently the task must run [0-100]
        current_intensity: Current grid carbon intensity (gCO2e/kWh)
        baseline_intensity: Reference baseline intensity (gCO2e/kWh)
        peak_intensity: Maximum expected intensity (gCO2e/kWh)

    Returns:
        dict with keys:
            carbon_score, flexibility_score, priority_score,
            eco_score, recommendation, reason
    """
    carbon_score = calculate_carbon_score(
        current_intensity, baseline_intensity, peak_intensity
    )
    eco_score = calculate_eco_score(carbon_score, flexibility_score, priority_score)

    # Non-flexible tasks always run immediately
    if task_type == "non-flexible":
        return {
            "carbon_score": carbon_score,
            "flexibility_score": flexibility_score,
            "priority_score": priority_score,
            "eco_score": eco_score,
            "recommendation": "Execute Now",
            "reason": (
                "Critical active task. Must run immediately regardless of grid carbon levels."
            ),
        }

    # Flexible task recommendations
    if carbon_score >= 75:
        recommendation: Recommendation = (
            "Resume Activity" if task_status == "paused" else "Execute Now"
        )
        reason = (
            f"Grid is highly clean ({current_intensity:.0f} g/kWh). "
            "Excellent window for running flexible workloads."
        )
    elif carbon_score <= 30:
        if priority_score > 85:
            recommendation = "Execute Now"
            reason = (
                "Grid is carbon-intensive, but task priority is critical. "
                "Executing immediately."
            )
        else:
            recommendation = (
                "Pause Activity" if task_status == "running" else "Delay Execution"
            )
            reason = (
                f"Grid intensity is high ({current_intensity:.0f} g/kWh). "
                "Deferring to a future Green Window to minimise emissions."
            )
    else:
        # Moderate grid
        if priority_score > 60:
            recommendation = "Execute Now"
            reason = (
                f"Grid carbon intensity is moderate ({current_intensity:.0f} g/kWh). "
                "High task priority warrants immediate execution."
            )
        else:
            recommendation = "Schedule Automatically"
            reason = (
                f"Grid carbon intensity is moderate ({current_intensity:.0f} g/kWh). "
                "Optimal to defer to a designated Green Window."
            )

    return {
        "carbon_score": carbon_score,
        "flexibility_score": flexibility_score,
        "priority_score": priority_score,
        "eco_score": eco_score,
        "recommendation": recommendation,
        "reason": reason,
    }
