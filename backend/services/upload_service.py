"""Validation and persisted execution for the supported local file-upload workload."""

from __future__ import annotations

import io
import hashlib
import json
import logging
import os
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from extensions import db
from models.activity import Activity
from models.activity_history import ActivityHistory
from models.upload_registration import UploadRegistration
from models.simulation_config import SimulationConfig
from services import optimizer_service

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 100 * 1024 * 1024
ALLOWED_EXTENSIONS = {
    ".csv", ".json", ".txt", ".zip",
    ".bin", ".pt", ".pth", ".ckpt", ".safetensors",
}
UPLOAD_ROOT = Path(__file__).resolve().parents[1] / "uploads"
STALE_EXECUTION_AFTER = timedelta(minutes=2)


class UploadError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _activity_for(activity_id: str, organization_id: int) -> Activity:
    activity = Activity.query.filter_by(
        id=activity_id,
        organization_id=organization_id,
    ).first()
    if activity is None:
        raise UploadError("Activity not found", 404)
    if activity.activity_type != "file-upload":
        raise UploadError("Only file-upload activities can execute uploads", 400)
    return activity


def _append_activity_transition(activity: Activity, new_status: str) -> None:
    if activity.status == new_status:
        return
    db.session.add(ActivityHistory(
        activity_id=activity.id,
        previous_status=activity.status,
        new_status=new_status,
        execution_time=(
            (_now() - _utc(activity.updated_at)).total_seconds()
            if activity.updated_at else None
        ),
    ))
    activity.status = new_status
    activity.updated_at = _now()
    if new_status == "completed":
        activity.progress = 100.0
    elif new_status in {"pending", "failed"}:
        activity.progress = 0.0


def _validate_bytes(filename: str, content: bytes) -> str:
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise UploadError(
            "Unsupported file type. Allowed: CSV, JSON, TXT, ZIP, and binary checkpoints "
            "(.bin, .pt, .pth, .ckpt, .safetensors)."
        )
    if not content:
        raise UploadError("The selected file is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise UploadError("File exceeds the 100 MiB size limit", 413)

    if extension == ".zip" and not zipfile.is_zipfile(io.BytesIO(content)):
        raise UploadError("The selected ZIP file is invalid or has an invalid file signature")
    if extension == ".json":
        try:
            json.loads(content)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise UploadError("The selected JSON file is not valid JSON") from exc
    if extension in {".csv", ".txt"}:
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise UploadError("CSV and TXT files must be valid UTF-8 text") from exc
        if "\x00" in text:
            raise UploadError("CSV and TXT files cannot contain binary NUL bytes")
    return extension


def register_upload(
    activity_id: str,
    organization_id: int,
    uploaded_file: FileStorage | None,
    idempotency_key: str | None = None,
) -> tuple[UploadRegistration, bool]:
    if uploaded_file is None or not uploaded_file.filename:
        raise UploadError("A file is required")

    activity = _activity_for(activity_id, organization_id)

    original_filename = uploaded_file.filename
    safe_filename = secure_filename(original_filename)
    if not safe_filename or len(safe_filename) > 255:
        raise UploadError("The file name is invalid or too long")
    content = uploaded_file.stream.read(MAX_UPLOAD_BYTES + 1)
    extension = _validate_bytes(safe_filename, content)
    fingerprint = hashlib.sha256(
        b"\0".join((
            activity_id.encode("utf-8"),
            safe_filename.encode("utf-8"),
            (uploaded_file.mimetype or "application/octet-stream").encode("utf-8"),
            hashlib.sha256(content).digest(),
        ))
    ).hexdigest()
    if idempotency_key:
        try:
            existing = UploadRegistration.query.filter_by(
                organization_id=organization_id,
                idempotency_key=idempotency_key,
            ).first()
        except Exception as exc:
            logger.exception("Could not verify upload idempotency key")
            raise UploadError("Could not verify the upload request; retry safely", 500) from exc
        if existing:
            if existing.request_fingerprint != fingerprint:
                raise UploadError(
                    "Idempotency-Key was already used for a different upload request",
                    409,
                )
            return existing, True
    if activity.status in {"scheduled", "running", "completed"}:
        raise UploadError(f"Cannot register an upload while activity is {activity.status}", 409)

    upload_id = str(uuid.uuid4())
    organization_dir = UPLOAD_ROOT / f"org-{organization_id}"
    stored_filename = f"{upload_id}{extension}"
    staged = organization_dir / f"{stored_filename}.staged"
    final = organization_dir / stored_filename
    try:
        organization_dir.mkdir(parents=True, exist_ok=True)
        with staged.open("xb") as stream:
            stream.write(content)
        registration = UploadRegistration(
            id=upload_id,
            organization_id=organization_id,
            activity_id=activity.id,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint if idempotency_key else None,
            original_filename=safe_filename,
            stored_filename=stored_filename,
            content_type=uploaded_file.mimetype or "application/octet-stream",
            size_bytes=len(content),
            status="pending",
            staging_path=str(staged),
            final_path=str(final),
        )
        db.session.add(registration)
        db.session.commit()
        return registration, False
    except Exception as exc:
        db.session.rollback()
        try:
            staged.unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not remove incomplete staged upload %s", staged)
        if idempotency_key:
            try:
                existing = UploadRegistration.query.filter_by(
                    organization_id=organization_id,
                    idempotency_key=idempotency_key,
                ).first()
                if existing:
                    if existing.request_fingerprint != fingerprint:
                        raise UploadError(
                            "Idempotency-Key was already used for a different upload request",
                            409,
                        ) from exc
                    return existing, True
            except UploadError:
                raise
            except Exception:
                logger.exception("Could not resolve upload idempotency race")
        logger.exception("Could not persist upload registration for activity %s", activity_id)
        raise UploadError("Could not persist the upload registration", 500)


def get_upload(upload_id: str, organization_id: int) -> UploadRegistration:
    registration = UploadRegistration.query.filter_by(
        id=upload_id,
        organization_id=organization_id,
    ).first()
    if registration is None:
        raise UploadError("Upload not found", 404)
    return registration


def list_activity_uploads(activity_id: str, organization_id: int) -> list[dict[str, Any]]:
    _activity_for(activity_id, organization_id)
    registrations = UploadRegistration.query.filter_by(
        activity_id=activity_id,
        organization_id=organization_id,
    ).order_by(UploadRegistration.created_at.desc()).all()
    return [registration.to_dict() for registration in registrations]


def schedule_upload(upload_id: str, organization_id: int) -> tuple[UploadRegistration, dict]:
    registration = get_upload(upload_id, organization_id)
    activity = _activity_for(registration.activity_id, organization_id)
    if registration.status not in {"pending", "failed"}:
        raise UploadError(f"Cannot schedule an upload while it is {registration.status}", 409)
    if activity.type != "flexible":
        registration.recommendation_reason = "Inflexible activities cannot be delayed for scheduling"
        db.session.commit()
        raise UploadError(registration.recommendation_reason, 409)
    if activity.priority_score >= 80:
        registration.recommendation_reason = "Urgent activities cannot be delayed for scheduling"
        db.session.commit()
        raise UploadError(registration.recommendation_reason, 409)
    if not Path(registration.staging_path).is_file():
        raise UploadError("The staged upload is unavailable; register the file again", 409)

    config = db.session.get(SimulationConfig, 1)
    zone_id = config.zone if config else os.getenv("DEFAULT_ZONE", "US-CA")
    baseline = config.baseline_intensity if config else 380.0
    try:
        result = optimizer_service.recommend_schedule(
            tasks=[activity.to_dict()],
            permitted_window=None,
            method="greedy",
            zone_id=zone_id,
            baseline_intensity=baseline,
        )
    except optimizer_service.RecommendationDataUnavailable as exc:
        registration.recommendation_reason = str(exc)
        db.session.commit()
        raise

    recommendation = next(
        (
            item for item in result.get("recommendations", [])
            if item.get("activityId") == activity.id
        ),
        None,
    )
    start = optimizer_service._parse_datetime(
        recommendation.get("startTime") if recommendation else None
    )
    if (
        recommendation is None
        or recommendation.get("status") != "scheduled"
        or start is None
    ):
        reason = (
            recommendation.get("reason") if recommendation
            else "The optimizer did not return a recommendation for this activity."
        )
        registration.recommendation_reason = reason
        db.session.commit()
        raise UploadError(reason, 409)

    now = _now()
    earliest = _utc(activity.earliest_start)
    deadline = _utc(activity.deadline)
    if start < now or (earliest and start < earliest):
        registration.recommendation_reason = "The optimizer returned a start time outside the permitted interval"
        db.session.commit()
        raise UploadError(registration.recommendation_reason, 409)
    if deadline and start + timedelta(minutes=activity.duration) > deadline:
        registration.recommendation_reason = "The complete upload activity would finish after its deadline"
        db.session.commit()
        raise UploadError(registration.recommendation_reason, 409)

    window = next((item for item in result.get("windows", []) if str(item.get("id")) == str(recommendation.get("windowId"))), None)
    window_start = optimizer_service._parse_datetime(window.get("startTime")) if window else None
    window_end = optimizer_service._parse_datetime(window.get("endTime")) if window else None
    if window_start is None or window_end is None:
        raise UploadError("Optimizer did not return the selected Green Window bounds", 503)
    db.session.query(SimulationConfig).filter_by(id=1).with_for_update().first()
    reservations = Activity.query.filter(
        Activity.organization_id == organization_id,
        Activity.assigned_window_id == recommendation.get("windowId"),
        Activity.status == "scheduled",
        Activity.id != activity.id,
    ).order_by(Activity.scheduled_start_time.asc()).all()
    duration = timedelta(minutes=activity.duration)
    start = max(start, _now(), _utc(window_start) or start, _utc(activity.earliest_start) or start)
    for reserved in reservations:
        reserved_start = _utc(reserved.scheduled_start_time)
        if reserved_start is None:
            continue
        reserved_end = _utc(reserved.expected_end_time) or reserved_start + timedelta(minutes=reserved.duration)
        if start < reserved_end and start + duration > reserved_start:
            start = reserved_end
    end = start + duration
    if end > (_utc(window_end) or end) or (deadline and end > deadline):
        raise UploadError("No remaining capacity fits this activity in its Green Window", 409)

    registration.scheduled_start_time = start
    registration.scheduled_end_time = end
    registration.recommendation_reason = recommendation.get("reason")
    registration.window_id = recommendation.get("windowId")
    registration.status = "scheduled"
    registration.error_message = None
    activity.assigned_window_id = recommendation.get("windowId")
    activity.scheduled_start_time = start
    activity.expected_end_time = end
    _append_activity_transition(activity, "scheduled")
    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.exception("Could not persist schedule for upload %s", upload_id)
        raise UploadError("Could not persist the upload schedule", 500) from exc
    return registration, recommendation


def _validate_execution_time(
    registration: UploadRegistration,
    activity: Activity,
    run_now: bool,
) -> None:
    now = _now()
    earliest = _utc(activity.earliest_start)
    deadline = _utc(activity.deadline)
    if run_now:
        if earliest and now < earliest:
            raise UploadError("This activity cannot start before its earliest-start time", 409)
        start = now
    else:
        scheduled = _utc(registration.scheduled_start_time)
        if registration.status != "scheduled" or scheduled is None:
            raise UploadError("This upload has no permitted scheduled start", 409)
        if now < scheduled:
            raise UploadError("The scheduled upload is not due yet", 409)
        start = scheduled
    if deadline and start + timedelta(minutes=activity.duration) > deadline:
        raise UploadError("The upload cannot finish before its deadline", 409)
    if activity.status == "completed":
        raise UploadError("This activity has already completed", 409)


def execute_upload(
    upload_id: str,
    organization_id: int,
    run_now: bool = False,
) -> UploadRegistration:
    registration = get_upload(upload_id, organization_id)
    activity = _activity_for(registration.activity_id, organization_id)

    if registration.status == "completed":
        if not Path(registration.final_path).is_file():
            raise UploadError("Completed upload data is missing from storage", 500)
        return registration
    if registration.status == "running":
        if Path(registration.final_path).is_file():
            registration.status = "completed"
            registration.completed_at = _now()
            registration.error_message = None
            _append_activity_transition(activity, "completed")
            try:
                db.session.commit()
            except Exception as exc:
                db.session.rollback()
                logger.exception("Could not persist recovered upload %s", upload_id)
                raise UploadError("Could not persist recovered upload completion", 500) from exc
            return registration
        started = _utc(registration.execution_started_at)
        if started and _now() - started < STALE_EXECUTION_AFTER:
            raise UploadError("Upload execution is already in progress", 409)
        if not Path(registration.staging_path).is_file():
            registration.status = "failed"
            registration.error_message = "Interrupted upload has no staged or completed file"
            _append_activity_transition(activity, "failed")
            try:
                db.session.commit()
            except Exception as exc:
                db.session.rollback()
                logger.exception("Could not persist interrupted upload state %s", upload_id)
                raise UploadError("Could not persist interrupted upload state", 500) from exc
            raise UploadError(registration.error_message, 409)
    elif registration.status == "scheduled":
        _validate_execution_time(registration, activity, run_now=run_now)
    elif registration.status in {"pending", "failed"}:
        if not run_now:
            raise UploadError("Run-now confirmation is required for an unscheduled upload", 409)
        _validate_execution_time(registration, activity, run_now=True)
    else:
        raise UploadError(f"Unsupported upload state: {registration.status}", 409)

    if not run_now and activity.status != "scheduled" and registration.status != "running":
        raise UploadError("Activity is not in its scheduled state", 409)
    if run_now and activity.status not in {
        "idle", "pending", "paused", "scheduled", "failed", "running",
    }:
        raise UploadError(f"Activity cannot run from status {activity.status}", 409)
    if not Path(registration.staging_path).is_file() and not Path(registration.final_path).is_file():
        raise UploadError("Staged upload data is missing; register the file again", 409)

    registration.status = "running"
    registration.execution_started_at = _now()
    registration.error_message = None
    _append_activity_transition(activity, "running")
    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.exception("Could not persist running status for upload %s", upload_id)
        raise UploadError("Could not persist upload execution status", 500) from exc

    try:
        staging = Path(registration.staging_path)
        final = Path(registration.final_path)
        final.parent.mkdir(parents=True, exist_ok=True)
        if staging.is_file():
            os.link(staging, final)
            try:
                staging.unlink()
            except OSError:
                logger.warning("Could not remove staged copy after storing upload %s", upload_id)
        elif not final.is_file():
            raise FileNotFoundError("Neither staged nor completed upload exists")
    except OSError as exc:
        logger.exception("Upload execution failed for %s", upload_id)
        registration.status = "failed"
        registration.error_message = "Upload storage operation failed"
        registration.updated_at = _now()
        _append_activity_transition(activity, "failed")
        try:
            db.session.commit()
        except Exception as database_error:
            db.session.rollback()
            logger.exception("Could not persist failed upload state %s", upload_id)
            raise UploadError(
                "Upload storage failed and its failure state could not be persisted",
                500,
            ) from database_error
        raise UploadError("Upload storage operation failed; retry is available", 500) from exc

    registration.status = "completed"
    registration.completed_at = _now()
    registration.updated_at = _now()
    registration.error_message = None
    _append_activity_transition(activity, "completed")
    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.exception("Could not persist completion for upload %s", upload_id)
        raise UploadError(
            "File was stored, but completion status could not be persisted; retry safely",
            500,
        ) from exc
    return registration


def process_due_uploads(limit: int = 25) -> int:
    """Execute due registrations from a backend worker; row locks coordinate workers."""
    completed = 0
    for _ in range(max(1, limit)):
        now = _now()
        registration = (
            UploadRegistration.query
            .filter(
                UploadRegistration.status == "scheduled",
                UploadRegistration.scheduled_start_time <= now,
            )
            .order_by(UploadRegistration.scheduled_start_time.asc())
            .with_for_update(skip_locked=True)
            .first()
        )
        if registration is None:
            registration = (
                UploadRegistration.query
                .filter(
                    UploadRegistration.status == "running",
                    UploadRegistration.execution_started_at <= now - STALE_EXECUTION_AFTER,
                )
                .order_by(UploadRegistration.execution_started_at.asc())
                .with_for_update(skip_locked=True)
                .first()
            )
            if registration is None:
                db.session.rollback()
                break
        upload_id = registration.id
        organization_id = registration.organization_id
        try:
            execute_upload(upload_id, organization_id, run_now=False)
            completed += 1
        except UploadError as exc:
            # execute_upload persists supported failures as failed for safe retry.
            logger.warning("Scheduled upload %s was not completed: %s", upload_id, exc)
            db.session.rollback()
        except Exception:
            db.session.rollback()
            logger.exception("Unexpected worker failure for upload %s", upload_id)
    return completed


def upload_file_path(upload_id: str, organization_id: int) -> tuple[UploadRegistration, Path]:
    registration = get_upload(upload_id, organization_id)
    if registration.status != "completed":
        raise UploadError("Upload is not completed", 409)
    path = Path(registration.final_path)
    if not path.is_file():
        raise UploadError("Uploaded file is missing from storage", 404)
    return registration, path
