"""
Current Status Model
=======================
A dedicated, queryable "current status" record per activity — separate
from Activity.status (which remains the source of truth and is updated
in the same transaction). This exists because analytics/status endpoints
benefit from a normalized 1-row-per-activity status table that can be
joined/filtered independently, and because your schema spec calls for it
as its own table rather than overloading Activity.

Kept in sync with Activity.status inside activity_service.update_activity()
so the two never drift — there is exactly one write path.
"""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class CurrentStatus(db.Model):
    __tablename__ = "current_status"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # One current-status row per activity (1:1) — enforced at the DB level.
    activity_id = db.Column(
        db.String(64), db.ForeignKey("activities.id"), nullable=False,
        unique=True, index=True,
    )
    activity = db.relationship("Activity", backref=db.backref(
        "current_status", uselist=False, cascade="all, delete-orphan", lazy="select"
    ))

    current_status = db.Column(db.String(32), nullable=False, index=True)
    last_updated = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "activityId": self.activity_id,
            "currentStatus": self.current_status,
            "lastUpdated": self.last_updated.isoformat() if self.last_updated else None,
        }

    def __repr__(self) -> str:
        return f"<CurrentStatus activity={self.activity_id!r} status={self.current_status!r}>"
