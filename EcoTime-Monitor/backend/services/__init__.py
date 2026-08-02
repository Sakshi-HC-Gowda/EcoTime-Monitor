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
    get_workload_profile,
    get_current_status,
)
from .optimizer_service import (
    compute_eco_score,
    run_scheduler,
    schedule_all_windows,
    compute_savings_summary,
)
from .analytics_service import (
    get_analytics_summary,
    get_dashboard_summary,
    get_history,
    log_recommendation,
    list_recommendations,
    update_recommendation_status,
    get_status_summary,
    set_system_status,
    log_carbon_snapshot,
    get_carbon_snapshots,
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
    "get_workload_profile",
    "get_current_status",
    # Optimizer
    "compute_eco_score",
    "run_scheduler",
    "schedule_all_windows",
    "compute_savings_summary",
    # Analytics
    "get_analytics_summary",
    "get_dashboard_summary",
    "get_history",
    "log_recommendation",
    "list_recommendations",
    "update_recommendation_status",
    "get_status_summary",
    "set_system_status",
    "log_carbon_snapshot",
    "get_carbon_snapshots",
]
