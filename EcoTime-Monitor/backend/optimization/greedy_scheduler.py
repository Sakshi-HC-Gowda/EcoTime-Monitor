"""
Greedy Scheduler & 0/1 Knapsack Optimizer
==========================================
Provides two scheduling algorithms:

1. Greedy Scheduler
   - Sorts tasks by carbon-saving potential (duration × power)
   - Sorts windows by WindowScore (best window first)
   - Assigns tasks greedily: each task goes to the highest-ranked
     window that still has capacity remaining.

2. 0/1 Knapsack Optimizer
   - Given a single green window and a list of flexible tasks
   - Treats window duration as knapsack capacity
   - Value = CO2 savings in grams if task runs in this window
   - Uses dynamic programming to maximise total savings
"""

from __future__ import annotations

from datetime import datetime

from .carbon_calculator import calculate_savings_grams
from .window_ranking import rank_windows


# ---------------------------------------------------------------------------
# Greedy Scheduler
# ---------------------------------------------------------------------------

def schedule_greedy(
    tasks: list[dict],
    windows: list[dict],
    baseline_intensity: float = 380.0,
) -> dict:
    """
    Greedy allocation of flexible tasks into ranked green windows.

    Args:
        tasks: List of task dicts. Flexible tasks with status != 'completed'
               are eligible for scheduling.
        windows: List of green window dicts.
        baseline_intensity: Reference baseline intensity for savings calculation.

    Returns:
        dict with:
            scheduled_tasks: All tasks with 'assignedWindowId' and 'status' updated
            window_allocations: {window_id: [task_id, ...]}
            total_saved_co2: Total CO2 savings in grams across all allocations
            summary: Human-readable summary string
    """
    # Filter eligible flexible tasks
    flexible = [
        {**t}
        for t in tasks
        if t.get("type") == "flexible" and t.get("status") != "completed"
    ]

    # Sort by carbon-saving potential: larger power × duration = higher priority
    flexible.sort(
        key=lambda t: t.get("duration", 0) * t.get("powerDraw", 0),
        reverse=True,
    )

    # Rank windows
    ranked_windows = rank_windows(windows)

    # Initialise capacity and allocation trackers
    allocations: dict[str, list[str]] = {w["id"]: [] for w in windows}
    remaining_capacity: dict[str, float] = {w["id"]: w.get("duration", 0) for w in windows}
    total_saved_co2 = 0.0

    # Greedy assignment
    for task in flexible:
        task_duration = task.get("duration", 0)
        for w in ranked_windows:
            wid = w["id"]
            if remaining_capacity.get(wid, 0) >= task_duration:
                remaining_capacity[wid] -= task_duration
                allocations[wid].append(task["id"])
                task["assignedWindowId"] = wid
                task["status"] = "delayed"  # Scheduled/queued state

                # Calculate savings
                savings = calculate_savings_grams(
                    task.get("duration", 0),
                    task.get("powerDraw", 0),
                    baseline_intensity,
                    w.get("avgCarbonIntensity", baseline_intensity),
                )
                total_saved_co2 += savings
                break  # Task assigned — move to next task

    # Merge scheduled flexible tasks back into the full task list
    scheduled_map = {t["id"]: t for t in flexible}
    result_tasks = [
        scheduled_map.get(t["id"], t) for t in tasks
    ]

    allocated_count = sum(len(v) for v in allocations.values())
    summary = (
        f"Greedy scheduler allocated {allocated_count}/{len(flexible)} flexible tasks "
        f"across {len(windows)} green windows. "
        f"Estimated CO2 savings: {total_saved_co2:.1f}g."
    )

    return {
        "scheduled_tasks": result_tasks,
        "window_allocations": allocations,
        "total_saved_co2": round(total_saved_co2, 4),
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# 0/1 Knapsack Optimizer
# ---------------------------------------------------------------------------

def optimize_knapsack(
    tasks: list[dict],
    window: dict,
    baseline_intensity: float = 380.0,
) -> dict:
    """
    0/1 Knapsack optimisation for a single green window.

    Maximises total CO2 savings subject to the constraint that the sum
    of selected task durations ≤ window duration.

    Args:
        tasks: All tasks — non-flexible and completed tasks are filtered out.
        window: Single green window dict with 'duration' and 'avgCarbonIntensity'.
        baseline_intensity: Reference baseline intensity for savings calculation.

    Returns:
        dict with:
            selected_tasks: List of task dicts chosen by the algorithm
            total_saved_co2: Total savings in grams
            total_duration: Total duration of selected tasks (minutes)
            window_capacity: Window duration in minutes
            utilisation_percent: What fraction of the window is used
            method: 'knapsack'
            created_at: ISO timestamp
    """
    window_duration = int(window.get("duration", 0))
    window_intensity = window.get("avgCarbonIntensity", baseline_intensity)

    # Eligible candidates
    candidates = [
        t for t in tasks
        if t.get("type") == "flexible"
        and t.get("status") != "completed"
        and int(t.get("duration", 0)) <= window_duration
    ]

    n = len(candidates)
    W = window_duration

    if n == 0 or W <= 0:
        return {
            "selected_tasks": [],
            "total_saved_co2": 0.0,
            "total_duration": 0,
            "window_capacity": W,
            "utilisation_percent": 0.0,
            "method": "knapsack",
            "created_at": datetime.utcnow().isoformat(),
        }

    # Pre-compute integer values (scaled ×100 for precision) and weights
    weights = [max(1, int(round(t.get("duration", 1)))) for t in candidates]
    values = [
        int(
            round(
                calculate_savings_grams(
                    t.get("duration", 0),
                    t.get("powerDraw", 0),
                    baseline_intensity,
                    window_intensity,
                )
                * 100  # scale for integer DP
            )
        )
        for t in candidates
    ]

    # Standard 0/1 DP table: dp[i][w] = max scaled savings using first i items, capacity w
    dp = [[0] * (W + 1) for _ in range(n + 1)]

    for i in range(1, n + 1):
        wi = weights[i - 1]
        vi = values[i - 1]
        for w in range(W + 1):
            if wi <= w:
                dp[i][w] = max(dp[i - 1][w], dp[i - 1][w - wi] + vi)
            else:
                dp[i][w] = dp[i - 1][w]

    # Backtrack to find selected items
    selected: list[dict] = []
    w = W
    for i in range(n, 0, -1):
        if dp[i][w] != dp[i - 1][w]:
            selected.append(candidates[i - 1])
            w -= weights[i - 1]

    selected.reverse()
    total_saved_co2 = dp[n][W] / 100.0  # unscale
    total_duration = sum(t.get("duration", 0) for t in selected)
    utilisation_percent = (
        round((total_duration / window_duration) * 100.0, 1)
        if window_duration > 0
        else 0.0
    )

    return {
        "selected_tasks": selected,
        "total_saved_co2": round(total_saved_co2, 4),
        "total_duration": total_duration,
        "window_capacity": window_duration,
        "utilisation_percent": utilisation_percent,
        "method": "knapsack",
        "created_at": datetime.utcnow().isoformat(),
    }
