"""
EcoPoints API Routes
====================
API endpoints for EcoPoints transactions
and sustainability scores.
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from services.ecopoints_service import (
    POINT_RULES,
    award_points,
    get_user_score,
    get_user_transactions,
)


ecopoints_bp = Blueprint(
    "ecopoints",
    __name__,
   
)


@ecopoints_bp.post("/ecopoints/award")
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
        return jsonify({
            "error": "userId is required"
        }), 400

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

    # Only allow predefined scoring rules.
    if event_type not in POINT_RULES:
        return jsonify({
            "error": f"Unsupported event type: {event_type}"
        }), 400

    points = POINT_RULES[event_type]

    try:
        transaction = award_points(
            user_id=user_id,
            event_type=event_type,
            event_id=event_id,
            points=points,
            activity_id=activity_id,
            recommendation_id=data.get("recommendationId"),
            organization_id=data.get("organizationId"),
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
def get_ecopoints(user_id: str):
    """
    Get EcoPoint transaction history for a user.
    """

    transactions = get_user_transactions(user_id)

    return jsonify({
        "userId": user_id,
        "transactions": transactions,
        "totalTransactions": len(transactions),
    }), 200


@ecopoints_bp.get("/ecopoints/<user_id>/score")
def get_sustainability_score(user_id: str):
    """
    Get sustainability score and streak information.
    """

    score = get_user_score(user_id)

    if score is None:
        return jsonify({
            "error": "Sustainability score not found"
        }), 404

    return jsonify(score), 200