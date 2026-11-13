"""
EcoPoints API Routes
====================
API endpoints for EcoPoints transactions
and sustainability scores.
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from auth_utils import require_auth
from models.activity import Activity

from config.scoring_rules import SCORING_RULES, get_points
from services.ecopoints_service import (
    award_points,
    get_user_score,
    get_user_transactions,
)


ecopoints_bp = Blueprint(
    "ecopoints",
    __name__,
   
)


def _forbid_other_user(user_id) -> tuple | None:
    """Users may only read or write their own EcoPoints data."""
    if str(user_id) != str(request.user.id):
        return jsonify({"error": "You can only access your own EcoPoints data"}), 403
    return None


@ecopoints_bp.post("/ecopoints/award")
@require_auth
def award_ecopoints():
    """
    Award EcoPoints for a legitimate EcoTime activity event.
    """

    data = request.get_json(silent=True) or {}

    user_id = data.get("userId")
    event_type = data.get("eventType")
    event_id = data.get("eventId")
    activity_id = data.get("activityId")

    if not user_id:
        user_id = str(request.user.id)
    denied = _forbid_other_user(user_id)
    if denied:
        return denied

    if not event_type:
        return jsonify({
            "error": "eventType is required"
        }), 400

    if not event_id:
        return jsonify({
            "error": "eventId is required"
        }), 400

    if not activity_id:
        return jsonify({
            "error": "activityId is required"
        }), 400

    owned = Activity.query.filter_by(
        id=activity_id, organization_id=request.user.organization_id
    ).first()
    if owned is None:
        return jsonify({"error": "Activity not found"}), 404

    # Only allow predefined scoring rules.
    if event_type not in SCORING_RULES:
        return jsonify({
            "error": f"Unsupported event type: {event_type}"
        }), 400

    points = get_points(event_type)

    try:
        transaction = award_points(
            user_id=user_id,
            event_type=event_type,
            event_id=event_id,
            points=points,
            activity_id=activity_id,
            recommendation_id=data.get("recommendationId"),
            organization_id=str(request.user.organization_id) if request.user.organization_id else None,
            description=data.get("description"),
        )

        # Same event was already rewarded.
        if transaction is None:
            return jsonify({
                "error": "EcoPoints have already been awarded for this event."
            }), 409

        return jsonify({
            "message": "EcoPoints awarded successfully",
            "transaction": transaction.to_dict(),
        }), 201

    except ValueError as error:
        return jsonify({
            "error": str(error)
        }), 400

    except Exception:
        return jsonify({
            "error": "Failed to award EcoPoints"
        }), 500


@ecopoints_bp.get("/ecopoints/<user_id>")
@require_auth
def get_ecopoints(user_id: str):
    """
    Get EcoPoint transaction history for a user.
    """
    denied = _forbid_other_user(user_id)
    if denied:
        return denied

    transactions = get_user_transactions(user_id)

    return jsonify({
        "userId": user_id,
        "transactions": transactions,
        "totalTransactions": len(transactions),
    }), 200


@ecopoints_bp.get("/ecopoints/<user_id>/score")
@require_auth
def get_sustainability_score(user_id: str):
    """
    Get sustainability score and streak information.
    """
    denied = _forbid_other_user(user_id)
    if denied:
        return denied

    score = get_user_score(user_id)

    if score is None:
        return jsonify({
            "error": "Sustainability score not found"
        }), 404

    return jsonify(score), 200
@ecopoints_bp.get("/ecopoints/transactions")
@require_auth
def get_my_transactions():
    user_id = str(request.user.id)
    transactions = get_user_transactions(user_id)
    return jsonify({
        "userId": user_id,
        "transactions": transactions,
        "totalTransactions": len(transactions),
    }), 200
