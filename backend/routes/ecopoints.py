"""
EcoPoints API Routes
====================
API endpoints for EcoPoints transactions
and sustainability scores.
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from auth_utils import require_auth, require_role
from config.scoring_rules import SCORING_RULES, get_points
from extensions import db
from models.activity import Activity
from models.user import User
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
@require_role("Organization Admin")
def award_ecopoints():
    """
    Award EcoPoints for a legitimate EcoTime activity event.
    Only Organization Admins can invoke point awards.
    """

    data = request.get_json(silent=True) or {}

    user_id = data.get("userId")
    event_type = data.get("eventType")
    event_id = data.get("eventId")
    activity_id = data.get("activityId")

    if user_id is None or (isinstance(user_id, str) and not user_id.strip()):
        user_id = str(request.user.id)

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

    if isinstance(user_id, bool):
        return jsonify({
            "error": "userId must be a valid integer"
        }), 400

    try:
        target_user_id_int = int(user_id)

        if str(user_id).strip() != str(target_user_id_int) or target_user_id_int <= 0:
            return jsonify({
                "error": "userId must be a valid positive integer"
            }), 400

    except (ValueError, TypeError):
        return jsonify({
            "error": "userId must be a valid integer"
        }), 400

    # Only allow predefined scoring rules.
    if event_type not in SCORING_RULES:
        return jsonify({
            "error": f"Unsupported event type: {event_type}"
        }), 400

    admin = request.user

    # Verify that target user exists
    target_user = db.session.get(User, target_user_id_int)
    if target_user is None:
        return jsonify({
            "error": f"User '{user_id}' does not exist"
        }), 404

    # Verify that target user belongs to the admin's organization
    if target_user.organization_id != admin.organization_id:
        return jsonify({
            "success": False,
            "error": "User does not belong to your organization",
        }), 403

    # Verify that the target activity belongs to the admin's organization
    activity = db.session.get(Activity, activity_id)
    if activity is None:
        return jsonify({
            "error": f"Activity '{activity_id}' does not exist."
        }), 404

    if activity.organization_id != admin.organization_id:
        return jsonify({
            "success": False,
            "error": "Activity does not belong to your organization",
        }), 403

    points = get_points(event_type)

    try:
        transaction = award_points(
            user_id=str(target_user.id),
            event_type=event_type,
            event_id=event_id,
            points=points,
            activity_id=activity_id,
            recommendation_id=data.get("recommendationId"),
            organization_id=str(admin.organization_id),
            description=data.get("description"),
        )

        # Same event was already rewarded or daily/weekly cap reached.
        if transaction is None:
            return jsonify({
                "error": "EcoPoints have already been awarded for this event."
            }), 409

        db.session.commit()

        return jsonify({
            "message": "EcoPoints awarded successfully",
            "transaction": transaction.to_dict(),
        }), 201

    except ValueError as error:
        db.session.rollback()
        return jsonify({
            "error": str(error)
        }), 400

    except Exception:
        db.session.rollback()
        return jsonify({
            "error": "Failed to award EcoPoints"
        }), 500


@ecopoints_bp.get("/ecopoints/<user_id>")
@require_auth
def get_ecopoints(user_id: str):
    """
    Get EcoPoint transaction history for a user.
    Ordinary users can only access their own transactions.
    """
    current_user = request.user
    target_user_id = str(user_id)

    if target_user_id != str(current_user.id) and target_user_id != "me":
        if not (current_user.role and current_user.role.name == "Organization Admin"):
            return jsonify({
                "success": False,
                "error": "You do not have permission to access another user's sustainability data",
            }), 403

        if target_user_id.isdigit():
            target_user = db.session.get(User, int(target_user_id))
            if target_user is not None and target_user.organization_id != current_user.organization_id:
                return jsonify({
                    "success": False,
                    "error": "You do not have permission to access data from another organization",
                }), 403

    effective_user_id = str(current_user.id) if target_user_id == "me" else target_user_id
    transactions = get_user_transactions(effective_user_id)

    return jsonify({
        "userId": effective_user_id,
        "transactions": transactions,
        "totalTransactions": len(transactions),
    }), 200


@ecopoints_bp.get("/ecopoints/<user_id>/score")
@require_auth
def get_sustainability_score(user_id: str):
    """
    Get sustainability score and streak information.
    Ordinary users can only access their own score.
    """

    current_user = request.user

    # Resolve the "me" alias to the authenticated user's ID.
    target_user_id = (
        str(current_user.id) if user_id == "me" else str(user_id)
    )

    # Enforce ownership: ordinary users can only access their own score.
    denied = _forbid_other_user(target_user_id)
    if denied:
        return denied

    score = get_user_score(target_user_id)

    if score is None:
        return jsonify({
            "error": "Sustainability score not found"
        }), 404

    return jsonify(score), 200



@ecopoints_bp.get("/ecopoints/transactions")
@require_auth
def get_my_transactions():
    """
    Get the authenticated user's EcoPoint transactions.
    """
    current_user = request.user
    requested_user_id = request.args.get("userId")

    if requested_user_id and requested_user_id not in ("me", str(current_user.id)):
        if not (current_user.role and current_user.role.name == "Organization Admin"):
            return jsonify({
                "success": False,
                "error": "You do not have permission to access another user's transactions",
            }), 403

        if not requested_user_id.isdigit() or int(requested_user_id) <= 0:
            return jsonify({"error": "Invalid user ID"}), 400

        target_user = db.session.get(User, int(requested_user_id))

        if target_user is None:
            return jsonify({"error": "User not found"}), 404

        if target_user.organization_id != current_user.organization_id:
            return jsonify({
                "success": False,
                "error": "You do not have permission to access data from another organization",
            }), 403

    effective_user_id = (
        str(requested_user_id)
        if requested_user_id and requested_user_id != "me"
        else str(current_user.id)
    )

    transactions = get_user_transactions(effective_user_id)

    return jsonify({
        "userId": effective_user_id,
        "transactions": transactions,
        "totalTransactions": len(transactions),
    }), 200