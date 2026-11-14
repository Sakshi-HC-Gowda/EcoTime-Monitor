"""Create the managed schema and harden ownership/idempotency boundaries.

Revision ID: 20261114_phase5
Revises:
"""

from __future__ import annotations

import logging

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect, text

revision = "20261114_phase5"
down_revision = None
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")


def _column_exists(bind, table_name: str, column_name: str) -> bool:
    return any(
        column["name"] == column_name
        for column in inspect(bind).get_columns(table_name)
    )


def _add_column(bind, table_name: str, column: sa.Column) -> None:
    if not _column_exists(bind, table_name, column.name):
        op.add_column(table_name, column)


def _index_exists(bind, index_name: str) -> bool:
    return any(
        index["name"] == index_name
        for table_name in inspect(bind).get_table_names()
        for index in inspect(bind).get_indexes(table_name)
    )


def _foreign_key_exists(bind, table_name: str, constraint_name: str) -> bool:
    return any(
        fk.get("name") == constraint_name
        for fk in inspect(bind).get_foreign_keys(table_name)
    )


def _unique_exists(bind, table_name: str, constraint_name: str) -> bool:
    if any(
        constraint.get("name") == constraint_name
        for constraint in inspect(bind).get_unique_constraints(table_name)
    ):
        return True
    return any(
        index.get("name") == constraint_name and index.get("unique")
        for index in inspect(bind).get_indexes(table_name)
    )


def _add_validated_unique_constraint(
    bind,
    *,
    table_name: str,
    columns: list[str],
    constraint_name: str,
) -> None:
    if _unique_exists(bind, table_name, constraint_name):
        return
    column_sql = ", ".join(columns)
    duplicate_count = bind.execute(
        text(
            f"""
            SELECT COUNT(*)
            FROM (
                SELECT {column_sql}
                FROM {table_name}
                GROUP BY {column_sql}
                HAVING COUNT(*) > 1
            ) duplicates
            """
        )
    ).scalar_one()
    if duplicate_count:
        logger.warning(
            "Skipped %s: %s duplicate groups require explicit data repair",
            constraint_name,
            duplicate_count,
        )
        return
    if bind.dialect.name == "postgresql":
        op.create_unique_constraint(constraint_name, table_name, columns)


def _add_validated_foreign_key(
    bind,
    *,
    table_name: str,
    column_name: str,
    referred_table: str,
    constraint_name: str,
) -> None:
    if bind.dialect.name != "postgresql":
        return
    if _foreign_key_exists(bind, table_name, constraint_name):
        return
    orphan_count = bind.execute(
        text(
            f"""
            SELECT COUNT(*)
            FROM {table_name} child
            LEFT JOIN {referred_table} parent
              ON child.{column_name} = parent.id
            WHERE child.{column_name} IS NOT NULL
              AND parent.id IS NULL
            """
        )
    ).scalar_one()
    if orphan_count:
        logger.warning(
            "Skipped %s: %s orphan %s values require explicit data repair",
            constraint_name,
            orphan_count,
            f"{table_name}.{column_name}",
        )
        return
    op.create_foreign_key(
        constraint_name,
        table_name,
        referred_table,
        [column_name],
        ["id"],
    )


def _migrate_idle_activities(bind) -> None:
    if bind.dialect.name == "postgresql":
        elapsed_expression = (
            "CASE WHEN updated_at IS NULL THEN NULL "
            "ELSE EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - updated_at)) END"
        )
    else:
        elapsed_expression = "NULL"
    bind.execute(
        text(
            f"""
            INSERT INTO activity_history (
                activity_id, previous_status, new_status,
                execution_time, created_at
            )
            SELECT id, 'idle', 'pending',
                   {elapsed_expression},
                   CURRENT_TIMESTAMP
            FROM activities
            WHERE status = 'idle'
            """
        )
    )
    result = bind.execute(
        text("UPDATE activities SET status = 'pending' WHERE status = 'idle'")
    )
    if result.rowcount:
        logger.info("Migrated %d legacy idle activities to pending", result.rowcount)


def upgrade() -> None:
    bind = op.get_bind()

    # Importing the application metadata creates only missing tables. It does
    # not alter or remove an existing table, column, index, or row.
    from models import (  # noqa: F401
        Activity,
        ActivityHistory,
        AnalyticsRecommendation,
        Badge,
        EcoPointTransaction,
        Organization,
        OrganizationMember,
        Role,
        SimulationConfig,
        SustainabilityScore,
        User,
        UploadRegistration,
    )
    from extensions import db

    db.metadata.create_all(bind=bind)

    _add_column(
        bind, "activities",
        sa.Column("organization_id", sa.Integer(), nullable=True),
    )
    _add_column(
        bind, "activities",
        sa.Column("user_id", sa.Integer(), nullable=True),
    )
    for name in (
        "earliest_start",
        "scheduled_start_time",
        "expected_end_time",
        "execution_start_time",
        "deadline",
    ):
        _add_column(
            bind, "activities",
            sa.Column(name, sa.DateTime(timezone=True), nullable=True),
        )
    _add_column(bind, "activities", sa.Column("idempotency_key", sa.String(128)))
    _add_column(bind, "activities", sa.Column("request_fingerprint", sa.String(64)))
    _add_column(
        bind, "upload_registrations",
        sa.Column("scheduled_end_time", sa.DateTime(timezone=True), nullable=True),
    )
    _add_column(
        bind, "upload_registrations", sa.Column("idempotency_key", sa.String(128))
    )
    _add_column(
        bind, "upload_registrations",
        sa.Column("request_fingerprint", sa.String(64)),
    )
    _add_column(
        bind, "analytics_recommendations",
        sa.Column("organization_id", sa.Integer(), nullable=True),
    )
    _add_column(
        bind, "sustainability_scores",
        sa.Column("leaderboard_opt_in", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    if bind.dialect.name == "postgresql":
        bind.execute(
            text(
                """
                UPDATE analytics_recommendations recommendation
                SET organization_id = activity.organization_id
                FROM activities activity
                WHERE recommendation.activity_id = activity.id
                  AND recommendation.organization_id IS NULL
                """
            )
        )
    else:
        bind.execute(
            text(
                """
                UPDATE analytics_recommendations
                SET organization_id = (
                    SELECT activities.organization_id
                    FROM activities
                    WHERE activities.id = analytics_recommendations.activity_id
                )
                WHERE organization_id IS NULL
                  AND activity_id IN (SELECT id FROM activities)
                """
            )
        )

    for table_name, index_name, columns, unique in (
        ("activities", "ix_activities_organization_id", ["organization_id"], False),
        ("activities", "ix_activities_user_id", ["user_id"], False),
        (
            "activities",
            "uq_activities_org_idempotency_key",
            ["organization_id", "idempotency_key"],
            True,
        ),
        (
            "upload_registrations",
            "uq_uploads_org_idempotency_key",
            ["organization_id", "idempotency_key"],
            True,
        ),
        (
            "analytics_recommendations",
            "ix_analytics_recommendations_organization_id",
            ["organization_id"],
            False,
        ),
    ):
        if not _index_exists(bind, index_name):
            if unique:
                duplicate_count = bind.execute(
                    text(
                        f"""
                        SELECT COUNT(*)
                        FROM (
                            SELECT {", ".join(columns)}
                            FROM {table_name}
                            GROUP BY {", ".join(columns)}
                            HAVING COUNT(*) > 1
                        ) duplicates
                        """
                    )
                ).scalar_one()
                if duplicate_count:
                    logger.warning(
                        "Skipped %s: %s duplicate groups require explicit data repair",
                        index_name,
                        duplicate_count,
                    )
                    continue
            op.create_index(index_name, table_name, columns, unique=unique)

    _add_validated_unique_constraint(
        bind,
        table_name="eco_point_transactions",
        columns=["user_id", "event_type", "event_id"],
        constraint_name="uq_ecopoint_user_event",
    )
    _add_validated_unique_constraint(
        bind,
        table_name="badges",
        columns=["user_id", "badge_type"],
        constraint_name="uq_badge_user_type",
    )
    _add_validated_unique_constraint(
        bind,
        table_name="organization_members",
        columns=["organization_id", "user_id"],
        constraint_name="uq_org_member",
    )

    _add_validated_foreign_key(
        bind,
        table_name="activities",
        column_name="organization_id",
        referred_table="organizations",
        constraint_name="activities_organization_id_fkey",
    )
    _add_validated_foreign_key(
        bind,
        table_name="activities",
        column_name="user_id",
        referred_table="users",
        constraint_name="activities_user_id_fkey",
    )
    _add_validated_foreign_key(
        bind,
        table_name="analytics_recommendations",
        column_name="organization_id",
        referred_table="organizations",
        constraint_name="analytics_recommendations_organization_id_fkey",
    )

    _migrate_idle_activities(bind)


def downgrade() -> None:
    # This revision may have recorded legacy status transitions and repairs are
    # intentionally not reversible. No destructive downgrade is provided.
    logger.warning(
        "Phase 5 downgrade is intentionally a no-op; restore a reviewed backup "
        "to reverse data changes."
    )
