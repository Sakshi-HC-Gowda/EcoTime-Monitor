"""
Audit Log Model
===============
Immutable audit trail for API-level and service-level operations.
"""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    entity_type = db.Column(db.String(64), nullable=False, index=True)
    entity_id = db.Column(db.String(64), nullable=True, index=True)
    action = db.Column(db.String(64), nullable=False, index=True)
    details_json = db.Column(db.Text, nullable=True)
    actor = db.Column(db.String(64), nullable=False, default="system")

    activity_id = db.Column(
        db.String(64), db.ForeignKey("activities.id", ondelete="SET NULL"),
        nullable=True, index=True,
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
            "entityType": self.entity_type,
            "entityId": self.entity_id,
            "action": self.action,
            "detailsJson": self.details_json,
            "actor": self.actor,
            "activityId": self.activity_id,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<AuditLog {self.id} {self.action} {self.entity_type}={self.entity_id!r}>"
