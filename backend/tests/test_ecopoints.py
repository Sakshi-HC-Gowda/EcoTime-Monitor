import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone

import pytest

# Add backend directory to Python path
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app import create_app
from extensions import db
from models import (
    Activity,
    ActivityHistory,
    EcoPointTransaction,
    SustainabilityScore,
)
from services.ecopoints_service import award_points
from config.scoring_rules import SCORING_RULES, get_points


@pytest.fixture
def app():
    app = create_app()

    app.config.update(
        TESTING=True,
        SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
    )

    with app.app_context():
        db.drop_all()
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def activity(app):
    with app.app_context():
        activity = Activity(
            id="test-activity-001",
            name="Test Green Activity",
            type="flexible",
            activity_type="file-upload",
            duration=10,
            power_draw=50,
            priority_score=5,
            flexibility_score=0.8,
            status="completed",
            progress=100,
        )

        db.session.add(activity)
        db.session.flush()

        history = ActivityHistory(
            activity_id=activity.id,
            previous_status="running",
            new_status="completed",
        )

        db.session.add(history)
        db.session.commit()

        return {
            "activity_id": activity.id,
            "history_id": history.id,
        }


def test_point_rules(app):
    """Verify the configured EcoPoint scoring rules."""

    with app.app_context():
        assert SCORING_RULES["follow_green_window"]["points"] == 10
        assert SCORING_RULES["delay_flexible_activity"]["points"] == 5
        assert SCORING_RULES["complete_green_window"]["points"] == 10


def test_award_points(app, activity):
    """Verify points are awarded for a legitimate activity history event."""

    with app.app_context():
        transaction = award_points(
            user_id="test-user",
            event_type="complete_green_window",
            event_id=str(activity["history_id"]),
            points=get_points("complete_green_window"),
            activity_id=activity["activity_id"],
        )

        assert transaction is not None
        assert transaction.points == 10
        assert transaction.user_id == "test-user"
        assert transaction.activity_id == activity["activity_id"]
        assert transaction.event_id == str(activity["history_id"])


def test_duplicate_event_prevention(app, activity):
    """The same activity history event must not receive points twice."""

    with app.app_context():
        event_id = str(activity["history_id"])

        first = award_points(
            user_id="test-user",
            event_type="complete_green_window",
            event_id=event_id,
            points=get_points("complete_green_window"),
            activity_id=activity["activity_id"],
        )

        second = award_points(
            user_id="test-user",
            event_type="complete_green_window",
            event_id=event_id,
            points=get_points("complete_green_window"),
            activity_id=activity["activity_id"],
        )

        assert first is not None
        assert second is None


def test_invalid_activity_rejected(app):
    """Points must not be awarded for a non-existent activity."""

    with app.app_context():
        with pytest.raises(ValueError):
            award_points(
                user_id="test-user",
                event_type="complete_green_window",
                event_id="999999",
                points=get_points("complete_green_window"),
                activity_id="does-not-exist",
            )


def test_invalid_history_event_rejected(app, activity):
    """Points must not be awarded for a fake history event."""

    with app.app_context():
        with pytest.raises(ValueError):
            award_points(
                user_id="test-user",
                event_type="complete_green_window",
                event_id="999999",
                points=get_points("complete_green_window"),
                activity_id=activity["activity_id"],
            )


def test_score_reconciliation(app, activity):
    """Transaction ledger total must match the sustainability score."""

    with app.app_context():
        event_id = str(activity["history_id"])

        award_points(
            user_id="reconcile-user",
            event_type="complete_green_window",
            event_id=event_id,
            points=get_points("complete_green_window"),
            activity_id=activity["activity_id"],
        )

        # A second legitimate history event is required because
        # each EcoPoint transaction must reference a real event.
        second_history = ActivityHistory(
            activity_id=activity["activity_id"],
            previous_status="completed",
            new_status="scheduled",
        )

        db.session.add(second_history)
        db.session.commit()

        award_points(
            user_id="reconcile-user",
            event_type="delay_flexible_activity",
            event_id=str(second_history.id),
            points=get_points("delay_flexible_activity"),
            activity_id=activity["activity_id"],
        )

        transactions = (
            EcoPointTransaction.query
            .filter_by(user_id="reconcile-user")
            .all()
        )

        score = (
            SustainabilityScore.query
            .filter_by(user_id="reconcile-user")
            .first()
        )

        ledger_total = sum(
            transaction.points
            for transaction in transactions
        )

        assert ledger_total == score.total_points
        assert ledger_total == 15
def test_daily_points_cap(app, activity):
    """EcoPoints earned from activity events must respect the daily cap."""

    with app.app_context():
        user_id = "cap-test-user"

        history_ids = []

        for index in range(4):
            history = ActivityHistory(
                activity_id=activity["activity_id"],
                previous_status="running",
                new_status="completed",
            )

            db.session.add(history)
            db.session.flush()
            history_ids.append(history.id)

        db.session.commit()

        awarded_points = 0

        for history_id in history_ids:
            transaction = award_points(
                user_id=user_id,
                event_type="complete_green_window",
                event_id=str(history_id),
                points=get_points("complete_green_window"),
                activity_id=activity["activity_id"],
            )

            if transaction is not None:
                awarded_points += transaction.points

        assert awarded_points <= 30
def test_near_duplicate_activity_excluded(app, activity):
    """Near-duplicate activity events should not earn EcoPoints twice."""

    with app.app_context():
        user_id = "near-duplicate-user"

        first_history = ActivityHistory(
            activity_id=activity["activity_id"],
            previous_status="running",
            new_status="completed",
        )

        db.session.add(first_history)
        db.session.flush()

        second_history = ActivityHistory(
            activity_id=activity["activity_id"],
            previous_status="running",
            new_status="completed",
        )

        db.session.add(second_history)
        db.session.flush()

        db.session.commit()

        first_transaction = award_points(
            user_id=user_id,
            event_type="complete_green_window",
            event_id=str(first_history.id),
            points=get_points("complete_green_window"),
            activity_id=activity["activity_id"],
        )

        second_transaction = award_points(
            user_id=user_id,
            event_type="complete_green_window",
            event_id=str(second_history.id),
            points=get_points("complete_green_window"),
            activity_id=activity["activity_id"],
        )

        assert first_transaction is not None
        assert second_transaction is None
def test_weekly_points_cap(app, activity):
    """EcoPoints must respect the configured weekly points cap."""

    with app.app_context():
        user_id = "weekly-cap-user"

        # Create 10 legitimate history events.
        history_ids = []

        for _ in range(10):
            history = ActivityHistory(
                activity_id=activity["activity_id"],
                previous_status="running",
                new_status="completed",
            )

            db.session.add(history)
            db.session.flush()
            history_ids.append(history.id)

        db.session.commit()

        # Create 10 existing EcoPoint transactions distributed
        # across the current week.
        now = datetime.now(timezone.utc)

        for index, history_id in enumerate(history_ids):
            transaction = EcoPointTransaction(
                id=f"weekly-existing-{index}",
                user_id=user_id,
                activity_id=activity["activity_id"],
                event_type="complete_green_window",
                event_id=str(history_id),
                points=10,
                created_at=now - timedelta(days=index % 4),
            )

            db.session.add(transaction)

        db.session.commit()

        # Existing weekly total = 100 points.
        weekly_total = (
            db.session.query(
                db.func.coalesce(
                    db.func.sum(EcoPointTransaction.points),
                    0,
                )
            )
            .filter(
                EcoPointTransaction.user_id == user_id,
            )
            .scalar()
        )

        assert weekly_total == 100

        # Create one more legitimate history event.
        extra_history = ActivityHistory(
            activity_id=activity["activity_id"],
            previous_status="running",
            new_status="completed",
        )

        db.session.add(extra_history)
        db.session.commit()

        transaction = award_points(
            user_id=user_id,
            event_type="complete_green_window",
            event_id=str(extra_history.id),
            points=get_points("complete_green_window"),
            activity_id=activity["activity_id"],
        )

        # Weekly cap should reject the additional 10 points.
        assert transaction is None