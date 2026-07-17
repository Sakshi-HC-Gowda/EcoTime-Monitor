"""
EcoTime Backend Services Package
"""

from .carbon_service import get_carbon_data, detect_green_windows, get_available_zones
from .activity_service import (
    create_activity,
    list_activities,
    get_activity,
    update_activity,
    delete_activity,
    bulk_update_activities,
)
from .optimizer_service import (
    compute_eco_score,
    run_scheduler,
    schedule_all_windows,
    compute_savings_summary,
)

__all__ = [
    # Carbon
    "get_carbon_data",
    "detect_green_windows",
    "get_available_zones",
    # Activities
    "create_activity",
    "list_activities",
    "get_activity",
    "update_activity",
    "delete_activity",
    "bulk_update_activities",
    # Optimizer
    "compute_eco_score",
    "run_scheduler",
    "schedule_all_windows",
    "compute_savings_summary",
]
