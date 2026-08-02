"""
EcoTime Database Models Package
================================
Exports all SQLAlchemy models so app.py can call db.create_all()
after a single import.
"""

from .activity import Activity
from .recommendation import Recommendation
from .activity_history import ActivityHistory
from .workload_profile import WorkloadProfile
from .carbon_snapshot import CarbonSnapshot
from .current_status import CurrentStatus
from .system_setting import SystemSetting
from .schedule_slot import ScheduleSlot
from .execution_history import ExecutionHistory
from .analytics_snapshot import AnalyticsSnapshot
from .carbon_forecast import CarbonForecast
from .notification import Notification
from .audit_log import AuditLog

__all__ = [
    "Activity",
    "Recommendation",
    "ActivityHistory",
    "WorkloadProfile",
    "CarbonSnapshot",
    "CurrentStatus",
    "SystemSetting",
    "ScheduleSlot",
    "ExecutionHistory",
    "AnalyticsSnapshot",
    "CarbonForecast",
    "Notification",
    "AuditLog",
]
