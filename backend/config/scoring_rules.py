"""
EcoPoints Scoring Rules
=======================

Single source of truth for EcoPoints scoring rules.

All EcoPoints awarded by the EcoPoints service must use
the rules defined in this file.

Do not duplicate scoring values in services, routes,
frontend code, or seed data.
"""

# ---------------------------------------------------------------------------
# EcoPoints scoring rules
# ---------------------------------------------------------------------------

SCORING_RULES = {
    "follow_green_window": {
        "points": 10,
        "description": "Follow a green-window recommendation.",
    },
    "delay_flexible_activity": {
        "points": 5,
        "description": "Delay a flexible activity based on a sustainability recommendation.",
    },
    "complete_green_window": {
        "points": 10,
        "description": "Complete an activity during its recommended green window.",
    },
}


# ---------------------------------------------------------------------------
# Anti-gaming configuration
# ---------------------------------------------------------------------------
#
# The implementation plan requires daily/weekly limits and detection of
# duplicate or near-duplicate activities.
#
# These values are implementation parameters and can be tuned after pilot
# evaluation. They are NOT presented as empirical values from the plan.
#

ANTI_GAMING_RULES = {
    # Maximum EcoPoints that can be earned from qualifying activity events
    # during one calendar day.
    "daily_points_cap": 30,

    # Maximum EcoPoints that can be earned from qualifying activity events
    # during one calendar week.
    "weekly_points_cap": 100,

    # Activities created within this time window are checked for
    # near-duplicate characteristics.
    "near_duplicate_window_minutes": 10,
}


def get_points(event_type: str) -> int:
    """Return the documented points for an EcoPoints event type."""
    rule = SCORING_RULES.get(event_type)

    if rule is None:
        raise ValueError(f"Unknown EcoPoints event type: {event_type}")

    return rule["points"]


def get_anti_gaming_rule(rule_name: str):
    """Return an anti-gaming configuration value."""
    rule = ANTI_GAMING_RULES.get(rule_name)

    if rule is None:
        raise ValueError(f"Unknown anti-gaming rule: {rule_name}")

    return rule
