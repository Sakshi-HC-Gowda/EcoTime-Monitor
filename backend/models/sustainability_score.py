"""
Sustainability Score Model
===========================
Stores the user's current sustainability score and streak information.
"""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class SustainabilityScore(db.Model):
    """
    Current sustainability metrics for a user.

    The score is derived from legitimate EcoPoint transactions
    and sustainability-related activity events.
    """

    __tablename__ = "sustainability_scores"

    id = db.Column(db.String(64), primary_key=True)

    user_id = db.Column(
        db.String(64),
        nullable=False,
        unique=True,
        index=True,
    )

    organization_id = db.Column(
        db.String(64),
        nullable=True,
        index=True,
    )

    # Current sustainability score.
    score = db.Column(
        db.Float,
        nullable=False,
        default=0.0,
    )

    # Total EcoPoints earned by the user.
    total_points = db.Column(
        db.Integer,
        nullable=False,
        default=0,
    )

    # Current consecutive sustainable activity streak.
    current_streak = db.Column(
        db.Integer,
        nullable=False,
        default=0,
    )

    # Longest streak achieved.
    longest_streak = db.Column(
        db.Integer,
        nullable=False,
        default=0,
    )

    # Last date on which a qualifying sustainable event occurred.
    last_sustainable_date = db.Column(
        db.Date,
        nullable=True,
    )

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

    def to_dict(self) -> dict:
        """Return a JSON-serialisable representation."""
        return {
            "id": self.id,
            "userId": self.user_id,
            "organizationId": self.organization_id,
            "score": self.score,
            "totalPoints": self.total_points,
            "currentStreak": self.current_streak,
            "longestStreak": self.longest_streak,
            "lastSustainableDate": (
                self.last_sustainable_date.isoformat()
                if self.last_sustainable_date
                else None
            ),
            "createdAt": (
                self.created_at.isoformat()
                if self.created_at
                else None
            ),
            "updatedAt": (
                self.updated_at.isoformat()
                if self.updated_at
                else None
            ),
        }

    def __repr__(self) -> str:
        return (
            f"<SustainabilityScore "
            f"user_id={self.user_id!r} "
            f"score={self.score} "
            f"streak={self.current_streak}>"
        )