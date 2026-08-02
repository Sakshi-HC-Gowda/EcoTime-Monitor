"""
Carbon Forecast Model
=====================
Persisted carbon intensity forecast points with source/version metadata.
"""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class CarbonForecast(db.Model):
    __tablename__ = "carbon_forecasts"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    grid_zone = db.Column(db.String(32), nullable=False, index=True)
    timestamp = db.Column(db.DateTime(timezone=True), nullable=False, index=True)
    carbon_intensity = db.Column(db.Float, nullable=False)
    forecast_source = db.Column(db.String(64), nullable=False, default="simulation")
    forecast_version = db.Column(db.String(32), nullable=False, default="1.0")
    fetched_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    activity_id = db.Column(
        db.String(64), db.ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    activity = db.relationship("Activity", backref=db.backref(
        "carbon_forecasts", cascade="all, delete-orphan", lazy="select",
    ))

    __table_args__ = (
        db.UniqueConstraint(
            "grid_zone", "timestamp", "forecast_source", "activity_id",
            name="uq_carbon_forecast_zone_ts_source_activity",
        ),
        db.CheckConstraint("carbon_intensity >= 0", name="ck_forecast_intensity_nonneg"),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "gridZone": self.grid_zone,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "carbonIntensity": self.carbon_intensity,
            "forecastSource": self.forecast_source,
            "forecastVersion": self.forecast_version,
            "fetchedAt": self.fetched_at.isoformat() if self.fetched_at else None,
            "activityId": self.activity_id,
        }

    def __repr__(self) -> str:
        return f"<CarbonForecast zone={self.grid_zone!r} ts={self.timestamp!r}>"
