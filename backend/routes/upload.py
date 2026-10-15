"""Authenticated, organization-scoped file-upload lifecycle routes."""

from __future__ import annotations

from datetime import datetime, timezone
import logging
import re

from flask import Blueprint, jsonify, request, send_file
from auth_utils import require_auth
from services.optimizer_service import RecommendationDataUnavailable
from services.upload_service import (
    UploadError,
    execute_upload,
    get_upload,
    list_activity_uploads,
    register_upload,
    schedule_upload,
    upload_file_path,
)

upload_bp = Blueprint("upload", __name__)
logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _error(error: UploadError):
    return jsonify({
        "success": False,
        "error": str(error),
        "timestamp": _now_iso(),
    }), error.status_code


@upload_bp.route("/upload", methods=["POST"])
@require_auth
def upload_files():
    """Validate and stage a file; Idempotency-Key safely replays identical retries."""
    activity_id = request.form.get("activityId", "")
    if not activity_id:
        return jsonify({
            "success": False,
            "error": "Field 'activityId' is required",
            "timestamp": _now_iso(),
        }), 400
    idempotency_key = request.headers.get("Idempotency-Key")
    if idempotency_key is not None and not re.fullmatch(r"[\x21-\x7e]{1,128}", idempotency_key):
        return jsonify({
            "success": False,
            "error": "Idempotency-Key must contain 1 to 128 visible ASCII characters",
            "timestamp": _now_iso(),
        }), 400
    try:
        registration, replayed = register_upload(
            activity_id,
            request.user.organization_id,
            request.files.get("file"),
            idempotency_key=idempotency_key,
        )
    except UploadError as error:
        return _error(error)
    return jsonify({
        "success": True,
        "data": registration.to_dict(),
        "timestamp": _now_iso(),
    }), 200 if replayed else 201


@upload_bp.route("/activities/<activity_id>/uploads", methods=["GET"])
@require_auth
def activity_uploads(activity_id: str):
    try:
        uploads = list_activity_uploads(activity_id, request.user.organization_id)
    except UploadError as error:
        return _error(error)
    return jsonify({"success": True, "data": uploads, "timestamp": _now_iso()}), 200


@upload_bp.route("/uploads/<upload_id>", methods=["GET"])
@require_auth
def upload_status(upload_id: str):
    try:
        registration = get_upload(upload_id, request.user.organization_id)
    except UploadError as error:
        return _error(error)
    return jsonify({
        "success": True,
        "data": registration.to_dict(),
        "timestamp": _now_iso(),
    }), 200


@upload_bp.route("/uploads/<upload_id>/schedule", methods=["POST"])
@require_auth
def schedule(upload_id: str):
    try:
        registration, recommendation = schedule_upload(
            upload_id,
            request.user.organization_id,
        )
    except RecommendationDataUnavailable as error:
        return jsonify({
            "success": False,
            "error": str(error),
            "timestamp": _now_iso(),
        }), 503
    except UploadError as error:
        return _error(error)
    except ValueError as error:
        return jsonify({
            "success": False,
            "error": str(error),
            "timestamp": _now_iso(),
        }), 400
    except Exception:
        logger.exception("Unexpected schedule failure for upload %s", upload_id)
        return jsonify({
            "success": False,
            "error": "Could not obtain or persist an upload recommendation",
            "timestamp": _now_iso(),
        }), 500
    return jsonify({
        "success": True,
        "data": {
            "upload": registration.to_dict(),
            "recommendation": recommendation,
        },
        "timestamp": _now_iso(),
    }), 200


@upload_bp.route("/uploads/<upload_id>/execute", methods=["POST"])
@require_auth
def execute(upload_id: str):
    data = request.get_json(silent=True)
    if data is None:
        data = {}
    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "error": "Request body must be a JSON object",
            "timestamp": _now_iso(),
        }), 400
    run_now = data.get("runNow", False)
    if not isinstance(run_now, bool):
        return jsonify({
            "success": False,
            "error": "Field 'runNow' must be a boolean",
            "timestamp": _now_iso(),
        }), 400
    try:
        registration = execute_upload(
            upload_id,
            request.user.organization_id,
            run_now=run_now,
        )
    except UploadError as error:
        return _error(error)
    except Exception:
        logger.exception("Unexpected execution failure for upload %s", upload_id)
        return jsonify({
            "success": False,
            "error": "Could not persist or execute this upload",
            "timestamp": _now_iso(),
        }), 500
    return jsonify({
        "success": True,
        "data": registration.to_dict(),
        "timestamp": _now_iso(),
    }), 200


@upload_bp.route("/uploads/<upload_id>/download", methods=["GET"])
@require_auth
def download(upload_id: str):
    try:
        registration, path = upload_file_path(
            upload_id,
            request.user.organization_id,
        )
    except UploadError as error:
        return _error(error)
    return send_file(
        path,
        as_attachment=True,
        download_name=registration.original_filename,
        mimetype=registration.content_type,
    )
