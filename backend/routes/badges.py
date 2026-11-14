"""
Badge API Routes
================
Returns badges earned by the user.
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from auth_utils import require_auth
from extensions import db
from models.badge import Badge
from models.user import User


badges_bp = Blueprint(
    "badges",
    __name__,
)


@badges_bp.get("/badges/<user_id>")
@require_auth
def get_user_badges(user_id: str):
    """
    Get badges for a user.
    Ordinary users can only access their own badges.
    Organization admins can access users within their organization.
    """
    current_user = request.user
    target_user_id = str(user_id)

    if target_user_id == "me":
        effective_user_id = str(current_user.id)

    elif target_user_id == str(current_user.id):
        effective_user_id = target_user_id

    else:
        is_org_admin = (
            current_user.role
            and current_user.role.name == "Organization Admin"
        )

        if not is_org_admin:
            return jsonify({
                "success": False,
                "error": "You do not have permission to access another user's badges",
            }), 403

        if not target_user_id.isdigit():
            return jsonify({
                "success": False,
                "error": "Invalid user ID",
            }), 400

        target_user = db.session.get(User, int(target_user_id))

        if target_user is None:
            return jsonify({
                "success": False,
                "error": "User not found",
            }), 404

        if target_user.organization_id != current_user.organization_id:
            return jsonify({
                "success": False,
                "error": "You do not have permission to access data from another organization",
            }), 403

        effective_user_id = target_user_id
    badges = (
        Badge.query
        .filter_by(user_id=effective_user_id)
        .order_by(Badge.earned_at.desc())
        .all()
    )

    return jsonify({
        "userId": effective_user_id,
        "badges": [badge.to_dict() for badge in badges],
        "totalBadges": len(badges),
    }), 200
