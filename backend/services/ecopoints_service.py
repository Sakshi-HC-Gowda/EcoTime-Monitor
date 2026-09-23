"""
EcoPoints Service
=================
Handles EcoPoint awarding, duplicate prevention,
sustainability score updates, and streak tracking.

Important:
EcoPoints must always be linked to a legitimate
EcoTime activity/recommendation event.
"""

from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

from sqlalchemy.exc import IntegrityError

from extensions import db
from models import (
    Activity,
    ActivityHistory,
    EcoPointTransaction,
    SustainabilityScore,
    Badge,
)


# Initial scoring rules
POINT_RULES = {
    "follow_green_window": 10,
    "delay_flexible_activity": 5,
    "complete_green_window": 10,
}


def award_points(
    user_id: str,
    event_type: str,
    event_id: str,
    points: int,
    activity_id: str | None = None,
    recommendation_id: int | None = None,
    organization_id: str | None = None,
    description: str | None = None,
) -> EcoPointTransaction | None:
    """
    Award EcoPoints for a legitimate EcoTime event.

    Returns:
        EcoPointTransaction if points are awarded.
        None if the same event has already been rewarded.
    """

    if points <= 0:
        raise ValueError("Points must be greater than zero.")

    # ---------------------------------------------------------
    # 1. Validate the source event
    # ---------------------------------------------------------

    if activity_id is None:
        raise ValueError(
            "EcoPoints must be linked to a legitimate activity event."
        )

    activity = db.session.get(Activity, activity_id)

    if activity is None:
        raise ValueError(
            f"Activity '{activity_id}' does not exist."
        )

    # ---------------------------------------------------------
    # 2. Verify that the activity has a logged lifecycle event
    # ---------------------------------------------------------

    history_event = (
        ActivityHistory.query
        .filter_by(activity_id=activity_id)
        .first()
    )

    if history_event is None:
        raise ValueError(
            f"No legitimate activity history found for '{activity_id}'."
        )

    # ---------------------------------------------------------
    # 3. Prevent duplicate rewards
    # ---------------------------------------------------------

    existing = (
        EcoPointTransaction.query
        .filter_by(
            user_id=user_id,
            event_type=event_type,
            event_id=event_id,
        )
        .first()
    )

    if existing:
        return None

    # ---------------------------------------------------------
    # 4. Create immutable transaction
    # ---------------------------------------------------------

    transaction = EcoPointTransaction(
        id=str(uuid4()),
        user_id=user_id,
        organization_id=organization_id,
        activity_id=activity_id,
        recommendation_id=recommendation_id,
        event_type=event_type,
        event_id=event_id,
        points=points,
        description=description,
    )

    db.session.add(transaction)

    try:
        db.session.flush()
    except IntegrityError:
        db.session.rollback()
        return None

    # ---------------------------------------------------------
    # 5. Update sustainability score
    # ---------------------------------------------------------

    score = (
        SustainabilityScore.query
        .filter_by(user_id=user_id)
        .first()
    )

    if score is None:
        score = SustainabilityScore(
            id=str(uuid4()),
            user_id=user_id,
            organization_id=organization_id,
            score=0.0,
            total_points=0,
            current_streak=0,
            longest_streak=0,
        )
        db.session.add(score)

    score.total_points += points
    score.score += points

    # ---------------------------------------------------------
    # 6. Update sustainability streak
    # ---------------------------------------------------------

    today = date.today()

    if score.last_sustainable_date is None:
        score.current_streak = 1

    elif score.last_sustainable_date == today:
        # Already received sustainable activity today.
        pass

    elif score.last_sustainable_date == today - timedelta(days=1):
        score.current_streak += 1

    else:
        score.current_streak = 1

    if score.current_streak > score.longest_streak:
        score.longest_streak = score.current_streak

    score.last_sustainable_date = today

    award_badges(
    user_id=user_id,
    organization_id=organization_id,
)
    db.session.commit()
    return transaction
def award_badges(user_id: str, organization_id: str | None = None) -> list[Badge]:
    """
    Award badges based on the user's sustainability progress.
    Badges are awarded only once per user.
    """

    score = (
        SustainabilityScore.query
        .filter_by(user_id=user_id)
        .first()
    )

    if score is None:
        return []

    badges = []

    badge_rules = [
        (
            "first_green_action",
            "Green Starter",
            "Completed your first sustainable activity.",
            score.total_points >= 10,
        ),
        (
            "eco_50",
            "Eco Champion",
            "Earned 50 EcoPoints.",
            score.total_points >= 50,
        ),
        (
            "eco_100",
            "Eco Hero",
            "Earned 100 EcoPoints.",
            score.total_points >= 100,
        ),
        (
            "streak_3",
            "3-Day Green Streak",
            "Maintained a sustainable activity streak for 3 days.",
            score.current_streak >= 3,
        ),
        (
            "streak_7",
            "7-Day Green Streak",
            "Maintained a sustainable activity streak for 7 days.",
            score.current_streak >= 7,
        ),
    ]

    for badge_type, name, description, condition in badge_rules:
        if not condition:
            continue

        existing = (
            Badge.query
            .filter_by(
                user_id=user_id,
                badge_type=badge_type,
            )
            .first()
        )

        if existing:
            continue

        badge = Badge(
            id=str(uuid4()),
            user_id=user_id,
            organization_id=organization_id,
            badge_type=badge_type,
            name=name,
            description=description,
        )

        db.session.add(badge)
        badges.append(badge)

    if badges:
        db.session.commit()

    return badges


def get_user_transactions(user_id: str) -> list[dict]:
    """
    Return the EcoPoint transaction history for a user.
    """

    transactions = (
        EcoPointTransaction.query
        .filter_by(user_id=user_id)
        .order_by(EcoPointTransaction.created_at.desc())
        .all()
    )

    return [transaction.to_dict() for transaction in transactions]


def get_user_score(user_id: str) -> dict | None:
    """
    Return the current sustainability score for a user.
    """

    score = (
        SustainabilityScore.query
        .filter_by(user_id=user_id)
        .first()
    )

    if score is None:
        return None

    return score.to_dict()