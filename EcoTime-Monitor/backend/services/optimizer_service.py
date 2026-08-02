"""
Optimizer Service
=================
Orchestrates the optimization pipeline:
  1. Receive tasks + windows (or fetch from carbon_service)
  2. Rank windows (window_ranking)
  3. Run scheduling algorithm (greedy or knapsack)
  4. Calculate carbon savings (carbon_calculator)
  5. Calculate EcoScores for individual tasks (eco_score)
  6. Return structured recommendations
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from optimization.eco_score import get_recommendation, calculate_carbon_score
from optimization.window_ranking import rank_windows
from optimization.greedy_scheduler import schedule_greedy, optimize_knapsack
from optimization.carbon_calculator import calculate_savings_grams, calculate_reduction_percent

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_BASELINE_INTENSITY = 380.0
DEFAULT_PEAK_INTENSITY = 800.0


# ---------------------------------------------------------------------------
# EcoScore Service
# ---------------------------------------------------------------------------

def compute_eco_score(
    task: dict,
    current_intensity: float,
    baseline_intensity: float = DEFAULT_BASELINE_INTENSITY,
    peak_intensity: float = DEFAULT_PEAK_INTENSITY,
) -> dict:
    """
    Calculate EcoScore and recommendation for a single task.

    Args:
        task: Task dict with type, status, flexibilityScore, priorityScore
        current_intensity: Live grid carbon intensity (gCO2e/kWh)
        baseline_intensity: Reference baseline intensity
        peak_intensity: Peak intensity for score calibration

    Returns:
        EcoScore dict with all scores and recommendation
    """
    result = get_recommendation(
        task_type=task.get("type", "flexible"),
        task_status=task.get("status", "idle"),
        flexibility_score=float(task.get("flexibilityScore", 70)),
        priority_score=float(task.get("priorityScore", 50)),
        current_intensity=current_intensity,
        baseline_intensity=baseline_intensity,
        peak_intensity=peak_intensity,
    )

    return {
        "taskId": task.get("id"),
        "carbonScore": result["carbon_score"],
        "flexibilityScore": result["flexibility_score"],
        "priorityScore": result["priority_score"],
        "ecoScore": result["eco_score"],
        "recommendation": result["recommendation"],
        "reason": result["reason"],
    }


# ---------------------------------------------------------------------------
# Scheduling Service
# ---------------------------------------------------------------------------

def run_scheduler(
    tasks: list[dict],
    window: dict,
    method: str,
    baseline_intensity: float = DEFAULT_BASELINE_INTENSITY,
) -> dict:
    """
    Run the specified scheduling algorithm and return a structured result.

    Args:
        tasks: List of task dicts
        window: Primary green window for scheduling
        method: 'greedy' or 'knapsack'
        baseline_intensity: Reference baseline for savings calculation

    Returns:
        dict with:
            result: OptimizationResult with selected tasks and metrics
            tasks: Full updated task list (assignments applied)
    """
    if not tasks:
        logger.warning("run_scheduler called with empty task list")
        return _empty_result(window, method, baseline_intensity)

    if not window:
        logger.warning("run_scheduler called with no window")
        return _empty_result(window, method, baseline_intensity)

    window_id = window.get("id", "unknown")
    now_iso = datetime.now(timezone.utc).isoformat()

    if method == "greedy":
        # Greedy uses ALL windows for multi-window allocation
        # For single-window calls, wrap it in a list
        windows = [window]
        scheduler_result = schedule_greedy(tasks, windows, baseline_intensity)

        selected_ids = [
            tid
            for task_ids in scheduler_result["window_allocations"].values()
            for tid in task_ids
        ]
        selected_tasks = [
            t for t in scheduler_result["scheduled_tasks"]
            if t.get("id") in selected_ids
        ]

        total_duration = sum(t.get("duration", 0) for t in selected_tasks)
        window_capacity = window.get("duration", 0)
        utilisation = (
            round((total_duration / window_capacity) * 100.0, 1)
            if window_capacity > 0
            else 0.0
        )

        result = {
            "method": "greedy",
            "windowId": window_id,
            "selectedTasks": selected_tasks,
            "totalSavedCo2": scheduler_result["total_saved_co2"],
            "totalDuration": total_duration,
            "windowCapacity": window_capacity,
            "utilizationPercent": utilisation,
            "createdAt": now_iso,
        }

        return {
            "result": result,
            "tasks": scheduler_result["scheduled_tasks"],
        }

    elif method == "knapsack":
        knap_result = optimize_knapsack(tasks, window, baseline_intensity)

        # Update full task list with knapsack assignments
        selected_ids = {t["id"] for t in knap_result["selected_tasks"]}
        updated_tasks = []
        for t in tasks:
            if t.get("type") == "flexible" and t.get("status") != "completed":
                is_selected = t["id"] in selected_ids
                updated_tasks.append({
                    **t,
                    "status": "delayed" if is_selected else "paused",
                    "assignedWindowId": window_id if is_selected else t.get("assignedWindowId"),
                })
            else:
                updated_tasks.append(t)

        result = {
            "method": "knapsack",
            "windowId": window_id,
            "selectedTasks": knap_result["selected_tasks"],
            "totalSavedCo2": knap_result["total_saved_co2"],
            "totalDuration": knap_result["total_duration"],
            "windowCapacity": knap_result["window_capacity"],
            "utilizationPercent": knap_result["utilisation_percent"],
            "createdAt": now_iso,
        }

        return {
            "result": result,
            "tasks": updated_tasks,
        }

    else:
        logger.error("Unknown scheduling method: %s", method)
        return _empty_result(window, method, baseline_intensity, error=f"Unknown method '{method}'")


def _empty_result(window: dict, method: str, baseline_intensity: float, error: str = "") -> dict:
    """Return an empty/zero scheduling result."""
    now_iso = datetime.now(timezone.utc).isoformat()
    result = {
        "method": method,
        "windowId": window.get("id") if window else None,
        "selectedTasks": [],
        "totalSavedCo2": 0.0,
        "totalDuration": 0,
        "windowCapacity": window.get("duration", 0) if window else 0,
        "utilizationPercent": 0.0,
        "createdAt": now_iso,
    }
    if error:
        result["error"] = error
    return {"result": result, "tasks": []}


# ---------------------------------------------------------------------------
# Multi-window Scheduler (used by orchestrator)
# ---------------------------------------------------------------------------

def schedule_all_windows(
    tasks: list[dict],
    windows: list[dict],
    baseline_intensity: float = DEFAULT_BASELINE_INTENSITY,
) -> dict:
    """
    Run greedy scheduler across all available green windows.
    Used by the orchestrator for full-day planning.

    Args:
        tasks: All pending/flexible tasks
        windows: All detected green windows for the period
        baseline_intensity: Reference baseline intensity

    Returns:
        Full greedy scheduling result
    """
    ranked_windows = rank_windows(windows)
    return schedule_greedy(tasks, ranked_windows, baseline_intensity)


# ---------------------------------------------------------------------------
# Carbon Savings Summary
# ---------------------------------------------------------------------------

def compute_savings_summary(
    selected_tasks: list[dict],
    window: dict,
    baseline_intensity: float,
) -> dict:
    """
    Compute a savings summary for a scheduling result.

    Returns:
        dict with totalSavedCo2, baselineCo2, reductionPercent
    """
    window_intensity = window.get("avgCarbonIntensity", baseline_intensity)
    saved = sum(
        calculate_savings_grams(
            t.get("duration", 0),
            t.get("powerDraw", 0),
            baseline_intensity,
            window_intensity,
        )
        for t in selected_tasks
    )

    # What would baseline cost?
    baseline_co2 = sum(
        (t.get("duration", 0) / 60.0) * (t.get("powerDraw", 0) / 1000.0) * baseline_intensity
        for t in selected_tasks
    )

    return {
        "totalSavedCo2": round(saved, 4),
        "baselineCo2": round(baseline_co2, 4),
        "reductionPercent": calculate_reduction_percent(saved, baseline_co2),
    }
