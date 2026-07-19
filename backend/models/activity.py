"""
Activity Model
==============
SQLAlchemy model for digital tasks/activities managed by EcoTime.

Maps to the 'activities' table in SQLite (or PostgreSQL in production).
Mirrors the domain type defined in src/types/domain.ts for frontend compatibility.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app import db


class Activity(db.Model):
    """
    Represents a digital activity or task to be carbon-aware scheduled.

    Status state machine:
        idle → pending → scheduled → running → completed
             ↘         ↘           ↘ paused → running
               delayed              failed
    """

    __tablename__ = "activities"

    # -----------------------------------------------------------------------
    # Primary Key
    # -----------------------------------------------------------------------
    id = db.Column(db.String(64), primary_key=True)

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
        default="idle",
    )
    progress = db.Column(db.Float, default=0.0)              # 0-100
    assigned_window_id = db.Column(db.String(64), nullable=True)

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

    # -----------------------------------------------------------------------
    # Serialisation
    # -----------------------------------------------------------------------

    def to_dict(self) -> dict:
        """
        Convert model instance to a JSON-serialisable dict.
        Field names use camelCase to match the frontend domain type.
        """
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "activityType": self.activity_type,
            "duration": self.duration,
            "powerDraw": self.power_draw,
            "priorityScore": self.priority_score,
            "flexibilityScore": self.flexibility_score,
            "status": self.status,
            "progress": self.progress,
            "assignedWindowId": self.assigned_window_id,
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
            status=data.get("status", "idle"),
            progress=float(data.get("progress", 0)),
            assigned_window_id=data.get("assignedWindowId"),
        )

    def __repr__(self) -> str:
        return f"<Activity {self.id!r} name={self.name!r} status={self.status!r}>"
