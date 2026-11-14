"""
Phase 3 — Activity Completion Rewards Tests
============================================
Comprehensive tests for genuine activity lifecycle, exact Green Window
eligibility, concurrency, transaction rollback safety, and upload recovery.

Covers:
  1. Green Window completion within the window.
  2. Completion outside the assigned window.
  3. Completion without an assigned window.
  4. Missing or invalid Green Window timestamps.
  5. Invalid ActivityHistory transition.
  6. Duplicate completion exactly-once.
  7. Concurrent duplicate reward attempts.
  8. Reward insertion failure and transaction rollback/recovery.
  9. Daily and weekly cap concurrency.
  10. Upload recovery after database failure.
  11. Upload reward exactly-once behavior.
  12. Legacy ownerless activities.
  13. Existing badge and streak behavior with UTC date policy.
"""

from __future__ import annotations

import os
import sys
import threading
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pytest
from werkzeug.datastructures import FileStorage

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app import create_app
from extensions import db
from models.activity import Activity
from models.activity_history import ActivityHistory
from models.eco_point_transaction import EcoPointTransaction
from models.sustainability_score import SustainabilityScore
from models.user import User
from models.role import Role
from models.organization import Organization
from config.scoring_rules import get_points
from services.completion_reward_service import try_award_completion_points


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _detect_database_uri() -> str:
    """Return PostgreSQL test URI if available, otherwise fallback to SQLite."""
    if os.getenv("TEST_DATABASE_URL"):
        return os.environ["TEST_DATABASE_URL"]
    pg_uri = "postgresql://postgres:1234@localhost:5432/ecotime_test"
    try:
        import psycopg2
        conn = psycopg2.connect("postgresql://postgres:1234@localhost:5432/ecotime_test")
        conn.close()
        return pg_uri
    except Exception:
        pass
    return "sqlite:///:memory:"


@pytest.fixture
def app():
    uri = _detect_database_uri()
    old_test_url = os.environ.get("TEST_DATABASE_URL")
    os.environ["TEST_DATABASE_URL"] = uri
    try:
        app = create_app("testing")
        app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI=uri,
        )
        with app.app_context():
            db.session.remove()
            db.engine.dispose()
            db.drop_all()
            db.create_all()
            yield app
            db.session.remove()
            db.engine.dispose()
            db.drop_all()
    finally:
        if old_test_url is not None:
            os.environ["TEST_DATABASE_URL"] = old_test_url
        else:
            os.environ.pop("TEST_DATABASE_URL", None)


@pytest.fixture
def seed(app):
    """Create an organization, role, and users for testing."""
    org = Organization(name="Test Org")
    db.session.add(org)
    db.session.flush()

    role = Role(name="Employee")
    db.session.add(role)
    db.session.flush()

    admin_role = Role(name="Organization Admin")
    db.session.add(admin_role)
    db.session.flush()

    user1 = User(
        first_name="Alice",
        last_name="Test",
        email="alice@test.com",
        password_hash="unused",
        organization_id=org.id,
        role_id=role.id,
    )
    db.session.add(user1)
    db.session.flush()

    user2 = User(
        first_name="Bob",
        last_name="Test",
        email="bob@test.com",
        password_hash="unused",
        organization_id=org.id,
        role_id=role.id,
    )
    db.session.add(user2)
    db.session.flush()

    org2 = Organization(name="Other Org")
    db.session.add(org2)
    db.session.flush()

    user3 = User(
        first_name="Charlie",
        last_name="Other",
        email="charlie@other.com",
        password_hash="unused",
        organization_id=org2.id,
        role_id=role.id,
    )
    db.session.add(user3)
    db.session.flush()

    db.session.commit()
    return {
        "org_id": org.id,
        "org2_id": org2.id,
        "user1_id": user1.id,
        "user2_id": user2.id,
        "user3_id": user3.id,
        "role_id": role.id,
        "admin_role_id": admin_role.id,
    }


def _make_activity(
    seed,
    *,
    activity_id: str = "act-001",
    user_id: int | None = None,
    status: str = "completed",
    progress: float = 100.0,
    assigned_window_id: str | None = None,
    activity_type: str = "batch-processing",
    org_id: int | None = None,
    execution_start_time: datetime | None = None,
    duration: float = 10.0,
    scheduled_start_time: datetime | None = None,
    expected_end_time: datetime | None = None,
    task_type: str = "flexible",
) -> Activity:
    if user_id is None:
        user_id = seed["user1_id"]
    if org_id is None:
        org_id = seed["org_id"]
    activity = Activity(
        id=activity_id,
        organization_id=org_id,
        user_id=user_id,
        name="Test Activity",
        type=task_type,
        activity_type=activity_type,
        duration=duration,
        power_draw=100.0,
        priority_score=50,
        flexibility_score=70,
        status=status,
        progress=progress,
        assigned_window_id=assigned_window_id,
        execution_start_time=execution_start_time,
        scheduled_start_time=scheduled_start_time,
        expected_end_time=expected_end_time,
    )
    db.session.add(activity)
    db.session.flush()
    return activity


def _make_completed_with_history(
    seed,
    *,
    activity_id="act-001",
    assigned_window_id=None,
    user_id=None,
    scheduled_start_time=None,
    expected_end_time=None,
    activity_type="batch-processing",
    task_type="flexible",
):
    now = datetime.now(timezone.utc)
    if assigned_window_id is not None and scheduled_start_time is None and expected_end_time is None:
        # Default window covers current time [now - 10 min, now + 10 min]
        scheduled_start_time = now - timedelta(minutes=10)
        expected_end_time = now + timedelta(minutes=10)

    activity = _make_activity(
        seed,
        activity_id=activity_id,
        status="completed",
        assigned_window_id=assigned_window_id,
        user_id=user_id,
        activity_type=activity_type,
        scheduled_start_time=scheduled_start_time,
        expected_end_time=expected_end_time,
        task_type=task_type,
    )
    history = ActivityHistory(
        activity_id=activity.id,
        previous_status="running",
        new_status="completed",
    )
    db.session.add(history)
    db.session.flush()
    return activity, history


# ---------------------------------------------------------------------------
# 1. Green Window completion within the window
# ---------------------------------------------------------------------------

class TestGreenWindowWithinWindow:

    def test_completion_inside_window_awards_10_points(self, app, seed):
        """Activity completed within its assigned Green Window earns complete_green_window (10 pts)."""
        now = datetime.now(timezone.utc)
        activity, history = _make_completed_with_history(
            seed,
            assigned_window_id="gw-valid",
            scheduled_start_time=now - timedelta(minutes=15),
            expected_end_time=now + timedelta(minutes=15),
        )
        try_award_completion_points(activity, history)
        db.session.commit()

        txn = EcoPointTransaction.query.filter_by(
            activity_id=activity.id,
        ).first()
        assert txn is not None
        assert txn.points == 10
        assert txn.event_type == "complete_green_window"
        assert txn.user_id == str(seed["user1_id"])

        score = SustainabilityScore.query.filter_by(
            user_id=str(seed["user1_id"]),
        ).first()
        assert score is not None
        assert score.total_points == 10

    def test_simulated_advance_within_window_awards_10(self, app, seed):
        """advance_simulated_activities() awards 10 points when completing inside Green Window."""
        from services.activity_service import advance_simulated_activities

        now = datetime.now(timezone.utc)
        past = now - timedelta(minutes=60)
        # Window covers completion time [now - 30 min, now + 30 min]
        _make_activity(
            seed,
            activity_id="sim-within-001",
            status="running",
            progress=50.0,
            assigned_window_id="gw-sim-win",
            duration=10.0,
            execution_start_time=past,
            scheduled_start_time=now - timedelta(minutes=30),
            expected_end_time=now + timedelta(minutes=30),
        )
        db.session.commit()

        advance_simulated_activities(seed["org_id"])

        updated = db.session.get(Activity, "sim-within-001")
        assert updated.status == "completed"

        txn = EcoPointTransaction.query.filter_by(activity_id="sim-within-001").first()
        assert txn is not None
        assert txn.points == 10
        assert txn.event_type == "complete_green_window"

    def test_simulated_advance_outside_window_no_reward(self, app, seed):
        """advance_simulated_activities() does NOT award complete_green_window when completing outside."""
        from services.activity_service import advance_simulated_activities

        now = datetime.now(timezone.utc)
        past = now - timedelta(minutes=60)
        # Window ended 10 minutes ago
        _make_activity(
            seed,
            activity_id="sim-outside-001",
            status="running",
            progress=50.0,
            assigned_window_id="gw-sim-late",
            duration=10.0,
            execution_start_time=past,
            scheduled_start_time=now - timedelta(minutes=40),
            expected_end_time=now - timedelta(minutes=10),
        )
        db.session.commit()

        advance_simulated_activities(seed["org_id"])

        updated = db.session.get(Activity, "sim-outside-001")
        assert updated.status == "completed"

        txn = EcoPointTransaction.query.filter_by(activity_id="sim-outside-001").first()
        assert txn is None


# ---------------------------------------------------------------------------
# 2. Completion outside the assigned window
# ---------------------------------------------------------------------------

class TestGreenWindowOutsideWindow:

    def test_completion_after_window_disqualified(self, app, seed):
        """Activity completed AFTER the Green Window has ended must NOT receive the reward."""
        now = datetime.now(timezone.utc)
        # Window ended 10 minutes ago
        activity, history = _make_completed_with_history(
            seed,
            activity_id="outside-late-001",
            assigned_window_id="gw-expired",
            scheduled_start_time=now - timedelta(minutes=30),
            expected_end_time=now - timedelta(minutes=10),
        )
        try_award_completion_points(activity, history)
        db.session.commit()

        txn = EcoPointTransaction.query.filter_by(
            activity_id="outside-late-001",
        ).first()
        assert txn is None

    def test_completion_before_window_disqualified(self, app, seed):
        """Activity completed BEFORE the Green Window starts must NOT receive the reward."""
        now = datetime.now(timezone.utc)
        # Window starts 10 minutes in the future
        activity, history = _make_completed_with_history(
            seed,
            activity_id="outside-early-001",
            assigned_window_id="gw-future",
            scheduled_start_time=now + timedelta(minutes=10),
            expected_end_time=now + timedelta(minutes=30),
        )
        try_award_completion_points(activity, history)
        db.session.commit()

        txn = EcoPointTransaction.query.filter_by(
            activity_id="outside-early-001",
        ).first()
        assert txn is None


# ---------------------------------------------------------------------------
# 3. Completion without an assigned window
# ---------------------------------------------------------------------------

class TestCompletionWithoutWindow:

    def test_flexible_activity_without_window_awards_5_points(self, app, seed):
        """Flexible activity completed without a Green Window earns delay_flexible_activity (5 pts)."""
        activity, history = _make_completed_with_history(
            seed,
            activity_id="nowindow-flex-001",
            assigned_window_id=None,
            task_type="flexible",
        )
        try_award_completion_points(activity, history)
        db.session.commit()

        txn = EcoPointTransaction.query.filter_by(
            activity_id="nowindow-flex-001",
        ).first()
        assert txn is not None
        assert txn.points == 5
        assert txn.event_type == "delay_flexible_activity"

    def test_non_flexible_activity_without_window_no_points(self, app, seed):
        """Non-flexible activity completed without a Green Window earns 0 pts."""
        activity, history = _make_completed_with_history(
            seed,
            activity_id="nowindow-nonflex-001",
            assigned_window_id=None,
            task_type="non-flexible",
        )
        try_award_completion_points(activity, history)
        db.session.commit()

        txn = EcoPointTransaction.query.filter_by(
            activity_id="nowindow-nonflex-001",
        ).first()
        assert txn is None


# ---------------------------------------------------------------------------
# 4. Missing or invalid Green Window timestamps
# ---------------------------------------------------------------------------

class TestMissingOrInvalidWindow:

    def test_missing_window_timestamps_receives_no_reward(self, app, seed):
        """Activity with assigned_window_id but missing timestamps is disqualified."""
        activity = _make_activity(
            seed,
            activity_id="missing-bounds-001",
            assigned_window_id="gw-missing-timestamps",
            scheduled_start_time=None,
            expected_end_time=None,
        )
        history = ActivityHistory(
            activity_id=activity.id,
            previous_status="running",
            new_status="completed",
        )
        db.session.add(history)
        db.session.flush()

        try_award_completion_points(activity, history)
        db.session.commit()

        txn = EcoPointTransaction.query.filter_by(
            activity_id="missing-bounds-001",
        ).first()
        assert txn is None

    def test_invalid_inverted_window_timestamps_rejected(self, app, seed):
        """Activity with start >= end window timestamps is disqualified."""
        now = datetime.now(timezone.utc)
        activity = _make_activity(
            seed,
            activity_id="inverted-bounds-001",
            assigned_window_id="gw-inverted",
            scheduled_start_time=now + timedelta(minutes=10),
            expected_end_time=now - timedelta(minutes=10),
        )
        history = ActivityHistory(
            activity_id=activity.id,
            previous_status="running",
            new_status="completed",
        )
        db.session.add(history)
        db.session.flush()

        try_award_completion_points(activity, history)
        db.session.commit()

        txn = EcoPointTransaction.query.filter_by(
            activity_id="inverted-bounds-001",
        ).first()
        assert txn is None


# ---------------------------------------------------------------------------
# 5. Invalid ActivityHistory transition
# ---------------------------------------------------------------------------

class TestInvalidHistoryTransition:

    def test_non_running_previous_status_rejected(self, app, seed):
        """Transition from pending -> completed is rejected."""
        activity = _make_activity(seed, activity_id="invalid-prev-001")
        history = ActivityHistory(
            activity_id=activity.id,
            previous_status="pending",
            new_status="completed",
        )
        db.session.add(history)
        db.session.flush()

        try_award_completion_points(activity, history)
        db.session.commit()

        txn = EcoPointTransaction.query.filter_by(activity_id=activity.id).first()
        assert txn is None

    def test_non_completed_new_status_rejected(self, app, seed):
        """Transition from running -> failed is rejected."""
        activity = _make_activity(seed, activity_id="invalid-new-001", status="failed")
        history = ActivityHistory(
            activity_id=activity.id,
            previous_status="running",
            new_status="failed",
        )
        db.session.add(history)
        db.session.flush()

        try_award_completion_points(activity, history)
        db.session.commit()

        txn = EcoPointTransaction.query.filter_by(activity_id=activity.id).first()
        assert txn is None

    def test_activity_status_not_completed_rejected(self, app, seed):
        """If activity.status is not 'completed', reward is rejected."""
        activity = _make_activity(seed, activity_id="uncompleted-act-001", status="running")
        history = ActivityHistory(
            activity_id=activity.id,
            previous_status="running",
            new_status="completed",
        )
        db.session.add(history)
        db.session.flush()

        try_award_completion_points(activity, history)
        db.session.commit()

        txn = EcoPointTransaction.query.filter_by(activity_id=activity.id).first()
        assert txn is None


# ---------------------------------------------------------------------------
# 6. Duplicate completion exactly-once
# ---------------------------------------------------------------------------

class TestDuplicateCompletion:

    def test_duplicate_completion_awards_once(self, app, seed):
        activity, history = _make_completed_with_history(
            seed, activity_id="dup-once-001", assigned_window_id="gw-dup",
        )
        try_award_completion_points(activity, history)
        db.session.commit()

        # Second invocation with same history event
        try_award_completion_points(activity, history)
        db.session.commit()

        txns = EcoPointTransaction.query.filter_by(activity_id=activity.id).all()
        assert len(txns) == 1
        assert txns[0].points == 10


# ---------------------------------------------------------------------------
# 7. Concurrent duplicate reward attempts
# ---------------------------------------------------------------------------

class TestConcurrentDuplicateAttempts:

    def test_concurrent_attempts_with_different_history_ids_award_once(self, app, seed):
        """Two simultaneous concurrent attempts with different ActivityHistory IDs award exactly once."""
        activity, h1 = _make_completed_with_history(
            seed, activity_id="concurrent-dup-001", assigned_window_id="gw-conc",
        )
        h2 = ActivityHistory(
            activity_id=activity.id,
            previous_status="running",
            new_status="completed",
        )
        db.session.add(h2)
        db.session.commit()

        h1_id = h1.id
        h2_id = h2.id
        act_id = activity.id

        barrier = threading.Barrier(2)
        results = [None, None]
        errors = [None, None]

        def worker(idx, history_id):
            try:
                with app.app_context():
                    act = db.session.get(Activity, act_id)
                    hist = db.session.get(ActivityHistory, history_id)
                    # Synchronize worker threads to execute reward awarding simultaneously
                    barrier.wait(timeout=5)
                    try_award_completion_points(act, hist)
                    db.session.commit()
                    results[idx] = "success"
            except Exception as exc:
                errors[idx] = exc
            finally:
                with app.app_context():
                    db.session.remove()

        t1 = threading.Thread(target=worker, args=(0, h1_id))
        t2 = threading.Thread(target=worker, args=(1, h2_id))
        t1.start()
        t2.start()
        t1.join(timeout=10)
        t2.join(timeout=10)

        assert not t1.is_alive() and not t2.is_alive(), "Worker threads did not finish in time"
        assert all(err is None for err in errors), f"Unexpected worker error: {errors}"
        assert all(res == "success" for res in results)

        txns = EcoPointTransaction.query.filter_by(activity_id=act_id).all()
        assert len(txns) == 1
        assert txns[0].points == 10


# ---------------------------------------------------------------------------
# 8. Reward insertion failure and transaction rollback/recovery
# ---------------------------------------------------------------------------

class TestRewardFailureAndRollback:

    def test_savepoint_preserves_outer_transaction_on_integrity_error(self, app, seed):
        """IntegrityError during transaction insertion does not roll back the session."""
        activity, history = _make_completed_with_history(
            seed, activity_id="savepoint-test-001", assigned_window_id="gw-sp",
        )
        try_award_completion_points(activity, history)
        db.session.commit()

        # Try inserting again directly using award_points (which catches IntegrityError in savepoint)
        from services.ecopoints_service import award_points
        second_txn = award_points(
            user_id=str(seed["user1_id"]),
            event_type="complete_green_window",
            event_id=str(history.id),
            points=10,
            activity_id=activity.id,
        )
        assert second_txn is None
        # Outer transaction is still active and can commit without error
        db.session.commit()
        assert db.session.get(Activity, "savepoint-test-001").status == "completed"

    def test_unexpected_error_propagates_for_outer_rollback(self, app, seed):
        """Unexpected reward error re-raises so outer transaction rolls back cleanly."""
        activity, history = _make_completed_with_history(
            seed, activity_id="rollback-act-001", assigned_window_id="gw-rb",
        )
        with patch("services.completion_reward_service.award_points", side_effect=RuntimeError("DB drop")):
            with pytest.raises(RuntimeError):
                try_award_completion_points(activity, history)

        db.session.rollback()
        # Activity status remains uncommitted
        txn = EcoPointTransaction.query.filter_by(activity_id="rollback-act-001").first()
        assert txn is None


# ---------------------------------------------------------------------------
# 9. Daily and weekly cap concurrency
# ---------------------------------------------------------------------------

class TestCapConcurrency:

    def test_daily_cap_enforced_at_boundary(self, app, seed):
        """User cannot exceed 30 points daily cap (sequential baseline)."""
        from services.ecopoints_service import award_points
        user_id = str(seed["user1_id"])
        org_id = str(seed["org_id"])

        # Create 3 activities to reach 30 points (3 * 10 = 30)
        for i in range(3):
            act, hist = _make_completed_with_history(
                seed, activity_id=f"cap-act-{i}", assigned_window_id=f"gw-cap-{i}",
            )
            txn = award_points(
                user_id=user_id,
                event_type="complete_green_window",
                event_id=str(hist.id),
                points=10,
                activity_id=act.id,
                organization_id=org_id,
            )
            assert txn is not None
        db.session.commit()

        # 4th activity should be rejected by daily cap
        act4, hist4 = _make_completed_with_history(
            seed, activity_id="cap-act-4", assigned_window_id="gw-cap-4",
        )
        txn4 = award_points(
            user_id=user_id,
            event_type="complete_green_window",
            event_id=str(hist4.id),
            points=10,
            activity_id=act4.id,
            organization_id=org_id,
        )
        assert txn4 is None

        # Verify SustainabilityScore total is capped at 30
        score = SustainabilityScore.query.filter_by(user_id=user_id).first()
        assert score.total_points == 30

    def test_concurrent_daily_cap_never_exceeded(self, app, seed):
        """Multiple activities completing simultaneously near the daily limit cannot exceed 30 points."""
        if db.engine.dialect.name != "postgresql":
            pytest.skip("PostgreSQL required to verify row-locking concurrency behavior.")

        user_id = seed["user1_id"]
        org_id = seed["org_id"]
        now = datetime.now(timezone.utc)

        # Pre-seed user with 20 points (2 activities) toward the 30 daily cap
        for i in range(2):
            act = _make_activity(
                seed,
                activity_id=f"pre-daily-{i}",
                assigned_window_id=f"gw-pre-daily-{i}",
                scheduled_start_time=now - timedelta(minutes=10),
                expected_end_time=now + timedelta(minutes=10),
            )
            h = ActivityHistory(
                activity_id=act.id,
                previous_status="running",
                new_status="completed",
            )
            db.session.add(h)
            db.session.flush()
            try_award_completion_points(act, h)
        db.session.commit()

        initial_score = SustainabilityScore.query.filter_by(user_id=str(user_id)).first()
        assert initial_score.total_points == 20

        # Create 3 candidate activities near the boundary (20 points + 3 * 10 = 50 potential)
        candidate_specs = []
        for i in range(3):
            cand_id = f"cand-daily-{i}"
            act = _make_activity(
                seed,
                activity_id=cand_id,
                assigned_window_id=f"gw-cand-daily-{i}",
                scheduled_start_time=now - timedelta(minutes=10),
                expected_end_time=now + timedelta(minutes=10),
            )
            h = ActivityHistory(
                activity_id=cand_id,
                previous_status="running",
                new_status="completed",
            )
            db.session.add(h)
            db.session.flush()
            candidate_specs.append((cand_id, h.id))
        db.session.commit()

        num_workers = len(candidate_specs)
        barrier = threading.Barrier(num_workers)
        results = [None] * num_workers
        errors = [None] * num_workers

        def worker(idx, act_id, hist_id):
            try:
                with app.app_context():
                    act = db.session.get(Activity, act_id)
                    hist = db.session.get(ActivityHistory, hist_id)
                    barrier.wait(timeout=5)
                    try_award_completion_points(act, hist)
                    db.session.commit()
                    results[idx] = "success"
            except Exception as exc:
                errors[idx] = exc
            finally:
                with app.app_context():
                    db.session.remove()

        threads = [
            threading.Thread(target=worker, args=(i, cid, hid))
            for i, (cid, hid) in enumerate(candidate_specs)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert all(not t.is_alive() for t in threads), "Daily cap worker threads did not finish in time"
        assert all(err is None for err in errors), f"Worker thread encountered error: {errors}"
        assert all(res == "success" for res in results)

        # Final total points must be capped at exactly 30
        final_score = SustainabilityScore.query.filter_by(user_id=str(user_id)).first()
        assert final_score.total_points == 30

        # Verify sum of transaction points in database is exactly 30
        txns_sum = (
            db.session.query(db.func.sum(EcoPointTransaction.points))
            .filter_by(user_id=str(user_id))
            .scalar()
        )
        assert txns_sum == 30

        # Exactly 3 transactions total (2 pre-seeded + 1 winner from the 3 concurrent attempts)
        txns = EcoPointTransaction.query.filter_by(user_id=str(user_id)).all()
        assert len(txns) == 3

    def test_concurrent_weekly_cap_never_exceeded(self, app, seed):
        """Multiple activities completing simultaneously near the weekly limit cannot exceed 100 points."""
        if db.engine.dialect.name != "postgresql":
            pytest.skip("PostgreSQL required to verify row-locking concurrency behavior.")

        user_id = seed["user1_id"]
        org_id = seed["org_id"]

        # Fix reference timestamp to a Friday 12:00 UTC so start_of_week (Monday) is 4 days earlier
        mock_now = datetime(2026, 11, 13, 12, 0, 0, tzinfo=timezone.utc)
        tuesday_time = datetime(2026, 11, 10, 12, 0, 0, tzinfo=timezone.utc)

        # Pre-seed 9 transactions of 10 points earlier this week (on Tuesday), totaling 90 points
        for i in range(9):
            act = _make_activity(
                seed,
                activity_id=f"pre-weekly-{i}",
                assigned_window_id=f"gw-pre-weekly-{i}",
                scheduled_start_time=tuesday_time - timedelta(minutes=10),
                expected_end_time=tuesday_time + timedelta(minutes=10),
            )
            h = ActivityHistory(
                activity_id=act.id,
                previous_status="running",
                new_status="completed",
                created_at=tuesday_time,
            )
            db.session.add(h)
            db.session.flush()
            txn = EcoPointTransaction(
                id=f"tx-pre-weekly-{i}",
                user_id=str(user_id),
                organization_id=str(org_id),
                activity_id=act.id,
                event_type="complete_green_window",
                event_id=str(h.id),
                points=10,
                created_at=tuesday_time,
            )
            db.session.add(txn)

        score = SustainabilityScore(
            id="score-weekly-test",
            user_id=str(user_id),
            organization_id=str(org_id),
            score=90.0,
            total_points=90,
            current_streak=1,
            longest_streak=1,
            last_sustainable_date=tuesday_time.date(),
        )
        db.session.add(score)
        db.session.commit()

        initial_score = SustainabilityScore.query.filter_by(user_id=str(user_id)).first()
        assert initial_score.total_points == 90

        # Create 3 candidate activities today (mock_now) with Green Windows (90 pts + 3 * 10 = 120 potential)
        candidate_specs = []
        for i in range(3):
            cand_id = f"cand-weekly-{i}"
            act = _make_activity(
                seed,
                activity_id=cand_id,
                assigned_window_id=f"gw-cand-weekly-{i}",
                scheduled_start_time=mock_now - timedelta(minutes=10),
                expected_end_time=mock_now + timedelta(minutes=10),
            )
            h = ActivityHistory(
                activity_id=cand_id,
                previous_status="running",
                new_status="completed",
                created_at=mock_now,
            )
            db.session.add(h)
            db.session.flush()
            candidate_specs.append((cand_id, h.id))
        db.session.commit()

        num_workers = len(candidate_specs)
        barrier = threading.Barrier(num_workers)
        results = [None] * num_workers
        errors = [None] * num_workers

        def worker(idx, act_id, hist_id):
            try:
                with app.app_context():
                    act = db.session.get(Activity, act_id)
                    hist = db.session.get(ActivityHistory, hist_id)
                    barrier.wait(timeout=5)
                    with patch("services.ecopoints_service.datetime") as mock_dt:
                        mock_dt.now.return_value = mock_now
                        mock_dt.side_effect = lambda *args, **kwargs: datetime(*args, **kwargs)
                        try_award_completion_points(act, hist)
                    db.session.commit()
                    results[idx] = "success"
            except Exception as exc:
                errors[idx] = exc
            finally:
                with app.app_context():
                    db.session.remove()

        threads = [
            threading.Thread(target=worker, args=(i, cid, hid))
            for i, (cid, hid) in enumerate(candidate_specs)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert all(not t.is_alive() for t in threads), "Weekly cap worker threads did not finish in time"
        assert all(err is None for err in errors), f"Worker thread encountered error: {errors}"
        assert all(res == "success" for res in results)

        # Final score must be capped at exactly 100 points
        final_score = SustainabilityScore.query.filter_by(user_id=str(user_id)).first()
        assert final_score.total_points == 100

        # Total points in EcoPointTransaction for the week must equal exactly 100
        txns_sum = (
            db.session.query(db.func.sum(EcoPointTransaction.points))
            .filter_by(user_id=str(user_id))
            .scalar()
        )
        assert txns_sum == 100

        # Exactly 10 transactions total (9 pre-seeded + 1 winner from the 3 concurrent attempts)
        txns = EcoPointTransaction.query.filter_by(user_id=str(user_id)).all()
        assert len(txns) == 10


# ---------------------------------------------------------------------------
# 10. Upload recovery after database failure
# ---------------------------------------------------------------------------

class TestUploadRecovery:

    def test_upload_recovery_completes_and_awards_points(self, app, seed, tmp_path, monkeypatch):
        """When an upload is in 'running' and final file exists on disk, execute_upload recovers and awards."""
        from services import upload_service
        monkeypatch.setattr(upload_service, "UPLOAD_ROOT", tmp_path / "uploads")

        now = datetime.now(timezone.utc)
        activity = _make_activity(
            seed,
            activity_id="upload-rec-001",
            activity_type="file-upload",
            status="pending",
            progress=0.0,
            assigned_window_id="gw-upload-rec",
            scheduled_start_time=now - timedelta(minutes=15),
            expected_end_time=now + timedelta(minutes=15),
        )
        db.session.commit()

        file_storage = FileStorage(
            stream=BytesIO(b"data,values\n1,2\n"),
            filename="rec.csv",
            content_type="text/csv",
        )
        registration, _ = upload_service.register_upload(
            activity_id="upload-rec-001",
            organization_id=seed["org_id"],
            uploaded_file=file_storage,
        )

        # Transition activity and registration to running (simulating interrupted run)
        activity.status = "running"
        activity.progress = 50.0

        # Simulate interrupted state: registration is running, final file already stored
        final = Path(registration.final_path)
        final.parent.mkdir(parents=True, exist_ok=True)
        final.write_bytes(b"data,values\n1,2\n")
        registration.status = "running"
        registration.execution_started_at = now - timedelta(seconds=10)
        db.session.commit()

        # Run execute_upload (triggers recovery path)
        completed_reg = upload_service.execute_upload(
            upload_id=registration.id,
            organization_id=seed["org_id"],
            run_now=True,
        )
        assert completed_reg.status == "completed"

        # Verify activity completed and points awarded
        updated_act = db.session.get(Activity, "upload-rec-001")
        assert updated_act.status == "completed"

        txn = EcoPointTransaction.query.filter_by(activity_id="upload-rec-001").first()
        assert txn is not None
        assert txn.points == 10
        assert txn.event_type == "complete_green_window"


# ---------------------------------------------------------------------------
# 11. Upload reward exactly-once behavior
# ---------------------------------------------------------------------------

class TestUploadRewardExactlyOnce:

    def test_repeated_execute_upload_does_not_duplicate_points(self, app, seed, tmp_path, monkeypatch):
        """Calling execute_upload on an already completed upload does not duplicate rewards."""
        from services import upload_service
        monkeypatch.setattr(upload_service, "UPLOAD_ROOT", tmp_path / "uploads")

        now = datetime.now(timezone.utc)
        activity = _make_activity(
            seed,
            activity_id="upload-dup-001",
            activity_type="file-upload",
            status="pending",
            assigned_window_id="gw-upload-dup",
            scheduled_start_time=now - timedelta(minutes=10),
            expected_end_time=now + timedelta(minutes=10),
        )
        db.session.commit()

        file_storage = FileStorage(
            stream=BytesIO(b"data\n"),
            filename="dup.csv",
            content_type="text/csv",
        )
        reg, _ = upload_service.register_upload(
            activity_id="upload-dup-001",
            organization_id=seed["org_id"],
            uploaded_file=file_storage,
        )

        # First execution: completes and awards points
        res1 = upload_service.execute_upload(reg.id, seed["org_id"], run_now=True)
        assert res1.status == "completed"

        # Second execution: idempotently returns completed
        res2 = upload_service.execute_upload(reg.id, seed["org_id"], run_now=True)
        assert res2.status == "completed"

        txns = EcoPointTransaction.query.filter_by(activity_id="upload-dup-001").all()
        assert len(txns) == 1


# ---------------------------------------------------------------------------
# 12. Legacy ownerless activities
# ---------------------------------------------------------------------------

class TestLegacyOwnerless:

    def test_ownerless_activity_completes_without_reward(self, app, seed):
        activity = Activity(
            id="legacy-001",
            organization_id=seed["org_id"],
            user_id=None,
            name="Legacy Activity",
            type="flexible",
            activity_type="batch-processing",
            duration=10.0,
            power_draw=100.0,
            status="completed",
            progress=100.0,
        )
        db.session.add(activity)
        db.session.flush()

        history = ActivityHistory(
            activity_id=activity.id,
            previous_status="running",
            new_status="completed",
        )
        db.session.add(history)
        db.session.flush()

        try_award_completion_points(activity, history)
        db.session.commit()

        txn = EcoPointTransaction.query.filter_by(activity_id=activity.id).first()
        assert txn is None


# ---------------------------------------------------------------------------
# 13. Existing badge and streak behavior (UTC date policy)
# ---------------------------------------------------------------------------

class TestBadgesAndStreakUTC:

    def test_first_completion_starts_streak_and_awards_starter_badge(self, app, seed):
        now = datetime.now(timezone.utc)
        activity, history = _make_completed_with_history(
            seed,
            activity_id="streak-badge-001",
            assigned_window_id="gw-sb",
            scheduled_start_time=now - timedelta(minutes=10),
            expected_end_time=now + timedelta(minutes=10),
        )
        try_award_completion_points(activity, history)
        db.session.commit()

        user_id = str(seed["user1_id"])
        score = SustainabilityScore.query.filter_by(user_id=user_id).first()
        assert score is not None
        assert score.current_streak == 1
        assert score.longest_streak == 1
        assert score.last_sustainable_date == now.date()

        # Check Green Starter badge awarded
        from models.badge import Badge
        badges = Badge.query.filter_by(user_id=user_id).all()
        assert any(b.badge_type == "first_green_action" for b in badges)
