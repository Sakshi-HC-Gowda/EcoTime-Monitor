from __future__ import annotations

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from auth_utils import get_current_user, require_auth, require_organization_access, require_organization_admin
from extensions import db
from models.organization import Organization
from models.organization_member import OrganizationMember
from models.role import Role
from models.user import User

organizations_bp = Blueprint("organizations", __name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@organizations_bp.route("/organizations", methods=["POST"])
@require_auth
def create_organization():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"success": False, "error": "Organization name is required"}), 400

    user = get_current_user()
    if user is None:
        return jsonify({"success": False, "error": "Authentication required"}), 401

    if user.organization_id is not None:
        return jsonify({"success": False, "error": "Your account already belongs to an organization"}), 409
    if Organization.query.filter_by(name=name).first() is not None:
        return jsonify({"success": False, "error": "Organization name is already in use"}), 409

    try:
        org = Organization(name=name)
        db.session.add(org)
        db.session.flush()

        admin_role = Role.query.filter_by(name="Organization Admin").first()
        if admin_role is None:
            admin_role = Role(name="Organization Admin", description="Organization administrator")
            db.session.add(admin_role)
            db.session.flush()

        user.organization_id = org.id
        user.role_id = admin_role.id
        db.session.add(OrganizationMember(
            organization_id=org.id,
            user_id=user.id,
            role_id=admin_role.id,
        ))
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"success": False, "error": "Organization creation failed"}), 409

    return jsonify({
        "success": True,
        "data": org.to_dict(),
        "timestamp": _now_iso(),
    }), 201


@organizations_bp.route("/organizations/me", methods=["GET"])
@require_auth
def get_my_organization():
    user = get_current_user()
    if user is None:
        return jsonify({"success": False, "error": "Authentication required"}), 401
    if user.organization is None:
        return jsonify({"success": False, "error": "No organization is associated with this account"}), 404
    return jsonify({"success": True, "data": user.organization.to_dict(), "timestamp": _now_iso()}), 200


@organizations_bp.route("/organizations/<int:organization_id>", methods=["GET"])
@require_organization_access
def get_organization(organization_id: int):
    org = Organization.query.get(organization_id)
    if org is None:
        return jsonify({"success": False, "error": "Organization not found"}), 404
    return jsonify({"success": True, "data": org.to_dict(), "timestamp": _now_iso()}), 200


@organizations_bp.route("/organizations/<int:organization_id>", methods=["PATCH"])
@require_organization_access
@require_organization_admin
def update_organization(organization_id: int):
    org = Organization.query.get(organization_id)
    if org is None:
        return jsonify({"success": False, "error": "Organization not found"}), 404

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"success": False, "error": "Organization name is required"}), 400

    org.name = name
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"success": False, "error": "Organization update failed"}), 409

    return jsonify({"success": True, "data": org.to_dict(), "timestamp": _now_iso()}), 200


@organizations_bp.route("/organizations/<int:organization_id>/members", methods=["GET"])
@require_organization_access
@require_organization_admin
def get_members(organization_id: int):
    members = User.query.filter_by(organization_id=organization_id).all()
    return jsonify({
        "organizationId": organization_id,
        "members": [member.to_public_dict() for member in members],
        "timestamp": _now_iso(),
    }), 200


@organizations_bp.route("/organizations/<int:organization_id>/members", methods=["POST"])
@require_organization_access
@require_organization_admin
def create_member(organization_id: int):
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")
    first_name = (data.get("first_name") or data.get("firstName") or "").strip()
    last_name = (data.get("last_name") or data.get("lastName") or "").strip()

    if not email or not password or not first_name:
        return jsonify({"success": False, "error": "Missing required member fields"}), 400
    if "@" not in email:
        return jsonify({"success": False, "error": "A valid email address is required"}), 400
    if len(password) < 8:
        return jsonify({"success": False, "error": "Password must be at least 8 characters"}), 400
    if User.query.filter_by(email=email).first() is not None:
        return jsonify({"success": False, "error": "Email already registered"}), 409

    employee_role = Role.query.filter_by(name="Employee").first()
    if employee_role is None:
        employee_role = Role(name="Employee", description="Organization employee")
        db.session.add(employee_role)
        db.session.flush()

    try:
        member = User(
            first_name=first_name,
            last_name=last_name,
            email=email,
            organization_id=organization_id,
            role_id=employee_role.id,
        )
        member.set_password(password)
        db.session.add(member)
        db.session.flush()
        db.session.add(OrganizationMember(
            organization_id=organization_id,
            user_id=member.id,
            role_id=employee_role.id,
        ))
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"success": False, "error": "Member creation failed"}), 409

    return jsonify({"success": True, "data": member.to_public_dict(), "timestamp": _now_iso()}), 201


@organizations_bp.route("/organizations/<int:organization_id>/members/<int:user_id>", methods=["PATCH"])
@require_organization_access
@require_organization_admin
def update_member(organization_id: int, user_id: int):
    member = User.query.filter_by(id=user_id, organization_id=organization_id).first()
    if member is None:
        return jsonify({"success": False, "error": "Member not found in this organization"}), 404

    current_user = get_current_user()
    if current_user is None:
        return jsonify({"success": False, "error": "Authentication required"}), 401

    if member.id == current_user.id:
        return jsonify({"success": False, "error": "You cannot change your own role from this endpoint"}), 403

    data = request.get_json(silent=True) or {}
    requested_role = (data.get("role") or "").strip()
    if not requested_role:
        return jsonify({"success": False, "error": "Role is required"}), 400

    next_role = Role.query.filter_by(name=requested_role).first()
    if next_role is None:
        return jsonify({"success": False, "error": "Role not found"}), 404

    if next_role.name == "Organization Admin":
        admin_count = User.query.filter_by(organization_id=organization_id, role_id=Role.query.filter_by(name="Organization Admin").first().id if Role.query.filter_by(name="Organization Admin").first() else -1).count()
        if admin_count <= 1:
            return jsonify({"success": False, "error": "At least one admin must remain in the organization"}), 409

    member.role_id = next_role.id
    membership = OrganizationMember.query.filter_by(
        organization_id=organization_id,
        user_id=member.id,
    ).first()
    if membership is not None:
        membership.role_id = next_role.id
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"success": False, "error": "Member update failed"}), 409

    return jsonify({"success": True, "data": member.to_public_dict(), "timestamp": _now_iso()}), 200


@organizations_bp.route("/organizations/<int:organization_id>/members/<int:user_id>", methods=["DELETE"])
@require_organization_access
@require_organization_admin
def delete_member(organization_id: int, user_id: int):
    current_user = get_current_user()
    if current_user is None:
        return jsonify({"success": False, "error": "Authentication required"}), 401

    member = User.query.filter_by(id=user_id, organization_id=organization_id).first()
    if member is None:
        return jsonify({"success": False, "error": "Member not found in this organization"}), 404

    if member.id == current_user.id:
        return jsonify({"success": False, "error": "You cannot remove yourself from the organization"}), 403

    admin_role = Role.query.filter_by(name="Organization Admin").first()
    if admin_role and member.role_id == admin_role.id:
        admin_count = User.query.filter_by(organization_id=organization_id, role_id=admin_role.id).count()
        if admin_count <= 1:
            return jsonify({"success": False, "error": "At least one admin must remain in the organization"}), 409

    try:
        db.session.delete(member)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"success": False, "error": "Member removal failed"}), 409

    return jsonify({"success": True, "message": "Member removed successfully", "timestamp": _now_iso()}), 200
