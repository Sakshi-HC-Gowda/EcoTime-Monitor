from __future__ import annotations

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token
from sqlalchemy.exc import IntegrityError

from auth_utils import get_current_user, require_auth
from extensions import db
from models.organization import Organization
from models.organization_member import OrganizationMember
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

    if not email or not password or not first_name or not org_name:
        return jsonify({"success": False, "error": "Missing required registration fields"}), 400

    if "@" not in email:
        return jsonify({"success": False, "error": "A valid email address is required"}), 400

    if len(password) < 8:
        return jsonify({"success": False, "error": "Password must be at least 8 characters"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"success": False, "error": "Email already registered"}), 409

    if Organization.query.filter_by(name=org_name).first():
        return jsonify({
            "success": False,
            "error": "This organization already exists. Ask an organization admin to create your account.",
        }), 409

    try:
        org = Organization(name=org_name)
        db.session.add(org)
        db.session.flush()

        admin_role = Role.query.filter_by(name="Organization Admin").first()
        if admin_role is None:
            admin_role = Role(name="Organization Admin", description="Organization administrator")
            db.session.add(admin_role)
            db.session.flush()

        user = User(
            first_name=first_name,
            last_name=last_name,
            email=email,
            organization_id=org.id,
            role_id=admin_role.id,
        )
        user.set_password(password)
        db.session.add(user)
        db.session.flush()

        db.session.add(OrganizationMember(
            organization_id=org.id,
            user_id=user.id,
            role_id=admin_role.id,
        ))
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"success": False, "error": "Registration failed due to duplicate data"}), 409

    token = create_access_token(
        identity=str(user.id),
        additional_claims={"organization_id": user.organization_id, "role": user.role.name if user.role else "Organization Admin"},
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
