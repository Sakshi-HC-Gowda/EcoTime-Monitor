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
import math
from datetime import datetime, timezone
from datetime import timedelta

from optimization.eco_score import get_recommendation, calculate_carbon_score
from optimization.window_ranking import rank_windows
from optimization.greedy_scheduler import (
    _is_schedulable,
    schedule_greedy,
    optimize_knapsack,
)
from optimization.carbon_calculator import (
    calculate_emissions_comparison,
    calculate_emissions_grams,
    calculate_energy_kwh,
    calculate_reduction_percent,
    calculate_savings_from_emissions,
    calculate_savings_grams,
)
from services.carbon_service import (
    GRID_ZONES,
    GREEN_WINDOW_THRESHOLD_RATIO,
    detect_green_windows,
    get_carbon_data,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_BASELINE_INTENSITY = 380.0
DEFAULT_PEAK_INTENSITY = 800.0


class RecommendationDataUnavailable(RuntimeError):
    """Carbon or forecast inputs were unavailable or invalid."""


def _parse_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def _valid_forecast(points: object) -> list[dict]:
    if not isinstance(points, list):
        return []
    validated: list[dict] = []
    previous: datetime | None = None
    for point in points:
        if not isinstance(point, dict):
            return []
        timestamp = _parse_datetime(point.get("datetime"))
        intensity = point.get("carbonIntensity")
        if (
            timestamp is None
            or isinstance(intensity, bool)
            or not isinstance(intensity, (int, float))
            or not math.isfinite(intensity)
            or intensity < 0
            or (previous is not None and timestamp <= previous)
        ):
            return []
        if previous is not None and abs((timestamp - previous).total_seconds() - 3600) > 60:
            return []
        validated.append({**point, "datetime": timestamp.isoformat()})
        previous = timestamp
    return validated


def _window_end(window: dict) -> datetime | None:
    start = _parse_datetime(window.get("startTime"))
    end = _parse_datetime(window.get("endTime"))
    if "endTime" in window and end is None:
        return None
    if end is not None:
        if "duration" in window:
            if isinstance(window["duration"], bool):
                return None
            try:
                duration = float(window["duration"])
            except (TypeError, ValueError):
                return None
            actual_duration = (
                (end - start).total_seconds() / 60
                if start is not None else 0
            )
            if (
                not math.isfinite(duration)
                or duration <= 0
                or abs(actual_duration - duration) > 1
            ):
                return None
        return end
    try:
        raw_duration = window.get("duration", 0)
        if isinstance(raw_duration, bool):
            return None
        duration = float(raw_duration)
    except (TypeError, ValueError):
        return None
    if start is None or not math.isfinite(duration) or duration <= 0:
        return None
    from datetime import timedelta
    return start + timedelta(minutes=duration)


def _place_allocations(
    allocations: dict[str, list[str]],
    tasks: list[dict],
    windows: list[dict],
    permitted_start: datetime,
    permitted_end: datetime,
) -> dict[str, dict]:
    """Give every selected task a distinct time slot within its assigned window."""
    tasks_by_id = {str(task["id"]): task for task in tasks}
    placed: dict[str, dict] = {}
    windows_by_id = {str(window["id"]): window for window in windows}
    for window_id, activity_ids in allocations.items():
        window = windows_by_id.get(str(window_id))
        if window is None:
            continue
        window_start = _parse_datetime(window.get("startTime"))
        window_end = _window_end(window)
        if window_start is None or window_end is None:
            continue
        cursor = max(window_start, permitted_start)
        ordered_ids = sorted(
            activity_ids,
            key=lambda activity_id: (
                _parse_datetime(tasks_by_id[activity_id].get("deadline"))
                or permitted_end,
                _parse_datetime(tasks_by_id[activity_id].get("earliestStart"))
                or permitted_start,
                activity_id,
            ),
        )
        for activity_id in ordered_ids:
            task = tasks_by_id.get(activity_id)
            if task is None:
                continue
            try:
                duration = float(task["duration"])
            except (KeyError, TypeError, ValueError):
                continue
            earliest = _parse_datetime(task.get("earliestStart")) or permitted_start
            deadline = _parse_datetime(task.get("deadline")) or permitted_end
            start = max(cursor, earliest, window_start)
            end = start + timedelta(minutes=duration)
            if end > min(window_end, deadline, permitted_end):
                continue
            placed[activity_id] = {
                **task,
                "assignedWindowId": str(window_id),
                "scheduledStartTime": start.isoformat(),
                "scheduledEndTime": end.isoformat(),
                "status": "delayed",
            }
            cursor = end
    return placed


def recommend_schedule(
    tasks: list[dict],
    permitted_window: dict | None,
    method: str,
    baseline_intensity: float = DEFAULT_BASELINE_INTENSITY,
    zone_id: str = "US-CA",
) -> dict:
    """Connect verified carbon/forecast data to existing window and scheduling algorithms."""
    calculate_emissions_grams(0.0, baseline_intensity)
    for task in tasks:
        if "duration" not in task or "powerDraw" not in task:
            raise ValueError("Every activity requires estimated duration and power.")
        duration = calculate_energy_kwh(task["powerDraw"], task["duration"])
        if duration == 0 and float(task["duration"]) <= 0:
            raise ValueError("Activity duration must be greater than zero.")
    if zone_id not in GRID_ZONES:
        raise ValueError(f"Unsupported grid zone '{zone_id}'.")
    carbon = get_carbon_data(zone_id=zone_id, offset_hours=0)
    # _simulation_fallback() sets an informational "error" key on valid
    # simulated data explaining *why* the live API was unavailable.
    # Only reject if the data is NOT a usable simulated fallback.
    if carbon.get("error") and not carbon.get("isSimulated"):
        raise RecommendationDataUnavailable(str(carbon["error"]))
    if not isinstance(carbon.get("current"), dict) or _parse_datetime(
        carbon["current"].get("datetime")
    ) is None:
        raise RecommendationDataUnavailable(
            "Carbon data has no valid observation timestamp."
        )

    from forecast.predict import get_predictor

    predictor = get_predictor()
    history = carbon.get("history", [])
    if (
        predictor.is_trained()
        and not carbon.get("isSimulated")
        and len(history) >= 24
    ):
        try:
            predictor._validate_history(history)
            forecast = _valid_forecast(
                predictor.predict(zone_id=zone_id, horizon_hours=24, history=history)
            )
        except Exception as exc:
            raise RecommendationDataUnavailable(
                f"Forecast model failed validation: {exc}"
            ) from exc
        forecast_source = "ml_model"
    else:
        forecast = _valid_forecast(carbon.get("forecast"))
        forecast_source = carbon.get("forecastSource", "unavailable")
        if not forecast or forecast_source == "unavailable":
            raise RecommendationDataUnavailable(
                "No valid carbon forecast is available for scheduling."
            )

    if permitted_window is None:
        forecast_times = [_parse_datetime(point["datetime"]) for point in forecast]
        valid_times = [value for value in forecast_times if value is not None]
        if not valid_times:
            raise RecommendationDataUnavailable(
                "The forecast has no valid timestamps for a scheduling interval."
            )
        permitted_start = valid_times[0]
        permitted_end = valid_times[-1] + timedelta(hours=1)
    else:
        permitted_start = _parse_datetime(permitted_window.get("startTime"))
        permitted_end = _window_end(permitted_window)
    if (
        permitted_start is None
        or permitted_end is None
        or permitted_end <= permitted_start
    ):
        raise ValueError("The permitted scheduling interval is invalid.")

    detected_windows = detect_green_windows(
        forecast=forecast,
        current_datetime=carbon["current"]["datetime"],
    )
    for window in detected_windows:
        window["id"] = f"{zone_id}:{window['id']}"
    windows = rank_windows(detected_windows)
    bounded_windows = []
    for window in windows:
        start = _parse_datetime(window.get("startTime"))
        end = _window_end(window)
        if start is not None and end is not None:
            clipped_start = max(start, permitted_start)
            clipped_end = min(end, permitted_end)
            clipped_duration = (clipped_end - clipped_start).total_seconds() / 60
            if clipped_duration > 0:
                bounded_windows.append({
                    **window,
                    "startTime": clipped_start.isoformat(),
                    "endTime": clipped_end.isoformat(),
                    "duration": clipped_duration,
                })

    eligible_tasks: list[dict] = []
    allowed_windows: dict[str, set[str]] = {}
    recommendation_by_id: dict[str, dict] = {}
    for task in tasks:
        task_id = str(task.get("id", ""))
        task_type = task.get("type")
        priority = task.get("priorityScore", 50)
        status = task.get("status")
        duration = task.get("duration")
        earliest = (
            _parse_datetime(task.get("earliestStart"))
            if task.get("earliestStart") else permitted_start
        )
        deadline = (
            _parse_datetime(task.get("deadline"))
            if task.get("deadline") else permitted_end
        )

        if task_type != "flexible":
            reason = "This activity is inflexible and will not be delayed."
            recommendation = "Run at its existing time"
        elif isinstance(priority, (int, float)) and priority >= 80:
            reason = "This activity is urgent (priority score 80 or higher) and will not be delayed."
            recommendation = "Run now"
        elif status not in {"idle", "pending", "paused", "delayed"}:
            reason = f"Activity status '{status}' is not eligible for rescheduling."
            recommendation = "Keep current schedule"
        elif earliest is None or deadline is None or deadline <= earliest:
            reason = "The activity's permitted interval or deadline is invalid."
            recommendation = "No feasible window"
        elif not _is_schedulable(task):
            reason = "Activity scheduling details are invalid; it was not rescheduled."
            recommendation = "No feasible window"
        else:
            try:
                duration_value = float(duration)
            except (TypeError, ValueError):
                duration_value = 0
            fits = {
                str(window["id"])
                for window in bounded_windows
                if (start := _parse_datetime(window.get("startTime"))) is not None
                and (end := _window_end(window)) is not None
                and max(start, earliest) + timedelta(minutes=duration_value)
                <= min(end, deadline, permitted_end)
                and duration_value <= float(window.get("duration", 0))
            }
            if fits:
                eligible_tasks.append(task)
                allowed_windows[task_id] = fits
                recommendation_by_id[task_id] = {
                    "activityId": task_id,
                    "recommendation": "Schedule in a lower-carbon window",
                    "reason": (
                        "The complete activity fits before its deadline in a Green Window "
                        "that is lower-carbon relative to the forecast range."
                    ),
                    "status": "pending",
                    "windowId": None,
                    "startTime": None,
                }
                continue
            if not bounded_windows:
                reason = "No lower-carbon window is available within the permitted scheduling interval."
            elif not any(
                (_parse_datetime(window.get("startTime")) or permitted_start) >= earliest
                and (_parse_datetime(window.get("startTime")) or permitted_start) < deadline
                for window in bounded_windows
            ):
                reason = "No lower-carbon window starts before this activity's deadline."
            else:
                reason = (
                    "No available lower-carbon window can accommodate the complete "
                    "activity duration before its deadline."
                )
            recommendation = "No feasible window"

        recommendation_by_id[task_id] = {
            "activityId": task_id,
            "recommendation": recommendation,
            "reason": reason,
            "status": "not_scheduled",
            "windowId": None,
            "startTime": None,
        }

    if method == "greedy":
        scheduled = schedule_greedy(
            eligible_tasks,
            bounded_windows,
            baseline_intensity,
            allowed_window_ids_by_task=allowed_windows,
        )
        allocations = scheduled["window_allocations"]
    else:
        allocations = {str(window["id"]): [] for window in bounded_windows}
        remaining = {str(task["id"]): task for task in eligible_tasks}
        for window in bounded_windows:
            window_id = str(window["id"])
            window_tasks = [
                task for task_id, task in remaining.items()
                if window_id in allowed_windows.get(task_id, set())
            ]
            result = optimize_knapsack(window_tasks, window, baseline_intensity)
            for selected in result["selected_tasks"]:
                selected_id = str(selected["id"])
                allocations[window_id].append(selected_id)
                remaining.pop(selected_id, None)
                selected["status"] = "delayed"
                selected["assignedWindowId"] = window_id

    placements = _place_allocations(
        allocations,
        eligible_tasks,
        bounded_windows,
        permitted_start,
        permitted_end,
    )
    window_by_id = {str(window["id"]): window for window in bounded_windows}
    selected_tasks = []
    updated_tasks = []
    for task in tasks:
        task_id = str(task.get("id", ""))
        assigned = placements.get(task_id)
        if assigned:
            window_id = str(assigned["assignedWindowId"])
            window = window_by_id[window_id]
            item = {
                **assigned,
                "recommendedStartTime": assigned["scheduledStartTime"],
                "recommendation": "Schedule in a lower-carbon window",
                "recommendationReason": recommendation_by_id[task_id]["reason"],
            }
            energy_kwh = calculate_energy_kwh(item["powerDraw"], item["duration"])
            comparison = calculate_emissions_comparison(
                energy_kwh, baseline_intensity, window["avgCarbonIntensity"]
            )
            item.update(
                estimatedEnergyConsumption=energy_kwh,
                estimatedEnergyBasis=(
                    "estimated_power_watts_times_estimated_duration_minutes"
                ),
                estimatedEnergyUnit="kWh",
                baselineCarbonImpact=comparison["baselineEmissionsGrams"],
                recommendedCarbonImpact=comparison["recommendedEmissionsGrams"],
                carbonSavings=comparison["savingsGrams"],
                carbonImpactUnit="gCO2e",
                carbonImpactBasis=(
                    "estimated_from_assumed_power_and_estimated_duration"
                ),
                baselineCarbonIntensity=baseline_intensity,
                recommendedCarbonIntensity=window["avgCarbonIntensity"],
            )
            recommendation_by_id[task_id].update(
                status="scheduled",
                windowId=window_id,
                startTime=assigned["scheduledStartTime"],
                carbonSavings=item["carbonSavings"],
                carbonSavingsUnit="gCO2e",
            )
            selected_tasks.append(item)
            updated_tasks.append(item)
        else:
            updated_tasks.append({**task})
            pending = recommendation_by_id.get(task_id)
            if pending and pending["status"] == "pending":
                pending.update(
                    status="not_scheduled",
                    recommendation="Keep current schedule",
                    reason=(
                        "No non-overlapping slot remains within the window capacity "
                        "and this activity's deadline."
                    ),
                )

    total_duration = sum(float(task.get("duration", 0)) for task in selected_tasks)
    total_capacity = sum(float(window.get("duration", 0)) for window in bounded_windows)
    baseline_co2 = sum(
        calculate_emissions_grams(
            calculate_energy_kwh(task["powerDraw"], task["duration"]),
            baseline_intensity,
        )
        for task in selected_tasks
    )
    recommended_co2 = sum(
        calculate_emissions_grams(
            calculate_energy_kwh(task["powerDraw"], task["duration"]),
            window_by_id[str(task["assignedWindowId"])]["avgCarbonIntensity"],
        )
        for task in selected_tasks
    )
    savings = calculate_savings_from_emissions(baseline_co2, recommended_co2)
    forecast_values = [point["carbonIntensity"] for point in forecast]
    forecast_has_range = max(forecast_values) > min(forecast_values)
    relative_threshold = min(forecast_values) + (
        (max(forecast_values) - min(forecast_values)) * GREEN_WINDOW_THRESHOLD_RATIO
    )
    used_window_ids = {str(task["assignedWindowId"]) for task in selected_tasks}
    result = {
        "method": method,
        "windowId": next(iter(used_window_ids)) if len(used_window_ids) == 1 else (
            "multiple" if used_window_ids else None
        ),
        "selectedTasks": selected_tasks,
        "totalSavedCo2": round(savings, 4),
        "carbonUnit": "gCO2e",
        "carbonBasis": "estimated_from_assumed_power_and_estimated_duration",
        "totalDuration": round(total_duration, 2),
        "windowCapacity": round(total_capacity, 2),
        "utilizationPercent": (
            round(total_duration / total_capacity * 100, 1) if total_capacity else 0.0
        ),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    return {
        "result": result,
        "tasks": updated_tasks,
        "savings": {
            "totalSavedCo2": round(savings, 4),
            "baselineCo2": round(baseline_co2, 4),
            "recommendedCo2": round(recommended_co2, 4),
            "reductionPercent": calculate_reduction_percent(savings, baseline_co2),
            "unit": "gCO2e",
            "basis": "estimated_from_assumed_power_and_estimated_duration",
        },
        "recommendations": list(recommendation_by_id.values()),
        "windows": bounded_windows,
        "carbonData": {
            "zone": zone_id,
            "source": carbon.get("source"),
            "isSimulated": bool(carbon.get("isSimulated")),
            "observedAt": carbon.get("observedAt"),
            "forecastSource": forecast_source,
            "classification": (
                "lower-carbon relative to forecast range"
                if forecast_has_range
                else "no lower-carbon band in a constant forecast range"
            ),
            "relativeThreshold": round(relative_threshold, 2),
        },
    }


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
        flexibility_score=task.get("flexibilityScore", 70),
        priority_score=task.get("priorityScore", 50),
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
            if t.get("id") in selected_ids:
                updated_tasks.append({
                    **t,
                    "status": "delayed",
                    "assignedWindowId": window_id,
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
    if not isinstance(window, dict) or "avgCarbonIntensity" not in window:
        raise ValueError("Window carbon intensity is required.")
    window_intensity = window["avgCarbonIntensity"]
    calculate_emissions_grams(0.0, baseline_intensity)
    calculate_emissions_grams(0.0, window_intensity)
    baseline_co2 = sum(
        calculate_emissions_grams(
            calculate_energy_kwh(t["powerDraw"], t["duration"]),
            baseline_intensity,
        )
        for t in selected_tasks
    )
    recommended_co2 = sum(
        calculate_emissions_grams(
            calculate_energy_kwh(t["powerDraw"], t["duration"]),
            window_intensity,
        )
        for t in selected_tasks
    )
    saved = calculate_savings_from_emissions(baseline_co2, recommended_co2)

    return {
        "totalSavedCo2": round(saved, 4),
        "baselineCo2": round(baseline_co2, 4),
        "recommendedCo2": round(recommended_co2, 4),
        "reductionPercent": calculate_reduction_percent(saved, baseline_co2),
        "unit": "gCO2e",
        "basis": "estimated_from_assumed_power_and_estimated_duration",
    }
