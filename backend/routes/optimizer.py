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
import math
import os
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from auth_utils import require_auth, require_organization_admin

from extensions import db
from optimization.carbon_calculator import calculate_emissions_grams
from models.activity import Activity
from models.simulation_config import SimulationConfig
from models.analytics_recommendation import AnalyticsRecommendation
from services.optimizer_service import (
    RecommendationDataUnavailable,
    compute_eco_score,
    recommend_schedule,
)
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
@optimizer_bp.route("/recommendations", methods=["POST"])
@require_auth
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
    missing = [f for f in ["tasks"] if f not in data]
    if missing:
        return jsonify({
            "success": False,
            "error": f"Missing required fields: {', '.join(missing)}",
            "timestamp": _now_iso(),
        }), 400

    requested_tasks = data.get("tasks", [])
    requested_window = data.get("window")
    method_value = data.get("method", "greedy")
    if not isinstance(method_value, str):
        return jsonify({
            "success": False,
            "error": "Field 'method' must be 'greedy' or 'knapsack'",
            "timestamp": _now_iso(),
        }), 400
    method = method_value.lower()
    config = _get_simulation_config()
    try:
        raw_baseline = data.get("baselineIntensity", config.baseline_intensity)
        if isinstance(raw_baseline, bool):
            raise ValueError("Field 'baselineIntensity' must be numeric")
        baseline = float(raw_baseline)
    except (TypeError, ValueError):
        return jsonify({
            "success": False,
            "error": "Field 'baselineIntensity' must be numeric",
            "timestamp": _now_iso(),
        }), 400
    if not math.isfinite(baseline) or baseline < 0:
        return jsonify({
            "success": False,
            "error": "Field 'baselineIntensity' must be a non-negative finite number",
            "timestamp": _now_iso(),
        }), 400
    zone_value = data.get("zone", config.zone)
    if not isinstance(zone_value, str) or not zone_value.strip():
        return jsonify({
            "success": False,
            "error": "Field 'zone' must be a non-empty string",
            "timestamp": _now_iso(),
        }), 400
    zone = zone_value.strip()

    if method not in ("greedy", "knapsack"):
        return jsonify({
            "success": False,
            "error": f"Invalid method '{method}'. Use 'greedy' or 'knapsack'.",
            "timestamp": _now_iso(),
        }), 400

    if not isinstance(requested_tasks, list) or len(requested_tasks) == 0:
        return jsonify({
            "success": False,
            "error": "Field 'tasks' must be a non-empty array",
            "timestamp": _now_iso(),
        }), 400

    if requested_window is not None and not isinstance(requested_window, dict):
        return jsonify({
            "success": False,
            "error": "Field 'window' must define the permitted scheduling interval",
            "timestamp": _now_iso(),
        }), 400

    if any(not isinstance(task, dict) or not task.get("id") for task in requested_tasks):
        return jsonify({
            "success": False,
            "error": "Every task must include an activity id",
            "timestamp": _now_iso(),
        }), 400
    task_ids = [str(task["id"]) for task in requested_tasks]
    if len(set(task_ids)) != len(task_ids):
        return jsonify({
            "success": False,
            "error": "Activity ids must be unique",
            "timestamp": _now_iso(),
        }), 400

    owned_tasks = Activity.query.filter(
        Activity.organization_id == request.user.organization_id,
        Activity.id.in_(task_ids),
    ).all()
    if len(owned_tasks) != len(task_ids):
        any_tasks = Activity.query.filter(Activity.id.in_(task_ids)).all()
        if any(task.organization_id != request.user.organization_id for task in any_tasks):
            return jsonify({
                "success": False,
                "error": "Scheduler tasks must belong to your organization",
                "timestamp": _now_iso(),
            }), 403
        return jsonify({
            "success": False,
            "error": "One or more activities could not be found",
            "timestamp": _now_iso(),
        }), 404

    stored_by_id = {task.id: task.to_dict() for task in owned_tasks}
    tasks = [stored_by_id[str(request_task["id"])] for request_task in requested_tasks]

    logger.info(
        "POST /api/recommendations method=%s tasks=%d zone=%s",
        method, len(tasks), zone
    )

    try:
        sched_result = recommend_schedule(
            tasks=tasks,
            permitted_window=requested_window,
            method=method,
            baseline_intensity=baseline,
            zone_id=zone,
        )
    except RecommendationDataUnavailable as exc:
        logger.warning("Scheduling recommendation data unavailable: %s", exc)
        return jsonify({
            "success": False,
            "error": str(exc),
            "timestamp": _now_iso(),
        }), 503
    except ValueError as exc:
        return jsonify({
            "success": False,
            "error": str(exc),
            "timestamp": _now_iso(),
        }), 400

    try:
        task_by_id = {task["id"]: task for task in tasks}
        for recommendation in sched_result["recommendations"]:
            activity_id = recommendation["activityId"]
            task = task_by_id.get(activity_id, {})
            log_recommendation(
                activity_id=activity_id,
                text=recommendation["recommendation"],
                reason=recommendation["reason"],
                expected_carbon_saving=recommendation.get("carbonSavings"),
                expected_energy_saving=None,
                status=recommendation["status"],
                organization_id=request.user.organization_id,
            )
    except Exception:
        db.session.rollback()
        logger.exception("Failed to persist scheduling recommendations")
        return jsonify({
            "success": False,
            "error": "Scheduling completed, but recommendation records could not be saved.",
            "timestamp": _now_iso(),
        }), 503

    return jsonify({
        "success": True,
        "data": sched_result,
        "timestamp": _now_iso(),
    }), 200
# ---------------------------------------------------------------------------
# EcoScore
# ---------------------------------------------------------------------------

@optimizer_bp.route("/eco-score", methods=["GET"])
@require_auth
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

    raw_current_intensity = request.args.get("currentIntensity")
    if raw_current_intensity is None:
        return jsonify({
            "success": False,
            "error": "Missing required parameter: currentIntensity",
            "timestamp": _now_iso(),
        }), 400
    try:
        current_intensity = float(raw_current_intensity)
        baseline = float(
            request.args.get("baselineIntensity")
            if request.args.get("baselineIntensity") is not None
            else _get_simulation_config().baseline_intensity
        )
        peak = float(request.args.get("peakIntensity", "800"))
        from optimization.eco_score import calculate_carbon_score
        calculate_carbon_score(current_intensity, baseline, peak)
    except (TypeError, ValueError) as exc:
        return jsonify({
            "success": False,
            "error": str(exc) or "Intensity values must be numeric.",
            "timestamp": _now_iso(),
        }), 400

    persisted_task = get_activity(task_id, request.user.organization_id)
    if persisted_task is None:
        existing = Activity.query.filter_by(id=task_id).first()
        if existing is None:
            return jsonify({
                "success": False,
                "error": "Activity not found",
                "timestamp": _now_iso(),
            }), 404
        return jsonify({
            "success": False,
            "error": "Activity does not belong to your organization",
            "timestamp": _now_iso(),
        }), 403
    task = persisted_task

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
    # Scheduling changes timing rather than workload energy, so energy savings
    # are not claimed. Carbon savings are an estimate against the two intensities.
    try:
        expected_carbon = None
        from optimization.carbon_calculator import calculate_savings_grams
        expected_carbon = calculate_savings_grams(
            task["duration"], task["powerDraw"], baseline, current_intensity
        )
        log_recommendation(
            activity_id=task_id if persisted_task else None,
            text=score["recommendation"],
            reason=score["reason"],
            expected_carbon_saving=expected_carbon,
            expected_energy_saving=None,
            status="pending",
            organization_id=request.user.organization_id,
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
@require_organization_admin
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

    try:
        config = _get_simulation_config()
        if "zone" in data:
            if not isinstance(data["zone"], str) or not data["zone"].strip():
                raise ValueError("Field 'zone' must be a non-empty string")
            config.zone = data["zone"].strip()
        if "lowCarbonThreshold" in data:
            if isinstance(data["lowCarbonThreshold"], bool):
                raise ValueError(
                    "Field 'lowCarbonThreshold' must be a non-negative finite number"
                )
            calculate_emissions_grams(0.0, data["lowCarbonThreshold"])
            config.low_carbon_threshold = float(data["lowCarbonThreshold"])
        if "baselineIntensity" in data:
            if isinstance(data["baselineIntensity"], bool):
                raise ValueError(
                    "Field 'baselineIntensity' must be a non-negative finite number"
                )
            calculate_emissions_grams(0.0, data["baselineIntensity"])
            config.baseline_intensity = float(data["baselineIntensity"])
        if "simulationSpeed" in data:
            raw_speed = data["simulationSpeed"]
            if isinstance(raw_speed, bool) or not isinstance(raw_speed, int) or raw_speed <= 0:
                raise ValueError("Field 'simulationSpeed' must be a positive integer")
            config.simulation_speed = raw_speed
        if "isSimulating" in data:
            if not isinstance(data["isSimulating"], bool):
                raise ValueError("Field 'isSimulating' must be a boolean")
            config.is_simulating = data["isSimulating"]
    except (TypeError, ValueError) as exc:
        db.session.rollback()
        return jsonify({
            "success": False,
            "error": str(exc),
            "timestamp": _now_iso(),
        }), 400

    db.session.commit()
    config_data = config.to_dict()

    logger.info("Simulation config updated: %s", config_data)

    return jsonify({
        "success": True,
        "data": config_data,
        "timestamp": _now_iso(),
    }), 200


@optimizer_bp.route("/config/simulation", methods=["GET"])
@require_auth
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


# ---------------------------------------------------------------------------
# Analytics Recommendations
# ---------------------------------------------------------------------------

@optimizer_bp.route("/analytics/recommendations", methods=["GET"])
@require_auth
def get_recommendations():
    """
    Retrieve stored analytics recommendations.

    Query parameters:
        limit (int, optional): Max records to retrieve (default: 50, max: 200)

    Returns 200: { success: true, data: list[dict], count: int, timestamp: str }
    """
    limit = min(request.args.get("limit", 50, type=int), 200)
    recs = (
        AnalyticsRecommendation.query.filter_by(
            organization_id=request.user.organization_id
        )
        .order_by(AnalyticsRecommendation.created_at.desc())
        .limit(limit)
        .all()
    )
    data = [recommendation.to_dict() for recommendation in recs]

    return jsonify({
        "success": True,
        "data": data,
        "count": len(data),
        "timestamp": _now_iso(),
    }), 200
