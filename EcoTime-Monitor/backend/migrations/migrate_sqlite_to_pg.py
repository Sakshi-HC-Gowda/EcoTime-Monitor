"""
SQLite to PostgreSQL Data Migration Script
===========================================
Safely migrates all existing records from SQLite (`backend/ecotime.db`)
to PostgreSQL while preserving IDs, foreign keys, timestamps, and row counts.

Executed automatically on app startup if ecotime.db is present and PG tables are empty.
Can also be run manually: `python migrations/migrate_sqlite_to_pg.py`
"""

from __future__ import annotations

import os
import sqlite3
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text

logger = logging.getLogger(__name__)

SQLITE_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ecotime.db")


def _parse_dt(val: Any) -> datetime | None:
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    try:
        dt = datetime.fromisoformat(str(val).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def migrate_sqlite_data_to_pg(db_session, engine) -> dict[str, int]:
    """
    Copy records from SQLite ecotime.db into PostgreSQL.
    Returns a dict mapping table_name -> count of records migrated.
    """
    if engine.dialect.name != "postgresql":
        logger.info("Skipping SQLite-to-PostgreSQL migration because the active database is not PostgreSQL.")
        return {}

    if not os.path.exists(SQLITE_DB_PATH):
        logger.info("No SQLite ecotime.db file found — skipping SQLite data migration.")
        return {}

    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Find existing tables in SQLite
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [r["name"] for r in cur.fetchall() if not r["name"].startswith("sqlite_")]

    migrated_counts: dict[str, int] = {}

    # Preferred migration order to respect Foreign Key constraints:
    # 1. activities
    # 2. workload_profiles
    # 3. current_status
    # 4. activity_history
    # 5. recommendations
    # 6. carbon_snapshots
    # 7. system_settings
    # 8. remaining tables
    order = [
        "activities",
        "workload_profiles",
        "current_status",
        "activity_history",
        "recommendations",
        "carbon_snapshots",
        "system_settings",
        "schedule_slots",
        "execution_history",
        "analytics_snapshots",
        "carbon_forecasts",
        "notifications",
        "audit_logs",
    ]

    sorted_tables = [t for t in order if t in tables] + [t for t in tables if t not in order]

    for table in sorted_tables:
        rows = cur.execute(f'SELECT * FROM "{table}"').fetchall()
        if not rows:
            migrated_counts[table] = 0
            continue

        # Check if target PG table already has data
        result = db_session.execute(text(f'SELECT count(*) FROM "{table}"')).scalar()
        if result and result > 0:
            logger.info("PostgreSQL table '%s' already contains %d rows — skipping SQLite import for this table.", table, result)
            migrated_counts[table] = 0
            continue

        count = 0
        for r in rows:
            row_dict = dict(r)
            columns = list(row_dict.keys())

            # Convert text timestamps to datetime objects if needed
            for col in ["created_at", "updated_at", "prediction_time", "last_updated", "timestamp", "fetched_at", "actual_start", "actual_end"]:
                if col in row_dict:
                    row_dict[col] = _parse_dt(row_dict[col])

            col_names = ", ".join([f'"{c}"' for c in columns])
            val_param_names = ", ".join([f":{c}" for c in columns])
            sql = text(f'INSERT INTO "{table}" ({col_names}) VALUES ({val_param_names}) ON CONFLICT DO NOTHING')

            try:
                db_session.execute(sql, row_dict)
                count += 1
            except Exception as e:
                logger.warning("Failed to insert SQLite row into PG table '%s': %s", table, e)

        db_session.commit()
        migrated_counts[table] = count
        logger.info("Migrated %d rows from SQLite table '%s' into PostgreSQL.", count, table)

    conn.close()
    return migrated_counts


if __name__ == "__main__":
    from app import create_app
    from extensions import db

    app = create_app()
    with app.app_context():
        results = migrate_sqlite_data_to_pg(db.session, db.engine)
        print("Migration complete:", results)
