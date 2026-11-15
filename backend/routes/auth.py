from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token
from sqlalchemy.exc import IntegrityError

from auth_utils import get_current_user, require_auth
from extensions import db
from models.organization import Organization
from models.organization_member import OrganizationMember
from models.organization_invitation import OrganizationInvitation
from models.role import Role
from models.user import User

auth_bp = Blueprint("auth", __name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_name(payload: dict) -> tuple[str, str]:
    first_name = (payload.get("first_name") or payload.get("firstName") or "").strip()
    last_name = (payload.get("last_name") or payload.get("lastName") or "").strip()
    if first_name or last_name:
        return first_name, last_name

    full_name = (payload.get("name") or "").strip()
    if not full_name:
        return "", ""
    parts = full_name.split(maxsplit=1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


@auth_bp.route("/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")
    first_name, last_name = _normalize_name(data)
    org_name = (data.get("organization_name") or data.get("organizationName") or "").strip()
    invitation_code = str(data.get("invitation_code") or data.get("invitationCode") or "").strip()

    if not email or not password or not first_name:
        return jsonify({"success": False, "error": "Missing required registration fields"}), 400
    if not invitation_code and not org_name:
        return jsonify({"success": False, "error": "Organization name or invitation code is required"}), 400

    if "@" not in email:
        return jsonify({"success": False, "error": "A valid email address is required"}), 400

    if len(password) < 8:
        return jsonify({"success": False, "error": "Password must be at least 8 characters"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"success": False, "error": "Email already registered"}), 409

    invitation = None
    org = None
    if invitation_code:
        token_hash = hashlib.sha256(invitation_code.encode("utf-8")).hexdigest()
        invitation = (
            OrganizationInvitation.query
            .filter_by(token_hash=token_hash)
            .with_for_update()
            .first()
        )
        if invitation is None or not invitation.is_active():
            return jsonify({
                "success": False,
                "error": "This invitation is invalid, expired, revoked, or already used.",
            }), 400
        org = db.session.get(Organization, invitation.organization_id)
        if org is None:
            return jsonify({"success": False, "error": "The invited organization no longer exists."}), 400
    elif Organization.query.filter_by(name=org_name).first():
        return jsonify({
            "success": False,
            "error": "This organization already exists. Ask an organization admin to create your account.",
        }), 409

    try:
        if org is None:
            org = Organization(name=org_name)
            db.session.add(org)
            db.session.flush()

        role_name = "Employee" if invitation is not None else "Organization Admin"
        role = Role.query.filter_by(name=role_name).first()
        if role is None:
            role = Role(name=role_name, description=(
                "Organization employee" if invitation is not None else "Organization administrator"
            ))
            db.session.add(role)
            db.session.flush()

        user = User(
            first_name=first_name,
            last_name=last_name,
            email=email,
            organization_id=org.id,
            role_id=role.id,
        )
        user.set_password(password)
        db.session.add(user)
        db.session.flush()

        db.session.add(OrganizationMember(
            organization_id=org.id,
            user_id=user.id,
            role_id=role.id,
        ))
        if invitation is not None:
            invitation.used_at = datetime.now(timezone.utc)
            invitation.used_by_user_id = user.id
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"success": False, "error": "Registration failed due to duplicate data"}), 409

    token = create_access_token(
        identity=str(user.id),
        additional_claims={"organization_id": user.organization_id, "role": user.role.name if user.role else role_name},
    )
    return jsonify({
        "success": True,
        "message": "User registered successfully",
        "token": token,
        "user": user.to_public_dict(),
        "timestamp": _now_iso(),
    }), 201


@auth_bp.route("/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"success": False, "error": "Email and password are required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"success": False, "error": "Invalid email or password"}), 401

    token = create_access_token(
        identity=str(user.id),
        additional_claims={"organization_id": user.organization_id, "role": user.role.name if user.role else None},
    )
    return jsonify({
        "success": True,
        "message": "Login successful",
        "token": token,
        "user": user.to_public_dict(),
        "timestamp": _now_iso(),
    }), 200


@auth_bp.route("/users/me", methods=["GET"])
@require_auth
def me():
    user = get_current_user()
    if user is None:
        return jsonify({"success": False, "error": "Authentication required"}), 401

    payload = user.to_public_dict()
    return jsonify({
        "id": payload["id"],
        "email": payload["email"],
        "firstName": payload["firstName"],
        "lastName": payload["lastName"],
        "organizationId": payload["organizationId"],
        "organization": payload["organization"],
        "role": payload["role"],
        "createdAt": payload["createdAt"],
        "timestamp": _now_iso(),
    }), 200
