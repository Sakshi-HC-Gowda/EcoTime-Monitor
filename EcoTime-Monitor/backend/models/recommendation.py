"""
Recommendation Model
=====================
SQLAlchemy model for AI-generated scheduling / execution recommendations.

Every time the EcoScore engine or the Scheduler produces a suggestion
("Execute Now", "Delay Execution", "Schedule Automatically", ...), it is
persisted here so the Analytics module can report on green-recommendations
followed vs. ignored, and the Dashboard can show the latest advice.
"""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class Recommendation(db.Model):
    """
    A single recommendation produced by the optimization engine.

    Status lifecycle:
        pending → accepted   (user/scheduler acted on it)
                → rejected   (user dismissed it)
                → expired    (window passed without action)
    """

    __tablename__ = "recommendations"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # Nullable: some recommendations (e.g. a multi-task scheduling run)
    # aren't tied to a single activity.
    activity_id = db.Column(
        db.String(64), db.ForeignKey("activities.id"), nullable=True, index=True
    )
    activity = db.relationship("Activity", backref=db.backref(
        "recommendations", cascade="all, delete-orphan", lazy="select"
    ))

    text = db.Column(db.String(500), nullable=False)
    reason = db.Column(db.String(500), nullable=True)

    expected_carbon_saving = db.Column(db.Float, nullable=True)   # grams CO2e
    expected_energy_saving = db.Column(db.Float, nullable=True)   # kWh
    recommended_start_time = db.Column(db.DateTime(timezone=True), nullable=True, index=True)
    eco_score = db.Column(db.Float, nullable=True)
    forecast_used = db.Column(db.String(255), nullable=True)

    status = db.Column(
        db.Enum("pending", "accepted", "rejected", "expired", name="recommendation_status_enum"),
        nullable=False,
        default="pending",
        index=True,
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "activityId": self.activity_id,
            "text": self.text,
            "reason": self.reason,
            "expectedCarbonSaving": self.expected_carbon_saving,
            "expectedEnergySaving": self.expected_energy_saving,
            "recommendedStartTime": (
                self.recommended_start_time.isoformat() if self.recommended_start_time else None
            ),
            "ecoScore": self.eco_score,
            "forecastUsed": self.forecast_used,
            "status": self.status,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<Recommendation {self.id} status={self.status!r} activity={self.activity_id!r}>"
