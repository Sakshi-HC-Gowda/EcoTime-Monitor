"""
EcoPoint Transaction Model
==========================
Immutable ledger of EcoPoints awarded for legitimate EcoTime events.
"""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class EcoPointTransaction(db.Model):
    """
    Records every EcoPoint award.

    Each transaction must be traceable to a real activity and/or
    recommendation event. Duplicate processing of the same event
    is prevented by a database-level unique constraint.
    """

    __tablename__ = "eco_point_transactions"

    # ------------------------------------------------------------------
    # Primary Key
    # ------------------------------------------------------------------

    id = db.Column(db.String(64), primary_key=True)

    # ------------------------------------------------------------------
    # Ownership
    # ------------------------------------------------------------------
    # These remain strings for now because the Organization/Auth module
    # is owned by another team member.

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

    # ------------------------------------------------------------------
    # Source Event
    # ------------------------------------------------------------------

    activity_id = db.Column(
        db.String(64),
        db.ForeignKey("activities.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    recommendation_id = db.Column(
        db.Integer,
        db.ForeignKey(
            "analytics_recommendations.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    # Type of legitimate event that caused the points.
    #
    # Examples:
    #   follow_green_window
    #   delay_flexible_activity
    #   complete_in_green_window
    #   streak_bonus
    #   company_target_bonus

    event_type = db.Column(
        db.String(64),
        nullable=False,
    )

    # Identifier of the source event.
    #
    # The service will ensure that this refers to a legitimate
    # activity/recommendation event before awarding points.

    event_id = db.Column(
        db.String(64),
        nullable=False,
    )

    # ------------------------------------------------------------------
    # Points
    # ------------------------------------------------------------------

    points = db.Column(
        db.Integer,
        nullable=False,
    )

    description = db.Column(
        db.String(255),
        nullable=True,
    )

    # ------------------------------------------------------------------
    # Timestamp
    # ------------------------------------------------------------------

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # ------------------------------------------------------------------
    # Constraints
    # ------------------------------------------------------------------

    __table_args__ = (
        db.UniqueConstraint(
            "user_id",
            "event_type",
            "event_id",
            name="uq_ecopoint_user_event",
        ),
    )

    def to_dict(self) -> dict:
        """Return a JSON-serialisable representation."""
        return {
            "id": self.id,
            "userId": self.user_id,
            "organizationId": self.organization_id,
            "activityId": self.activity_id,
            "recommendationId": self.recommendation_id,
            "eventType": self.event_type,
            "eventId": self.event_id,
            "points": self.points,
            "description": self.description,
            "createdAt": (
                self.created_at.isoformat()
                if self.created_at
                else None
            ),
        }

    def __repr__(self) -> str:
        return (
            f"<EcoPointTransaction "
            f"id={self.id!r} "
            f"user_id={self.user_id!r} "
            f"event_type={self.event_type!r} "
            f"points={self.points}>"
        )