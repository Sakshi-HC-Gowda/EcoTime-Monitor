"""
Leaderboard API Routes
======================
Organization-level sustainability leaderboard.
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from models import SustainabilityScore
from services.leaderboard_service import get_organization_leaderboard
from extensions import db


leaderboard_bp = Blueprint(
    "leaderboard",
    __name__,
)


@leaderboard_bp.get("/organizations/<organization_id>/leaderboard")
def get_leaderboard(organization_id: str):
    leaderboard = get_organization_leaderboard(organization_id)

    return jsonify({
        "organizationId": organization_id,
        "leaderboard": leaderboard,
        "totalUsers": len(leaderboard),
    }), 200
@leaderboard_bp.post("/organizations/<organization_id>/leaderboard/opt-in")
def set_leaderboard_opt_in(organization_id: str):
    data = request.get_json(silent=True) or {}

    user_id = data.get("userId")
    enabled = data.get("enabled")

    if not user_id:
        return jsonify({
            "error": "userId is required"
        }), 400

    if not isinstance(enabled, bool):
        return jsonify({
            "error": "enabled must be true or false"
        }), 400

    score = SustainabilityScore.query.filter_by(
        user_id=user_id,
        organization_id=organization_id,
    ).first()

    if score is None:
        return jsonify({
            "error": "Sustainability score not found"
        }), 404

    score.leaderboard_opt_in = enabled
    db.session.commit()

    return jsonify({
        "userId": user_id,
        "organizationId": organization_id,
        "leaderboardOptIn": score.leaderboard_opt_in,
        "message": (
            "Leaderboard participation enabled"
            if enabled
            else "Leaderboard participation disabled"
        ),
    }), 200