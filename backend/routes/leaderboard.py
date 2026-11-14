"""
Leaderboard API Routes
======================
Organization-level sustainability leaderboard.
"""

from __future__ import annotations

from uuid import uuid4
from flask import Blueprint, jsonify, request

from auth_utils import require_organization_access
from extensions import db
from models.sustainability_score import SustainabilityScore
from services.leaderboard_service import get_organization_leaderboard


leaderboard_bp = Blueprint(
    "leaderboard",
    __name__,
)


@leaderboard_bp.get("/organizations/<organization_id>/leaderboard")
@require_organization_access
def get_leaderboard(organization_id: str):
    """
    Get organization leaderboard.
    Requires caller to be an authenticated member of the organization.
    """
    leaderboard = get_organization_leaderboard(str(organization_id))

    return jsonify({
        "organizationId": str(organization_id),
        "leaderboard": leaderboard,
        "totalUsers": len(leaderboard),
    }), 200


@leaderboard_bp.post("/organizations/<organization_id>/leaderboard/opt-in")
@require_organization_access
def set_leaderboard_opt_in(organization_id: str):
    """
    Set leaderboard opt-in preference for the authenticated user.
    Users cannot modify another user's preference.
    """
    data = request.get_json(silent=True) or {}

    client_user_id = data.get("userId")
    enabled = data.get("enabled")

    # Always derive user identity from the verified authenticated session
    authenticated_user = request.user
    user_id = str(authenticated_user.id)

    # Disallow modifying another user's preference
    if client_user_id is not None and str(client_user_id) != user_id:
        return jsonify({
            "success": False,
            "error": "You cannot change another user's leaderboard preference",
        }), 403

    if not isinstance(enabled, bool):
        return jsonify({
            "error": "enabled must be true or false"
        }), 400

    score = SustainabilityScore.query.filter_by(
        user_id=user_id,
        organization_id=str(organization_id),
    ).first()

    if score is None:
        score = SustainabilityScore(
            id=str(uuid4()),
            user_id=user_id,
            organization_id=str(organization_id),
            score=0.0,
            total_points=0,
            current_streak=0,
            longest_streak=0,
            leaderboard_opt_in=enabled,
        )
        db.session.add(score)
    else:
        score.leaderboard_opt_in = enabled

    db.session.commit()

    return jsonify({
        "userId": user_id,
        "organizationId": str(organization_id),
        "leaderboardOptIn": score.leaderboard_opt_in,
        "message": (
            "Leaderboard participation enabled"
            if enabled
            else "Leaderboard participation disabled"
        ),
    }), 200
