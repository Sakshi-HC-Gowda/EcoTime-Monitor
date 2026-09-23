"""
Leaderboard API Routes
======================
Organization-level sustainability leaderboard.
"""

from __future__ import annotations

from flask import Blueprint, jsonify

from services.leaderboard_service import get_organization_leaderboard


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