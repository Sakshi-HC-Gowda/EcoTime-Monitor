"""
Schedule Slot Model
===================
Persisted green-window assignment for an activity.
"""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class ScheduleSlot(db.Model):
    __tablename__ = "schedule_slots"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    activity_id = db.Column(
        db.String(64), db.ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    activity = db.relationship("Activity", backref=db.backref(
        "schedule_slots", cascade="all, delete-orphan", lazy="select",
        order_by="ScheduleSlot.created_at.desc()",
    ))

    window_id = db.Column(db.String(64), nullable=False, index=True)
    start_time = db.Column(db.DateTime(timezone=True), nullable=False, index=True)
    end_time = db.Column(db.DateTime(timezone=True), nullable=True)
    avg_carbon_intensity = db.Column(db.Float, nullable=True)
    eco_score = db.Column(db.Float, nullable=True)
    status = db.Column(
        db.String(32), nullable=False, default="scheduled", index=True,
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "activityId": self.activity_id,
            "windowId": self.window_id,
            "startTime": self.start_time.isoformat() if self.start_time else None,
            "endTime": self.end_time.isoformat() if self.end_time else None,
            "avgCarbonIntensity": self.avg_carbon_intensity,
            "ecoScore": self.eco_score,
            "status": self.status,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<ScheduleSlot activity={self.activity_id!r} window={self.window_id!r}>"
