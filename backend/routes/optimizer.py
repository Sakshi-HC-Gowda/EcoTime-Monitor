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

from extensions import db
from models.simulation_config import SimulationConfig
from services.optimizer_service import compute_eco_score, run_scheduler, compute_savings_summary
from services.activity_service import get_activity
from services.analytics_service import log_recommendation

logger = logging.getLogger(__name__)
optimizer_bp = Blueprint("optimizer", __name__)

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_simulation_config() -> SimulationConfig:
    """Fetch the deployment configuration, creating its initial row once."""
    config = db.session.get(SimulationConfig, 1)
    if config is None:
        config = SimulationConfig(
            id=1,
            zone=os.getenv("DEFAULT_ZONE", "US-CA"),
            low_carbon_threshold=float(os.getenv("LOW_CARBON_THRESHOLD", "180")),
            baseline_intensity=float(os.getenv("BASELINE_INTENSITY", "380")),
            simulation_speed=int(os.getenv("SIMULATION_SPEED", "15")),
            is_simulating=os.getenv("SIMULATION_MODE", "true").lower() == "true",
        )
        db.session.add(config)
        db.session.commit()
    return config


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
    baseline = float(data.get("baselineIntensity", _get_simulation_config().baseline_intensity))

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

    baseline = request.args.get("baselineIntensity", _get_simulation_config().baseline_intensity, type=float)
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

    config = _get_simulation_config()
    if "zone" in data:
        config.zone = str(data["zone"]).strip()
    if "lowCarbonThreshold" in data:
        config.low_carbon_threshold = float(data["lowCarbonThreshold"])
    if "baselineIntensity" in data:
        config.baseline_intensity = float(data["baselineIntensity"])
    if "simulationSpeed" in data:
        config.simulation_speed = int(data["simulationSpeed"])
    if "isSimulating" in data:
        config.is_simulating = bool(data["isSimulating"])

    db.session.commit()
    config_data = config.to_dict()

    logger.info("Simulation config updated: %s", config_data)

    return jsonify({
        "success": True,
        "data": config_data,
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
        "data": _get_simulation_config().to_dict(),
        "timestamp": _now_iso(),
    }), 200
