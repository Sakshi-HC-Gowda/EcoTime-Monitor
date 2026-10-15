"""
Activity Model
==============
SQLAlchemy model for digital tasks/activities managed by EcoTime.

Maps to the PostgreSQL ``activities`` table.
Mirrors the domain type defined in src/types/domain.ts for frontend compatibility.
"""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db
from optimization.carbon_calculator import calculate_energy_kwh


class Activity(db.Model):
    """
    Represents a digital activity or task to be carbon-aware scheduled.

    Status state machine:
        idle, pending, scheduled, running, paused, delayed, completed, failed

    Common lifecycle:
        pending → scheduled → running → completed
        scheduled ↔ paused
        running → failed
    """

    __tablename__ = "activities"

    # -----------------------------------------------------------------------
    # Primary Key
    # -----------------------------------------------------------------------
    id = db.Column(db.String(64), primary_key=True)
    organization_id = db.Column(
        db.Integer,
        db.ForeignKey("organizations.id"),
        nullable=False,
        index=True,
    )
    idempotency_key = db.Column(db.String(128), nullable=True)
    request_fingerprint = db.Column(db.String(64), nullable=True)
    __table_args__ = (
        db.Index(
            "uq_activities_org_idempotency_key",
            "organization_id",
            "idempotency_key",
            unique=True,
        ),
    )

    # -----------------------------------------------------------------------
    # Core Fields
    # -----------------------------------------------------------------------
    name = db.Column(db.String(255), nullable=False)
    type = db.Column(
        db.Enum("flexible", "non-flexible", name="task_flexibility"),
        nullable=False,
        default="flexible",
    )
    activity_type = db.Column(
        db.Enum(
            "file-upload",
            "cloud-backup",
            "software-update",
            "dataset-download",
            "ci-cd-pipeline",
            "batch-processing",
            name="activity_type_enum",
        ),
        nullable=False,
        default="batch-processing",
    )

    # -----------------------------------------------------------------------
    # Metrics
    # -----------------------------------------------------------------------
    duration = db.Column(db.Float, nullable=False)          # minutes
    power_draw = db.Column(db.Float, nullable=False)         # Watts
    priority_score = db.Column(db.Integer, default=50)       # 0-100
    flexibility_score = db.Column(db.Integer, default=70)    # 0-100

    # -----------------------------------------------------------------------
    # State
    # -----------------------------------------------------------------------
    status = db.Column(
        db.Enum(
            "idle", "pending", "running", "paused",
            "delayed", "scheduled", "completed", "failed",
            name="task_status_enum",
        ),
        nullable=False,
        default="pending",
    )
    progress = db.Column(db.Float, default=0.0)              # 0-100
    assigned_window_id = db.Column(db.String(64), nullable=True)
    earliest_start = db.Column(db.DateTime(timezone=True), nullable=True)
    deadline = db.Column(db.DateTime(timezone=True), nullable=True)

    # -----------------------------------------------------------------------
    # Timestamps
    # -----------------------------------------------------------------------
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

    history = db.relationship(
        "ActivityHistory",
        back_populates="activity",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ActivityHistory.created_at",
    )

    # -----------------------------------------------------------------------
    # Serialisation
    # -----------------------------------------------------------------------

    @staticmethod
    def _iso_utc(value: datetime | None) -> str | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()

    @staticmethod
    def _parse_datetime(value: str | datetime | None) -> datetime | None:
        if value is None:
            return None
        parsed = (
            value if isinstance(value, datetime)
            else datetime.fromisoformat(value.replace("Z", "+00:00"))
        )
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

    def to_dict(self) -> dict:
        """
        Convert model instance to a JSON-serialisable dict.
        Field names use camelCase to match the frontend domain type.
        """
        return {
            "id": self.id,
            "organizationId": self.organization_id,
            "name": self.name,
            "type": self.type,
            "activityType": self.activity_type,
            "duration": self.duration,
            "durationUnit": "minutes",
            "powerDraw": self.power_draw,
            "powerDrawUnit": "W",
            "durationBasis": "estimated_not_measured",
            "powerDrawBasis": "estimated_not_metered",
            "estimatedEnergyConsumption": calculate_energy_kwh(
                self.power_draw, self.duration
            ),
            "estimatedEnergyUnit": "kWh",
            "estimatedEnergyBasis": (
                "estimated_power_watts_times_estimated_duration_minutes"
            ),
            "carbonImpactUnit": "gCO2e",
            "carbonIntensityUnit": "gCO2e/kWh",
            "priorityScore": self.priority_score,
            "flexibilityScore": self.flexibility_score,
            "status": self.status,
            "progress": self.progress,
            "assignedWindowId": self.assigned_window_id,
            "earliestStart": self._iso_utc(self.earliest_start),
            "deadline": self._iso_utc(self.deadline),
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Activity":
        """
        Create an Activity instance from a camelCase request dict.
        """
        return cls(
            id=data["id"],
            name=data["name"],
            type=data["type"],
            activity_type=data.get("activityType", "batch-processing"),
            duration=float(data["duration"]),
            power_draw=float(data["powerDraw"]),
            priority_score=int(data.get("priorityScore", 50)),
            flexibility_score=int(data.get("flexibilityScore", 70)),
            status=data.get("status", "pending"),
            progress=float(data.get("progress", 0)),
            assigned_window_id=data.get("assignedWindowId"),
            earliest_start=cls._parse_datetime(data.get("earliestStart")),
            deadline=cls._parse_datetime(data.get("deadline")),
        )

    def __repr__(self) -> str:
        return f"<Activity {self.id!r} name={self.name!r} status={self.status!r}>"
