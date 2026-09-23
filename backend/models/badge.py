"""
Badge Model
===========
Stores badges earned by users through legitimate sustainability actions.
"""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class Badge(db.Model):
    """
    Represents a badge earned by a user.

    A badge should only be created by the EcoPoints service after
    the corresponding legitimate condition has been satisfied.
    """

    __tablename__ = "badges"

    id = db.Column(db.String(64), primary_key=True)

    user_id = db.Column(
        db.String(64),
        nullable=False,
        index=True,
    )

    organization_id = db.Column(
        db.String(64),
        nullable=True,
        index=True,
    )

    # Stable identifier for the type of badge.
    # Examples:
    #   green_starter
    #   green_streak
    #   eco_champion

    badge_type = db.Column(
        db.String(64),
        nullable=False,
    )

    name = db.Column(
        db.String(100),
        nullable=False,
    )

    description = db.Column(
        db.String(255),
        nullable=True,
    )

    earned_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Prevent the same badge type from being awarded repeatedly
    # to the same user.
    __table_args__ = (
        db.UniqueConstraint(
            "user_id",
            "badge_type",
            name="uq_badge_user_type",
        ),
    )

    def to_dict(self) -> dict:
        """Return a JSON-serialisable representation."""
        return {
            "id": self.id,
            "userId": self.user_id,
            "organizationId": self.organization_id,
            "badgeType": self.badge_type,
            "name": self.name,
            "description": self.description,
            "earnedAt": (
                self.earned_at.isoformat()
                if self.earned_at
                else None
            ),
        }

    def __repr__(self) -> str:
        return (
            f"<Badge "
            f"user_id={self.user_id!r} "
            f"badge_type={self.badge_type!r}>"
        )