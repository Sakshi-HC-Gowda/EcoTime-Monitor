"""
Activity History Model
=======================
SQLAlchemy model that logs every status transition of an Activity
(idle → pending → running → completed, etc.), how long the activity spent
in its previous status, and which recommendation (if any) triggered the
transition.

This is the audit trail the Analytics module reads to build weekly
summaries, EcoScore trends, and the "History" page.
"""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class ActivityHistory(db.Model):
    """A single status-transition record for an Activity."""

    __tablename__ = "activity_history"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    activity_id = db.Column(
        db.String(64), db.ForeignKey("activities.id"), nullable=False, index=True
    )
    activity = db.relationship("Activity", backref=db.backref(
        "history", cascade="all, delete-orphan", lazy="select",
        order_by="ActivityHistory.created_at.desc()"
    ))

    previous_status = db.Column(db.String(32), nullable=True)
    new_status = db.Column(db.String(32), nullable=False)

    # Seconds spent in the previous status before this transition.
    execution_time = db.Column(db.Float, nullable=True)

    recommendation_id = db.Column(
        db.Integer, db.ForeignKey("recommendations.id"), nullable=True
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "activityId": self.activity_id,
            "previousStatus": self.previous_status,
            "newStatus": self.new_status,
            "executionTime": self.execution_time,
            "recommendationId": self.recommendation_id,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return (
            f"<ActivityHistory {self.id} activity={self.activity_id!r} "
            f"{self.previous_status!r}→{self.new_status!r}>"
        )
