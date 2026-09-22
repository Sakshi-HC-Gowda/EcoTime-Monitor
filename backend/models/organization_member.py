from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class OrganizationMember(db.Model):
    __tablename__ = "organization_members"

    id = db.Column(db.Integer, primary_key=True)
    organization_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    role_id = db.Column(db.Integer, db.ForeignKey("roles.id"), nullable=False, index=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        db.UniqueConstraint("organization_id", "user_id", name="uq_org_member"),
    )

    organization = db.relationship("Organization", back_populates="organization_members")
    user = db.relationship("User", back_populates="organization_memberships")
    role = db.relationship("Role", back_populates="organization_members")

    def to_dict(self):
        return {
            "id": self.id,
            "organizationId": self.organization_id,
            "userId": self.user_id,
            "roleId": self.role_id,
            "role": self.role.to_dict() if self.role else None,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
