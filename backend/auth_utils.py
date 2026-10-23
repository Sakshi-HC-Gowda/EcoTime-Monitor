from __future__ import annotations

from functools import wraps

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from extensions import db
from models.user import User


def get_current_user() -> User | None:
    user_id = get_jwt_identity()
    if not user_id:
        return None
    try:
        user = db.session.get(User, int(user_id))
        if user is not None:
            request.user = user
        return user
    except (TypeError, ValueError):
        return None


def require_auth(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if user is None:
            return jsonify({"success": False, "error": "Authentication required"}), 401
        request.user = user
        return fn(*args, **kwargs)

    return wrapper


def require_role(*role_names):
    def decorator(fn):
        @wraps(fn)
        @require_auth
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if user is None or user.role is None or user.role.name not in role_names:
                return jsonify({
                    "success": False,
                    "error": "You do not have permission to access this resource",
                }), 403
            request.user = user
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def require_organization_access(fn):
    @wraps(fn)
    @require_auth
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if user is None:
            return jsonify({"success": False, "error": "Authentication required"}), 401

        requested_org_id = kwargs.get("organization_id")
        if requested_org_id is None:
            requested_org_id = request.view_args.get("organization_id") if request.view_args else None
        if requested_org_id is not None:
            try:
                requested_org_id = int(requested_org_id)
            except (TypeError, ValueError):
                return jsonify({"success": False, "error": "Invalid organization identifier"}), 400
            if requested_org_id != int(user.organization_id):
                return jsonify({
                    "success": False,
                    "error": "You do not have access to this organization",
                }), 403

        request.user = user
        return fn(*args, **kwargs)

    return wrapper


def require_organization_admin(fn):
    @wraps(fn)
    @require_organization_access
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if user is None or user.role is None or user.role.name != "Organization Admin":
            return jsonify({
                "success": False,
                "error": "Only organization admins can access this resource",
            }), 403
        request.user = user
        return fn(*args, **kwargs)

    return wrapper
