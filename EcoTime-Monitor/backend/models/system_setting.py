"""
System Setting Model
====================
Key-value persistence for session-level configuration that must survive
restarts: simulation config, system operating flag, ML training status.
"""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class SystemSetting(db.Model):
    __tablename__ = "system_settings"

    key = db.Column(db.String(64), primary_key=True)
    value_json = db.Column(db.Text, nullable=False, default="{}")
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "valueJson": self.value_json,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<SystemSetting {self.key!r}>"
