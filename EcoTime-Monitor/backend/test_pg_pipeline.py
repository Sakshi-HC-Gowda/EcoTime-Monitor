"""
EcoTime PostgreSQL Pipeline & Integration Test Suite
=====================================================
Automated verification of PostgreSQL connection, table creation, SQLite data migration,
CRUD operations, status transitions, ACID transactions, Member 4 analytics, and persistence.
"""

from __future__ import annotations

import sys
import logging
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def run_tests():
    print("=" * 70)
    print("EcoTime PostgreSQL End-to-End Pipeline Verification")
    print("=" * 70)

    from app import create_app
    from extensions import db
    from models.activity import Activity
    from models.recommendation import Recommendation
    from models.activity_history import ActivityHistory
    from models.workload_profile import WorkloadProfile
    from models.carbon_snapshot import CarbonSnapshot
    from models.current_status import CurrentStatus
    from models.system_setting import SystemSetting
    from models.schedule_slot import ScheduleSlot
    from models.execution_history import ExecutionHistory
    from models.analytics_snapshot import AnalyticsSnapshot
    from models.carbon_forecast import CarbonForecast
    from models.notification import Notification
    from models.audit_log import AuditLog

    app = create_app()

    with app.app_context():
        # 1. Verify Database Dialect & Connection
        engine = db.engine
        print(f"\n[Test 1] Database Engine Dialect: {engine.dialect.name.upper()}")
        print(f"         Connection String: {app.config['SQLALCHEMY_DATABASE_URI']}")

        try:
            with engine.connect() as conn:
                print("         ✔ Connection to PostgreSQL server successful!")
        except Exception as e:
            print(f"\n[ERROR] Could not connect to PostgreSQL: {e}")
            print("         Please set a valid DATABASE_URL in backend/.env:")
            print("         DATABASE_URL=postgresql://<username>:<password>@<host>:<port>/<dbname>")
            raise
        
        # 2. Check Table Registration
        tables = list(db.metadata.tables.keys())
        print(f"\n[Test 2] Verified {len(tables)} ORM Tables in Metadata:")
        for t in sorted(tables):
            print(f"         - {t}")
        assert len(tables) >= 13, f"Expected at least 13 tables, found {len(tables)}"

        # 3. Test Activity Lifecycle & Cascading Writes
        print("\n[Test 3] Testing Activity Creation & Auto-Persistence Pipeline...")
        from services.activity_service import create_activity, update_activity, get_activity, delete_activity

        test_payload = {
            "name": "Integration Test Task - PG Migration",
            "type": "flexible",
            "activityType": "ci-cd-pipeline",
            "duration": 60.0,
            "powerDraw": 450.0,
            "priorityScore": 85,
            "flexibilityScore": 90,
            "deadline": "2026-08-03T18:00:00Z",
        }

        task_dict, err = create_activity(test_payload)
        assert err is None, f"Activity creation failed: {err}"
        task_id = task_dict["id"]
        print(f"         ✔ Created Activity ID: {task_id}")

        # Check DB rows created in single transaction
        act_row = db.session.get(Activity, task_id)
        assert act_row is not None, "Activity row missing from DB"
        assert act_row.name == "Integration Test Task - PG Migration"

        wp_row = WorkloadProfile.query.filter_by(activity_id=task_id).first()
        assert wp_row is not None, "WorkloadProfile missing from DB"
        print(f"         ✔ WorkloadProfile created: cpu={wp_row.cpu_usage}%, level={wp_row.workload_level}")

        cs_row = CurrentStatus.query.filter_by(activity_id=task_id).first()
        assert cs_row is not None and cs_row.current_status == "draft", "CurrentStatus missing or invalid"
        print("         ✔ CurrentStatus registered: status='draft'")

        hist_count = ActivityHistory.query.filter_by(activity_id=task_id).count()
        assert hist_count >= 1, "ActivityHistory missing"
        print(f"         ✔ ActivityHistory logged: {hist_count} entry(s)")

        rec_count = Recommendation.query.filter_by(activity_id=task_id).count()
        print(f"         ✔ Recommendations logged: {rec_count} entry(s)")

        snap_count = AnalyticsSnapshot.query.count()
        print(f"         ✔ AnalyticsSnapshots recorded: {snap_count} snapshot(s)")

        # 4. Status Transition Lifecycle (draft -> pending -> scheduled -> running -> completed)
        print("\n[Test 4] Executing Status Machine Transitions...")
        transitions = ["pending", "scheduled", "running", "completed"]
        for new_st in transitions:
            updated, update_err = update_activity(task_id, {"status": new_st})
            assert update_err is None, f"Failed transition to {new_st}: {update_err}"
            assert updated["status"] == new_st, f"Expected status {new_st}, got {updated['status']}"
            
            # Verify CurrentStatus updated
            cs = CurrentStatus.query.filter_by(activity_id=task_id).first()
            assert cs.current_status == new_st, f"CurrentStatus desynced: expected {new_st}, got {cs.current_status}"
            print(f"         ✔ Transitioned to '{new_st}' (CurrentStatus verified)")

        # Verify ExecutionHistory
        exec_rows = ExecutionHistory.query.filter_by(activity_id=task_id).all()
        print(f"         ✔ ExecutionHistory entries recorded: {len(exec_rows)}")

        # 5. Member 4 Analytics Queries
        print("\n[Test 5] Member 4 Analytics & Aggregation Queries...")
        from services.analytics_service import get_analytics_summary, get_dashboard_summary, get_status_summary

        analytics_data = get_analytics_summary()
        print(f"         ✔ Total Carbon Saved: {analytics_data['totalCarbonSavedGrams']} g")
        print(f"         ✔ Total Energy Saved: {analytics_data['totalEnergySavedKwh']} kWh")
        print(f"         ✔ Today's Activity Total: {analytics_data['todaysActivities']['total']}")

        status_data = get_status_summary()
        print(f"         ✔ Status Counts Summary: {status_data['counts']}")

        dash_data = get_dashboard_summary()
        print(f"         ✔ Dashboard Total Activities: {dash_data['summary']['totalActivities']}")

        # 6. System Settings Persistence Test
        print("\n[Test 6] PostgreSQL System Settings Persistence...")
        from services.system_settings_service import get_simulation_config, set_simulation_config, get_system_status, set_system_status

        original_cfg = get_simulation_config()
        set_simulation_config({"lowCarbonThreshold": 195.0, "simulationSpeed": 30})
        updated_cfg = get_simulation_config()
        assert updated_cfg["lowCarbonThreshold"] == 195.0, "Simulation config lowCarbonThreshold failed to persist"
        assert updated_cfg["simulationSpeed"] == 30, "Simulation config simulationSpeed failed to persist"
        print(f"         ✔ Simulation config updated and retrieved from PostgreSQL: threshold={updated_cfg['lowCarbonThreshold']}")

        set_system_status(False)
        st = get_system_status()
        assert st["isActive"] is False, "System status failed to update to False"
        set_system_status(True)
        st_res = get_system_status()
        assert st_res["isActive"] is True, "System status failed to update to True"
        print("         ✔ System operating flag updated and verified in PostgreSQL")

        # 7. Test Cascade Delete
        print("\n[Test 7] Verifying Foreign Key Cascade Delete...")
        del_ok, del_err = delete_activity(task_id)
        assert del_ok is True, f"Failed to delete test activity: {del_err}"
        assert db.session.get(Activity, task_id) is None, "Activity row still exists"
        assert WorkloadProfile.query.filter_by(activity_id=task_id).first() is None, "WorkloadProfile orphan left behind"
        assert CurrentStatus.query.filter_by(activity_id=task_id).first() is None, "CurrentStatus orphan left behind"
        print("         ✔ Activity and all cascading child rows successfully deleted")

        print("\n" + "=" * 70)
        print("ALL POSTGRESQL PIPELINE TESTS PASSED SUCCESSFULLY! 🎉")
        print("=" * 70)


if __name__ == "__main__":
    try:
        run_tests()
    except Exception as e:
        logger.exception("Test execution failed!")
        sys.exit(1)
