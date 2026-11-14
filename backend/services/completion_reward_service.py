"""
Completion Reward Service
=========================
Central helper that awards EcoPoints when an activity genuinely completes.

Called from exactly two genuine completion paths:
  1. Simulated workloads — advance_simulated_activities() in activity_service.py
  2. File upload workloads — execute_upload() in upload_service.py

Design invariants:
  - Awards happen ONLY when an activity transitions running → completed.
  - Legacy ownerless activities (user_id is None) complete normally but receive
    no reward and no error.
  - Strict Green Window eligibility: complete_green_window (10 pts) is awarded
    ONLY when completion occurs within the verified Green Window bounds.
  - Completion outside an assigned Green Window, or with missing/invalid window
    timestamps, does not receive the Green Window reward.
  - Activities without an assigned Green Window earn delay_flexible_activity (5 pts)
    only if flexible; non-flexible activities receive no reward.
  - Atomic outer transaction: completion + reward are part of the same transaction.
    Unexpected database errors propagate to the outer transaction so that the
    entire transition rolls back safely and can retry on the next execution.
  - award_points() handles duplicate prevention, daily/weekly caps, and
    exactly-once semantics internally using savepoints.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from extensions import db
from models.activity import Activity
from models.activity_history import ActivityHistory
from models.user import User
from config.scoring_rules import get_points
from services.ecopoints_service import award_points

logger = logging.getLogger(__name__)


def _as_utc(dt: datetime | None) -> datetime | None:
    """Ensure a datetime is timezone-aware UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _get_window_bounds(activity: Activity) -> tuple[datetime | None, datetime | None]:
    """Retrieve verified window bounds for an activity, checking both Activity and UploadRegistration."""
    start = _as_utc(getattr(activity, "assigned_window_start", None)) or _as_utc(activity.scheduled_start_time)
    end = _as_utc(getattr(activity, "assigned_window_end", None)) or _as_utc(activity.expected_end_time)

    if (start is None or end is None) and activity.activity_type == "file-upload":
        from models.upload_registration import UploadRegistration
        reg = (
            UploadRegistration.query
            .filter_by(activity_id=activity.id)
            .order_by(UploadRegistration.created_at.desc())
            .first()
        )
        if reg:
            start = start or _as_utc(reg.scheduled_start_time)
            end = end or _as_utc(reg.scheduled_end_time)

    return start, end


def _get_completion_time(activity: Activity, history_event: ActivityHistory) -> datetime:
    """Determine the exact completion time for window boundary verification."""
    if activity.activity_type == "file-upload":
        from models.upload_registration import UploadRegistration
        reg = (
            UploadRegistration.query
            .filter_by(activity_id=activity.id)
            .order_by(UploadRegistration.created_at.desc())
            .first()
        )
        if reg and reg.completed_at:
            return _as_utc(reg.completed_at)

    if history_event and history_event.created_at:
        return _as_utc(history_event.created_at)

    if activity.updated_at:
        return _as_utc(activity.updated_at)

    return datetime.now(timezone.utc)


def try_award_completion_points(
    activity: Activity,
    history_event: ActivityHistory,
) -> None:
    """
    Attempt to award EcoPoints for a genuinely completed activity.

    This function MUST be called:
      - After the ActivityHistory row for the "completed" transition has been
        flushed (so history_event.id is available).
      - Within the same database transaction that commits the completion, so
        that completion + reward are atomic.

    Args:
        activity: The Activity that just completed.
        history_event: The ActivityHistory row recording the running→completed
                       transition, already flushed with a valid .id.
    """

    if activity is None:
        logger.warning("try_award_completion_points called with None activity.")
        return

    # ---------------------------------------------------------------
    # 1. Skip legacy ownerless activities
    # ---------------------------------------------------------------
    if activity.user_id is None:
        logger.info(
            "Skipping reward for ownerless legacy activity %s",
            activity.id,
        )
        return

    # ---------------------------------------------------------------
    # 2. Validate genuine completion state & history transition
    # ---------------------------------------------------------------
    if activity.status != "completed":
        logger.warning(
            "Rejecting reward for activity %s: status is '%s', expected 'completed'.",
            activity.id,
            activity.status,
        )
        return

    if history_event is None or history_event.activity_id != activity.id:
        logger.warning(
            "Rejecting reward for activity %s: history event does not belong to activity.",
            activity.id,
        )
        return

    if history_event.previous_status != "running" or history_event.new_status != "completed":
        logger.warning(
            "Rejecting reward for activity %s: history transition '%s' -> '%s' "
            "is not running -> completed.",
            activity.id,
            history_event.previous_status,
            history_event.new_status,
        )
        return

    # Verify that the owner user exists in the database
    owner = db.session.get(User, activity.user_id) if str(activity.user_id).isdigit() else None
    if owner is None:
        logger.warning(
            "Rejecting reward for activity %s: owner user %s does not exist.",
            activity.id,
            activity.user_id,
        )
        return

    if activity.organization_id is None or owner.organization_id != activity.organization_id:
        logger.warning(
            "Rejecting reward for activity %s: organization mismatch (activity=%s, user=%s).",
            activity.id,
            activity.organization_id,
            owner.organization_id,
        )
        return

    # ---------------------------------------------------------------
    # 3. Determine reward eligibility based on Green Window bounds
    # ---------------------------------------------------------------
    if activity.assigned_window_id:
        window_start, window_end = _get_window_bounds(activity)

        # Handle missing or invalid window records safely
        if window_start is None or window_end is None or window_start >= window_end:
            logger.warning(
                "Activity %s has assigned_window_id '%s' but missing or invalid window "
                "timestamps (start=%s, end=%s); Green Window reward disqualified.",
                activity.id,
                activity.assigned_window_id,
                window_start,
                window_end,
            )
            return

        comp_time = _get_completion_time(activity, history_event)

        # Check whether completion is within the assigned Green Window
        if window_start <= comp_time <= window_end:
            event_type = "complete_green_window"
        else:
            logger.info(
                "Activity %s completed at %s outside its assigned Green Window '%s' "
                "[%s to %s]; Green Window reward disqualified.",
                activity.id,
                comp_time,
                activity.assigned_window_id,
                window_start,
                window_end,
            )
            # Existing scoring rules do not define an alternative reward for an
            # activity assigned a window but completed outside it. No points awarded.
            return
    else:
        # Activity completed without an assigned Green Window
        if activity.type == "flexible":
            event_type = "delay_flexible_activity"
        else:
            logger.info(
                "Activity %s is non-flexible and completed without a Green Window; no reward.",
                activity.id,
            )
            return

    points = get_points(event_type)

    # ---------------------------------------------------------------
    # 4. Award points atomically (handles duplicates, caps, streaks)
    # ---------------------------------------------------------------
    try:
        result = award_points(
            user_id=str(activity.user_id),
            event_type=event_type,
            event_id=str(history_event.id),
            points=points,
            activity_id=activity.id,
            organization_id=str(activity.organization_id),
            description=(
                f"Activity '{activity.name}' completed"
                + (f" in green window {activity.assigned_window_id}"
                   if activity.assigned_window_id else "")
            ),
        )
        if result is not None:
            logger.info(
                "Awarded %d EcoPoints (%s) to user %s for activity %s",
                points, event_type, activity.user_id, activity.id,
            )
        else:
            logger.info(
                "No points awarded for activity %s (already rewarded or cap reached)",
                activity.id,
            )
    except ValueError as exc:
        # Validation errors (e.g. data mismatch). Log warning.
        logger.warning(
            "Reward validation failed for activity %s: %s",
            activity.id, exc,
        )
    except Exception:
        # Unexpected database or system failure. Do not silently swallow!
        # Re-raise so the outer transaction can roll back and retry safely,
        # ensuring completed activities never permanently lose eligible rewards.
        logger.exception(
            "Unexpected error awarding points for activity %s; propagating for transaction rollback.",
            activity.id,
        )
        raise
