"""Persistent simulation configuration used by optimizer routes."""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class SimulationConfig(db.Model):
    """Stores the one active simulation configuration for this deployment."""

    __tablename__ = "simulation_config"

    id = db.Column(db.Integer, primary_key=True)
    zone = db.Column(db.String(64), nullable=False)
    low_carbon_threshold = db.Column(db.Float, nullable=False)
    baseline_intensity = db.Column(db.Float, nullable=False)
    simulation_speed = db.Column(db.Integer, nullable=False)
    is_simulating = db.Column(db.Boolean, nullable=False)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        return {
            "zone": self.zone,
            "lowCarbonThreshold": self.low_carbon_threshold,
            "baselineIntensity": self.baseline_intensity,
            "simulationSpeed": self.simulation_speed,
            "isSimulating": self.is_simulating,
        }
