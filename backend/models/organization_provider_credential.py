"""Encrypted organization-scoped provider credentials."""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class OrganizationProviderCredential(db.Model):
    __tablename__ = "organization_provider_credentials"

    id = db.Column(db.Integer, primary_key=True)
    organization_id = db.Column(
        db.Integer,
        db.ForeignKey("organizations.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    provider = db.Column(db.String(64), nullable=False)
    encrypted_token = db.Column(db.Text, nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
