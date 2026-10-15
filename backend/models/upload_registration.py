"""Persisted, organization-owned registrations for executable file uploads."""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class UploadRegistration(db.Model):
    __tablename__ = "upload_registrations"

    id = db.Column(db.String(36), primary_key=True)
    organization_id = db.Column(
        db.Integer,
        db.ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    idempotency_key = db.Column(db.String(128), nullable=True)
    request_fingerprint = db.Column(db.String(64), nullable=True)
    __table_args__ = (
        db.Index(
            "uq_uploads_org_idempotency_key",
            "organization_id",
            "idempotency_key",
            unique=True,
        ),
    )
    activity_id = db.Column(
        db.String(64),
        db.ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    original_filename = db.Column(db.String(255), nullable=False)
    stored_filename = db.Column(db.String(320), nullable=False)
    content_type = db.Column(db.String(255), nullable=False)
    size_bytes = db.Column(db.BigInteger, nullable=False)
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)
    staging_path = db.Column(db.String(1024), nullable=False)
    final_path = db.Column(db.String(1024), nullable=False)
    scheduled_start_time = db.Column(db.DateTime(timezone=True), nullable=True)
    recommendation_reason = db.Column(db.Text, nullable=True)
    window_id = db.Column(db.String(64), nullable=True)
    execution_started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    error_message = db.Column(db.Text, nullable=True)
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

    activity = db.relationship("Activity")

    @staticmethod
    def _iso(value: datetime | None) -> str | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "activityId": self.activity_id,
            "filename": self.original_filename,
            "size": self.size_bytes,
            "contentType": self.content_type,
            "status": self.status,
            "scheduledStartTime": self._iso(self.scheduled_start_time),
            "recommendationReason": self.recommendation_reason,
            "windowId": self.window_id,
            "uploadedAt": self._iso(self.completed_at),
            "createdAt": self._iso(self.created_at),
            "updatedAt": self._iso(self.updated_at),
            "error": self.error_message,
            "downloadUrl": (
                f"/api/uploads/{self.id}/download"
                if self.status == "completed"
                else None
            ),
        }