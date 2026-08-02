"""
Workload Profile Model
========================
Stores an estimated resource-workload profile for each activity at the
time it's created: CPU usage estimate, workload level/category, and a
"prediction score" (how confidently the scheduler expects this workload
can be shifted to a greener window).

There's no real OS-level CPU monitor in this app, so cpu_usage/level/
category are derived heuristically from the activity's declared power
draw, duration and type — the same inputs the rest of the app already
uses for scheduling decisions.
"""

from __future__ import annotations

from datetime import datetime, timezone

from extensions import db


class WorkloadProfile(db.Model):
    __tablename__ = "workload_profiles"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    activity_id = db.Column(
        db.String(64), db.ForeignKey("activities.id"), nullable=False, index=True
    )
    activity = db.relationship("Activity", backref=db.backref(
        "workload_profiles", cascade="all, delete-orphan", lazy="select"
    ))

    cpu_usage = db.Column(db.Float, nullable=False)          # estimated %, 0-100
    memory_usage = db.Column(db.Float, nullable=False, default=0.0)  # estimated %, 0-100
    workload_level = db.Column(
        db.Enum("low", "medium", "high", name="workload_level_enum"), nullable=False
    )
    prediction_score = db.Column(db.Float, nullable=False)   # 0-100, shift-confidence
    prediction_time = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )  # when this prediction was generated (distinct from created_at = row insert time)
    workload_category = db.Column(
        db.Enum(
            "cpu-intensive", "network-intensive", "mixed",
            name="workload_category_enum",
        ),
        nullable=False,
    )

    __table_args__ = (
        db.CheckConstraint("cpu_usage >= 0 AND cpu_usage <= 100", name="ck_workload_cpu_range"),
        db.CheckConstraint("memory_usage >= 0 AND memory_usage <= 100", name="ck_workload_memory_range"),
        db.CheckConstraint("prediction_score >= 0 AND prediction_score <= 100", name="ck_workload_prediction_range"),
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "activityId": self.activity_id,
            "cpuUsage": self.cpu_usage,
            "memoryUsage": self.memory_usage,
            "workloadLevel": self.workload_level,
            "predictionScore": self.prediction_score,
            "predictionTime": self.prediction_time.isoformat() if self.prediction_time else None,
            "workloadCategory": self.workload_category,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<WorkloadProfile activity={self.activity_id!r} level={self.workload_level!r}>"
