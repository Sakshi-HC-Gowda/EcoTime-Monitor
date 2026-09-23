import sys
from pathlib import Path

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
from services.ecopoints_service import award_points, POINT_RULES


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

        return activity.id


def test_point_rules(app):
    """Verify the configured EcoPoint scoring rules."""

    with app.app_context():
        assert POINT_RULES["follow_green_window"] == 10
        assert POINT_RULES["delay_flexible_activity"] == 5
        assert POINT_RULES["complete_green_window"] == 10


def test_award_points(app, activity):
    """Verify points are awarded for a legitimate activity event."""

    with app.app_context():
        transaction = award_points(
            user_id="test-user",
            event_type="complete_green_window",
            event_id="event-001",
            points=POINT_RULES["complete_green_window"],
            activity_id=activity,
        )

        assert transaction is not None
        assert transaction.points == 10
        assert transaction.user_id == "test-user"
        assert transaction.activity_id == activity


def test_duplicate_event_prevention(app, activity):
    """The same event must not receive points twice."""

    with app.app_context():
        first = award_points(
            user_id="test-user",
            event_type="complete_green_window",
            event_id="event-duplicate",
            points=POINT_RULES["complete_green_window"],
            activity_id=activity,
        )

        second = award_points(
            user_id="test-user",
            event_type="complete_green_window",
            event_id="event-duplicate",
            points=POINT_RULES["complete_green_window"],
            activity_id=activity,
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
                event_id="event-invalid",
                points=POINT_RULES["complete_green_window"],
                activity_id="does-not-exist",
            )
def test_score_reconciliation(app, activity):
    """Transaction ledger total must match the sustainability score."""

    with app.app_context():
        award_points(
            user_id="reconcile-user",
            event_type="complete_green_window",
            event_id="reconcile-event-001",
            points=POINT_RULES["complete_green_window"],
            activity_id=activity,
        )

        award_points(
            user_id="reconcile-user",
            event_type="delay_flexible_activity",
            event_id="reconcile-event-002",
            points=POINT_RULES["delay_flexible_activity"],
            activity_id=activity,
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