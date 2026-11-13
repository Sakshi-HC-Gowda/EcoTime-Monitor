"""
Badge API Routes
================
Returns badges earned by the current user.
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from auth_utils import require_auth
from models import Badge


badges_bp = Blueprint(
    "badges",
    __name__,
)


@badges_bp.get("/badges/<user_id>")
@require_auth
def get_user_badges(user_id: str):
    if str(user_id) != str(request.user.id):
        return jsonify({"error": "You can only access your own badges"}), 403
    badges = (
        Badge.query
        .filter_by(user_id=user_id)
        .order_by(Badge.earned_at.desc())
        .all()
    )

    return jsonify({
        "userId": user_id,
        "badges": [badge.to_dict() for badge in badges],
        "totalBadges": len(badges),
    }), 200