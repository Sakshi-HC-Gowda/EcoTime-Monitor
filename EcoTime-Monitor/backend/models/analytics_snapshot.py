"""
Analytics Snapshot Model
========================
Point-in-time aggregate metrics persisted after significant events
(activity create/update, status change, recommendation accepted).
"""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class AnalyticsSnapshot(db.Model):
    __tablename__ = "analytics_snapshots"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    total_activities = db.Column(db.Integer, nullable=False, default=0)
    completed_activities = db.Column(db.Integer, nullable=False, default=0)
    pending_activities = db.Column(db.Integer, nullable=False, default=0)
    scheduled_activities = db.Column(db.Integer, nullable=False, default=0)
    running_activities = db.Column(db.Integer, nullable=False, default=0)
    cancelled_activities = db.Column(db.Integer, nullable=False, default=0)
    missed_activities = db.Column(db.Integer, nullable=False, default=0)

    total_carbon_saved_grams = db.Column(db.Float, nullable=False, default=0.0)
    total_energy_saved_kwh = db.Column(db.Float, nullable=False, default=0.0)
    average_eco_score = db.Column(db.Float, nullable=False, default=0.0)
    recommendation_accuracy = db.Column(db.Float, nullable=False, default=0.0)

    trigger_event = db.Column(db.String(64), nullable=True)
    activity_id = db.Column(
        db.String(64), db.ForeignKey("activities.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "totalActivities": self.total_activities,
            "completedActivities": self.completed_activities,
            "pendingActivities": self.pending_activities,
            "scheduledActivities": self.scheduled_activities,
            "runningActivities": self.running_activities,
            "cancelledActivities": self.cancelled_activities,
            "missedActivities": self.missed_activities,
            "totalCarbonSavedGrams": self.total_carbon_saved_grams,
            "totalEnergySavedKwh": self.total_energy_saved_kwh,
            "averageEcoScore": self.average_eco_score,
            "recommendationAccuracy": self.recommendation_accuracy,
            "triggerEvent": self.trigger_event,
            "activityId": self.activity_id,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<AnalyticsSnapshot {self.id} total={self.total_activities}>"
