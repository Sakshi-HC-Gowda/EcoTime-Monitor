"""Persisted status-transition history for activities."""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class ActivityHistory(db.Model):
    """Records an activity's initial state and each later status change."""

    __tablename__ = "activity_history"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    activity_id = db.Column(
        db.String(64),
        db.ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    previous_status = db.Column(db.String(32), nullable=True)
    new_status = db.Column(db.String(32), nullable=False)
    # Seconds spent in ``previous_status``; absent for the initial record.
    execution_time = db.Column(db.Float, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    activity = db.relationship("Activity", back_populates="history")

    def to_dict(self) -> dict:
        """Return a JSON-serialisable representation of this history row."""
        return {
            "id": self.id,
            "activityId": self.activity_id,
            "previousStatus": self.previous_status,
            "newStatus": self.new_status,
            "executionTime": self.execution_time,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return (
            f"<ActivityHistory activity_id={self.activity_id!r} "
            f"{self.previous_status!r}->{self.new_status!r}>"
        )
