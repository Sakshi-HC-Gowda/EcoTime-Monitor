"""
Migration: add new columns to existing tables
================================================
Idempotent, non-destructive schema migrations that work on both
SQLite and PostgreSQL.

Runs automatically on every app startup (see app.py) — no manual step
needed. Can also be run standalone: `python migrations/migrate.py`
"""

from __future__ import annotations

import logging
from sqlalchemy import inspect, text

logger = logging.getLogger(__name__)


def _column_exists(inspector, table_name: str, column_name: str) -> bool:
    if table_name not in inspector.get_table_names():
        return True  # table doesn't exist yet — db.create_all() will make it fresh
    columns = {c["name"] for c in inspector.get_columns(table_name)}
    return column_name in columns


def _is_postgres(engine) -> bool:
    return engine.dialect.name == "postgresql"


def run_migrations(db) -> list[str]:
    """
    Apply any pending non-destructive schema migrations.
    Returns a list of human-readable descriptions of what was applied.
    """
    applied: list[str] = []
    inspector = inspect(db.engine)
    is_pg = _is_postgres(db.engine)

    # Column additions — use dialect-appropriate DDL
    column_migrations = [
        (
            "workload_profiles", "memory_usage",
            "ALTER TABLE workload_profiles ADD COLUMN memory_usage FLOAT NOT NULL DEFAULT 0.0"
            if not is_pg else
            "ALTER TABLE workload_profiles ADD COLUMN IF NOT EXISTS memory_usage DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        ),
        (
            "workload_profiles", "prediction_time",
            "ALTER TABLE workload_profiles ADD COLUMN prediction_time DATETIME"
            if not is_pg else
            "ALTER TABLE workload_profiles ADD COLUMN IF NOT EXISTS prediction_time TIMESTAMP WITH TIME ZONE",
        ),
        (
            "carbon_snapshots", "activity_id",
            "ALTER TABLE carbon_snapshots ADD COLUMN activity_id VARCHAR(64)"
            if not is_pg else
            "ALTER TABLE carbon_snapshots ADD COLUMN IF NOT EXISTS activity_id VARCHAR(64)",
        ),
    ]

    # Index creation — both SQLite and PG support IF NOT EXISTS
    index_migrations = [
        ("ix_activities_status",
         "CREATE INDEX IF NOT EXISTS ix_activities_status ON activities (status)"),
        ("ix_activities_created_at",
         "CREATE INDEX IF NOT EXISTS ix_activities_created_at ON activities (created_at)"),
        ("ix_activities_category",
         "CREATE INDEX IF NOT EXISTS ix_activities_category ON activities (category)"),
        ("ix_activities_deadline",
         "CREATE INDEX IF NOT EXISTS ix_activities_deadline ON activities (deadline)"),
        ("ix_recommendations_status",
         "CREATE INDEX IF NOT EXISTS ix_recommendations_status ON recommendations (status)"),
        ("ix_recommendations_created_at",
         "CREATE INDEX IF NOT EXISTS ix_recommendations_created_at ON recommendations (created_at)"),
        ("ix_carbon_snapshots_activity_id",
         "CREATE INDEX IF NOT EXISTS ix_carbon_snapshots_activity_id ON carbon_snapshots (activity_id)"),
        ("ix_execution_history_activity_id",
         "CREATE INDEX IF NOT EXISTS ix_execution_history_activity_id ON execution_history (activity_id)"),
        ("ix_execution_history_new_status",
         "CREATE INDEX IF NOT EXISTS ix_execution_history_new_status ON execution_history (new_status)"),
        ("ix_analytics_snapshots_created_at",
         "CREATE INDEX IF NOT EXISTS ix_analytics_snapshots_created_at ON analytics_snapshots (created_at)"),
        ("ix_schedule_slots_activity_id",
         "CREATE INDEX IF NOT EXISTS ix_schedule_slots_activity_id ON schedule_slots (activity_id)"),
        ("ix_audit_logs_entity_type",
         "CREATE INDEX IF NOT EXISTS ix_audit_logs_entity_type ON audit_logs (entity_type)"),
        ("ix_notifications_activity_id",
         "CREATE INDEX IF NOT EXISTS ix_notifications_activity_id ON notifications (activity_id)"),
    ]

    with db.engine.begin() as conn:
        for table, column, ddl in column_migrations:
            if not is_pg and _column_exists(inspector, table, column):
                continue
            try:
                conn.execute(text(ddl))
                applied.append(f"{table}.{column}")
                logger.info("Migration applied: %s", ddl)
            except Exception:
                logger.debug("Migration skipped (already exists or N/A): %s.%s", table, column)

        for name, ddl in index_migrations:
            try:
                conn.execute(text(ddl))
            except Exception:
                logger.debug("Index migration skipped: %s", name)

    return applied
