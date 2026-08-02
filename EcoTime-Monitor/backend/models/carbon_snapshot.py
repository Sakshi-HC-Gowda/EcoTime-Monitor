"""
Carbon Snapshot Model
=======================
Persists a point-in-time carbon intensity reading (plus its short-term
forecast) whenever the frontend fetches /api/carbon. The live data still
comes from carbon_service (ElectricityMaps / simulation), but every
reading is now also written here so "Carbon intensity" is an actual
queryable database record, not just an ephemeral API response.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from extensions import db


class CarbonSnapshot(db.Model):
    __tablename__ = "carbon_snapshots"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # Nullable: most snapshots come from the zone-level /api/carbon poll and
    # aren't tied to one activity. When a snapshot IS taken in the context of
    # scoring/scheduling a specific activity (see eco-score route), it's linked.
    activity_id = db.Column(
        db.String(64), db.ForeignKey("activities.id"), nullable=True, index=True
    )
    activity = db.relationship("Activity", backref=db.backref(
        "carbon_snapshots", cascade="all, delete-orphan", lazy="select"
    ))

    region = db.Column(db.String(32), nullable=False, index=True)
    carbon_intensity = db.Column(db.Float, nullable=False)   # gCO2/kWh
    forecast_json = db.Column(db.Text, nullable=True)        # JSON-encoded forecast points
    source = db.Column(db.String(32), nullable=False, default="simulation")

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    __table_args__ = (
        db.CheckConstraint("carbon_intensity >= 0", name="ck_carbon_intensity_nonneg"),
    )

    def to_dict(self) -> dict:
        forecast = []
        if self.forecast_json:
            try:
                forecast = json.loads(self.forecast_json)
            except (ValueError, TypeError):
                forecast = []
        return {
            "id": self.id,
            "activityId": self.activity_id,
            "region": self.region,
            "carbonIntensity": self.carbon_intensity,
            "forecast": forecast,
            "source": self.source,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<CarbonSnapshot region={self.region!r} intensity={self.carbon_intensity}>"
