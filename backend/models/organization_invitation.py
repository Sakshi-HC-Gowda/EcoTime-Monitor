from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class OrganizationInvitation(db.Model):
    __tablename__ = "organization_invitations"

    id = db.Column(db.String(64), primary_key=True)
    organization_id = db.Column(
        db.Integer,
        db.ForeignKey("organizations.id"),
        nullable=False,
        index=True,
    )
    created_by_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    token_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True)
    used_at = db.Column(db.DateTime(timezone=True), nullable=True)
    used_by_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=True,
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    organization = db.relationship("Organization")

    def is_active(self, now: datetime | None = None) -> bool:
        current = now or datetime.now(timezone.utc)
        expires_at = self.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return (
            self.revoked_at is None
            and self.used_at is None
            and expires_at > current
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "organizationId": self.organization_id,
            "expiresAt": self.expires_at.isoformat(),
            "revokedAt": self.revoked_at.isoformat() if self.revoked_at else None,
            "usedAt": self.used_at.isoformat() if self.used_at else None,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
