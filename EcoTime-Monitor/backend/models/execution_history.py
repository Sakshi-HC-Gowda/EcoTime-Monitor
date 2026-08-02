"""
Execution History Model
=======================
Records actual execution outcomes per activity — distinct from ActivityHistory
which tracks status transitions only.
"""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class ExecutionHistory(db.Model):
    __tablename__ = "execution_history"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    activity_id = db.Column(
        db.String(64), db.ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    activity = db.relationship("Activity", backref=db.backref(
        "execution_records", cascade="all, delete-orphan", lazy="select",
        order_by="ExecutionHistory.created_at.desc()",
    ))

    previous_status = db.Column(db.String(32), nullable=True)
    new_status = db.Column(db.String(32), nullable=False, index=True)
    actual_start = db.Column(db.DateTime(timezone=True), nullable=True)
    actual_end = db.Column(db.DateTime(timezone=True), nullable=True)
    actual_energy_kwh = db.Column(db.Float, nullable=True)
    actual_carbon_grams = db.Column(db.Float, nullable=True)
    outcome = db.Column(db.String(64), nullable=True)
    missed_schedule = db.Column(db.Boolean, nullable=False, default=False)

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "activityId": self.activity_id,
            "previousStatus": self.previous_status,
            "newStatus": self.new_status,
            "actualStart": self.actual_start.isoformat() if self.actual_start else None,
            "actualEnd": self.actual_end.isoformat() if self.actual_end else None,
            "actualEnergyKwh": self.actual_energy_kwh,
            "actualCarbonGrams": self.actual_carbon_grams,
            "outcome": self.outcome,
            "missedSchedule": self.missed_schedule,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return (
            f"<ExecutionHistory {self.id} activity={self.activity_id!r} "
            f"{self.previous_status!r}→{self.new_status!r}>"
        )
