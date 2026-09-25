"""
EcoPoints Service
=================
Handles EcoPoint awarding, duplicate prevention,
daily anti-gaming protection, sustainability score
updates, and streak tracking.

Important:
EcoPoints must always be linked to a legitimate
EcoTime activity/recommendation event.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
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

from config.scoring_rules import (
    get_points,
    get_anti_gaming_rule,
)


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
        None if the same event has already been rewarded
        or the daily EcoPoints cap has been reached.
    """

    expected_points = get_points(event_type)

    if points != expected_points:
        raise ValueError(
            f"Invalid points for event type '{event_type}'. "
            f"Expected {expected_points}."
        )

    # ---------------------------------------------------------
    # 1. Validate the source activity
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
    # 2. Verify the exact ActivityHistory event
    # ---------------------------------------------------------

    try:
        history_event_id = int(event_id)
    except (TypeError, ValueError):
        raise ValueError(
            "eventId must reference a valid ActivityHistory ID."
        )

    history_event = (
        ActivityHistory.query
        .filter_by(
            id=history_event_id,
            activity_id=activity_id,
        )
        .first()
    )

    if history_event is None:
        raise ValueError(
            f"Activity history event '{event_id}' does not exist "
            f"for activity '{activity_id}'."
        )

        # ---------------------------------------------------------
    # 3. Prevent duplicate and near-duplicate rewards
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

    # Prevent repeated scoring of near-identical activity events
    # within the configured anti-gaming time window.
    near_duplicate_window = get_anti_gaming_rule(
        "near_duplicate_window_minutes"
    )

    near_duplicate_cutoff = (
        history_event.created_at
        - timedelta(minutes=near_duplicate_window)
    )

    recent_history = (
        ActivityHistory.query
        .filter(
            ActivityHistory.activity_id == activity_id,
            ActivityHistory.id != history_event.id,
            ActivityHistory.created_at >= near_duplicate_cutoff,
            ActivityHistory.created_at <= history_event.created_at,
        )
        .order_by(ActivityHistory.created_at.desc())
        .first()
    )

    if recent_history is not None:
        recent_transaction = (
            EcoPointTransaction.query
            .filter(
                EcoPointTransaction.user_id == user_id,
                EcoPointTransaction.event_type == event_type,
                EcoPointTransaction.event_id == str(recent_history.id),
            )
            .first()
        )

        if recent_transaction is not None:
            return None

       # ---------------------------------------------------------
    # 4. Apply daily and weekly EcoPoints caps
    # ---------------------------------------------------------

    now = datetime.now(timezone.utc)

    # -------------------------
    # Daily cap
    # -------------------------

    daily_cap = get_anti_gaming_rule("daily_points_cap")

    start_of_day = datetime(
        now.year,
        now.month,
        now.day,
        tzinfo=timezone.utc,
    )

    daily_points = (
        db.session.query(
            db.func.coalesce(
                db.func.sum(EcoPointTransaction.points),
                0,
            )
        )
        .filter(
            EcoPointTransaction.user_id == user_id,
            EcoPointTransaction.created_at >= start_of_day,
        )
        .scalar()
    )

    if daily_points + points > daily_cap:
        return None


    # -------------------------
    # Weekly cap
    # -------------------------

    weekly_cap = get_anti_gaming_rule("weekly_points_cap")

    # Monday 00:00 UTC is the beginning of the current week.
    start_of_week = (
        start_of_day
        - timedelta(days=start_of_day.weekday())
    )

    weekly_points = (
        db.session.query(
            db.func.coalesce(
                db.func.sum(EcoPointTransaction.points),
                0,
            )
        )
        .filter(
            EcoPointTransaction.user_id == user_id,
            EcoPointTransaction.created_at >= start_of_week,
        )
        .scalar()
    )

    if weekly_points + points > weekly_cap:
        return None

    # ---------------------------------------------------------
    # 5. Create immutable transaction
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
    # 6. Update sustainability score
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
            leaderboard_opt_in=False,
        )

        db.session.add(score)

    score.total_points += points
    score.score += points

    # ---------------------------------------------------------
    # 7. Update sustainability streak
    # ---------------------------------------------------------

    today = date.today()

    if score.last_sustainable_date is None:
        score.current_streak = 1

    elif score.last_sustainable_date == today:
        # Already received a sustainable activity today.
        pass

    elif score.last_sustainable_date == today - timedelta(days=1):
        score.current_streak += 1

    else:
        score.current_streak = 1

    if score.current_streak > score.longest_streak:
        score.longest_streak = score.current_streak

    score.last_sustainable_date = today

    # ---------------------------------------------------------
    # 8. Award eligible badges
    # ---------------------------------------------------------

    award_badges(
        user_id=user_id,
        organization_id=organization_id,
    )

    db.session.flush()

    return transaction


def award_badges(
    user_id: str,
    organization_id: str | None = None,
) -> list[Badge]:
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
        db.session.flush()

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

    return [
        transaction.to_dict()
        for transaction in transactions
    ]


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
