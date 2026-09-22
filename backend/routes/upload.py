"""
Local File Upload Routes
========================
POST /api/upload - Save one or more multipart files to backend/uploads/.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename

upload_bp = Blueprint("upload", __name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _format_size(size_bytes: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(size_bytes)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.2f} {unit}"
        size /= 1024


@upload_bp.route("/upload", methods=["POST"])
def upload_files():
    files = request.files.getlist("files")
    if not files:
        single = request.files.get("file")
        files = [single] if single else []

    files = [file for file in files if file and file.filename]
    if not files:
        return jsonify({
            "success": False,
            "error": "No files were uploaded",
            "timestamp": _now_iso(),
        }), 400

    upload_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
    os.makedirs(upload_dir, exist_ok=True)

    uploaded = []
    for file in files:
        original_name = file.filename or "upload"
        safe_name = secure_filename(original_name) or "upload"
        destination = os.path.join(upload_dir, safe_name)

        stem, ext = os.path.splitext(safe_name)
        suffix = 1
        while os.path.exists(destination):
            safe_name = f"{stem}_{suffix}{ext}"
            destination = os.path.join(upload_dir, safe_name)
            suffix += 1

        file.save(destination)

        size = os.path.getsize(destination)
        uploaded_at = _now_iso()
        storage_path = os.path.join("backend", "uploads", safe_name).replace(os.sep, "/")
        uploaded.append({
            "filename": safe_name,
            "size": size,
            "sizeFormatted": _format_size(size),
            "uploadedAt": uploaded_at,
            "storagePath": storage_path,
            "status": "completed",
            "uploadTime": uploaded_at,
        })

    primary = uploaded[0]

    return jsonify({
        "success": True,
        "data": {
            **primary,
            "files": uploaded,
        },
        "timestamp": _now_iso(),
    }), 200
