from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class Organization(db.Model):
    __tablename__ = "organizations"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, unique=True, index=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    users = db.relationship("User", back_populates="organization", cascade="all, delete-orphan")
    organization_members = db.relationship(
        "OrganizationMember",
        back_populates="organization",
        cascade="all, delete-orphan",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
