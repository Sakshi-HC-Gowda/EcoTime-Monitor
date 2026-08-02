"""
Notification Model
==================
Persisted system notifications for activity lifecycle events.
"""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    activity_id = db.Column(
        db.String(64), db.ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    activity = db.relationship(
        "Activity",
        back_populates="notifications",
        lazy="select",
    )

    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    level = db.Column(db.String(32), nullable=False, default="info", index=True)
    is_read = db.Column(db.Boolean, nullable=False, default=False, index=True)

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
            "title": self.title,
            "message": self.message,
            "level": self.level,
            "isRead": self.is_read,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<Notification {self.id} level={self.level!r}>"
