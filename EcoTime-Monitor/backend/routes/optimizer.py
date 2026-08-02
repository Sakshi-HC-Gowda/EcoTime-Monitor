"""
Optimization & Scheduling Routes
==================================
POST /api/scheduler          — Run greedy or knapsack scheduling algorithm
GET  /api/eco-score          — Calculate EcoScore for a task
POST /api/config/simulation  — Store simulation configuration
GET  /api/config/simulation  — Retrieve current simulation configuration
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify

from services.optimizer_service import compute_eco_score, run_scheduler, compute_savings_summary
from services.activity_service import get_activity, update_activity
from services.analytics_service import log_recommendation

logger = logging.getLogger(__name__)
optimizer_bp = Blueprint("optimizer", __name__)

# In-memory simulation config (session-level; survives restart via .env defaults)
_simulation_config: dict = {
    "zone": os.getenv("DEFAULT_ZONE", "US-CA"),
    "lowCarbonThreshold": float(os.getenv("LOW_CARBON_THRESHOLD", "180")),
    "baselineIntensity": float(os.getenv("BASELINE_INTENSITY", "380")),
    "simulationSpeed": int(os.getenv("SIMULATION_SPEED", "15")),
    "isSimulating": os.getenv("SIMULATION_MODE", "true").lower() == "true",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------

@optimizer_bp.route("/scheduler", methods=["POST"])
def schedule():
    """
    Run optimization algorithm to assign tasks to a green window.

    Request Body (JSON):
        tasks (Task[], required): List of tasks to schedule
        window (GreenWindow, required): Target green window
        method (str): 'greedy' | 'knapsack' (default: 'greedy')
        baselineIntensity (float): Reference baseline intensity (default: 380)

    Returns 200:
        {
            success: true,
            data: {
                result: OptimizationResult,
                tasks: Task[],
                savings: { totalSavedCo2, baselineCo2, reductionPercent }
            }
        }
    """
    data = request.get_json(silent=True)

    if not data:
        return jsonify({
            "success": False,
            "error": "Request body must be valid JSON",
            "timestamp": _now_iso(),
        }), 400

    # Validate required fields
    missing = [f for f in ["tasks", "window"] if f not in data]
    if missing:
        return jsonify({
            "success": False,
            "error": f"Missing required fields: {', '.join(missing)}",
            "timestamp": _now_iso(),
        }), 400

    tasks = data.get("tasks", [])
    window = data.get("window", {})
    method = data.get("method", "greedy").lower()
    baseline = float(data.get("baselineIntensity", _simulation_config["baselineIntensity"]))

    if method not in ("greedy", "knapsack"):
        return jsonify({
            "success": False,
            "error": f"Invalid method '{method}'. Use 'greedy' or 'knapsack'.",
            "timestamp": _now_iso(),
        }), 400

    if not isinstance(tasks, list) or len(tasks) == 0:
        return jsonify({
            "success": False,
            "error": "Field 'tasks' must be a non-empty array",
            "timestamp": _now_iso(),
        }), 400

    logger.info(
        "POST /api/scheduler method=%s tasks=%d window=%s",
        method, len(tasks), window.get("id", "?")
    )

    sched_result = run_scheduler(
        tasks=tasks,
        window=window,
        method=method,
        baseline_intensity=baseline,
    )

    # Add savings summary
    savings = compute_savings_summary(
        selected_tasks=sched_result["result"].get("selectedTasks", []),
        window=window,
        baseline_intensity=baseline,
    )

    # Persist this scheduling decision as an accepted recommendation so
    # Analytics can report on it (best-effort — never blocks the response).
    try:
        selected = sched_result["result"].get("selectedTasks", [])
        total_energy_kwh = sum(
            (t.get("duration", 0) / 60.0) * (t.get("powerDraw", 0) / 1000.0)
            for t in selected
        )
        log_recommendation(
            text=f"Scheduled {len(selected)} task(s) into window '{window.get('id', '?')}' via {method}.",
            reason=f"Estimated {savings['reductionPercent']}% carbon reduction vs. baseline intensity.",
            expected_carbon_saving=savings["totalSavedCo2"],
            expected_energy_saving=round(total_energy_kwh, 4),
            status="accepted",
        )
    except Exception:
        logger.exception("Failed to log scheduling recommendation")

    # Actually WRITE the scheduling decision onto each real, persisted
    # activity — status="scheduled" + assignedWindowId. Without this, the
    # scheduler only produced a log entry and the activity's real status
    # never changed, so it never showed up under any status-grouped view.
    # Best-effort per task: tasks passed in that aren't real DB rows
    # (e.g. ad-hoc/synthetic scheduler input) are silently skipped rather
    # than failing the whole request.
    window_id = window.get("id")
    scheduled_count = 0
    for t in sched_result["result"].get("selectedTasks", []):
        task_id = t.get("id")
        if not task_id or not get_activity(task_id):
            continue
        _, update_error = update_activity(task_id, {
            "status": "scheduled",
            "assignedWindowId": window_id,
        })
        if update_error:
            logger.warning("Failed to mark task %s as scheduled: %s", task_id, update_error)
        else:
            scheduled_count += 1
    logger.info("Scheduler persisted status=scheduled for %d/%d task(s)", scheduled_count, len(selected))

    return jsonify({
        "success": True,
        "data": {
            "result": sched_result["result"],
            "tasks": sched_result["tasks"],
            "savings": savings,
        },
        "timestamp": _now_iso(),
    }), 200


# ---------------------------------------------------------------------------
# EcoScore
# ---------------------------------------------------------------------------

@optimizer_bp.route("/eco-score", methods=["GET"])
def eco_score():
    """
    Calculate EcoScore for a task given current grid conditions.

    Query Parameters:
        taskId (str, required): Task identifier
        currentIntensity (float, required): Current grid intensity
        baselineIntensity (float): Reference baseline (default: 380)
        peakIntensity (float): Peak intensity reference (default: 800)

    Returns 200:
        { success: true, data: EcoScore }
    """
    task_id = request.args.get("taskId")
    if not task_id:
        return jsonify({
            "success": False,
            "error": "Missing required parameter: taskId",
            "timestamp": _now_iso(),
        }), 400

    current_intensity = request.args.get("currentIntensity", type=float)
    if current_intensity is None:
        return jsonify({
            "success": False,
            "error": "Missing required parameter: currentIntensity",
            "timestamp": _now_iso(),
        }), 400

    baseline = request.args.get(
        "baselineIntensity",
        _simulation_config["baselineIntensity"],
        type=float,
    )
    peak = request.args.get("peakIntensity", 800.0, type=float)

    # Try to fetch task from store; if not found, use a generic flexible task
    persisted_task = get_activity(task_id)
    task = persisted_task or {
        "id": task_id,
        "type": "flexible",
        "status": "idle",
        "flexibilityScore": 70,
        "priorityScore": 50,
    }

    score = compute_eco_score(
        task=task,
        current_intensity=current_intensity,
        baseline_intensity=baseline,
        peak_intensity=peak,
    )

    logger.info(
        "GET /api/eco-score taskId=%s intensity=%.0f → score=%.1f rec=%s",
        task_id, current_intensity, score["ecoScore"], score["recommendation"]
    )

    # Log this as a pending recommendation (an advisory, not yet acted on).
    # Only estimate savings when the task has real duration/powerDraw data.
    try:
        expected_energy = None
        expected_carbon = None
        if "duration" in task and "powerDraw" in task:
            from optimization.carbon_calculator import calculate_savings_grams
            expected_energy = round((task["duration"] / 60.0) * (task["powerDraw"] / 1000.0), 4)
            expected_carbon = calculate_savings_grams(
                task["duration"], task["powerDraw"], baseline, current_intensity
            )
        log_recommendation(
            activity_id=task_id if persisted_task else None,
            text=score["recommendation"],
            reason=score["reason"],
            expected_carbon_saving=expected_carbon,
            expected_energy_saving=expected_energy,
            status="pending",
        )
    except Exception:
        logger.exception("Failed to log eco-score recommendation")

    # Also persist the carbon reading used for this scoring decision,
    # linked to the activity so "carbon intensity per activity" is queryable.
    try:
        from services.analytics_service import log_carbon_snapshot
        log_carbon_snapshot(
            region=_simulation_config["zone"],
            carbon_intensity=current_intensity,
            source="eco-score",
            activity_id=task_id if persisted_task else None,
        )
    except Exception:
        logger.exception("Failed to log activity-linked carbon snapshot")

    return jsonify({
        "success": True,
        "data": score,
        "timestamp": _now_iso(),
    }), 200


# ---------------------------------------------------------------------------
# Simulation Configuration
# ---------------------------------------------------------------------------

@optimizer_bp.route("/config/simulation", methods=["POST"])
def set_config():
    """
    Update simulation configuration parameters.

    Request Body (JSON, all optional):
        zone (str)
        lowCarbonThreshold (float)
        baselineIntensity (float)
        simulationSpeed (int)
        isSimulating (bool)

    Returns 200: { success: true, data: SimulationConfig }
    """
    data = request.get_json(silent=True) or {}

    if "zone" in data:
        _simulation_config["zone"] = str(data["zone"]).strip()
    if "lowCarbonThreshold" in data:
        _simulation_config["lowCarbonThreshold"] = float(data["lowCarbonThreshold"])
    if "baselineIntensity" in data:
        _simulation_config["baselineIntensity"] = float(data["baselineIntensity"])
    if "simulationSpeed" in data:
        _simulation_config["simulationSpeed"] = int(data["simulationSpeed"])
    if "isSimulating" in data:
        _simulation_config["isSimulating"] = bool(data["isSimulating"])

    logger.info("Simulation config updated: %s", _simulation_config)

    return jsonify({
        "success": True,
        "data": _simulation_config,
        "timestamp": _now_iso(),
    }), 200


@optimizer_bp.route("/config/simulation", methods=["GET"])
def get_config():
    """
    Retrieve current simulation configuration.

    Returns 200: { success: true, data: SimulationConfig }
    """
    return jsonify({
        "success": True,
        "data": _simulation_config,
        "timestamp": _now_iso(),
    }), 200
