"""Add organization invitations and separate global leaderboard consent."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "20261115_inv_global"
down_revision = "20261114_phase5"
branch_labels = None
depends_on = None


def _column_exists(bind, table_name: str, column_name: str) -> bool:
    return any(
        column["name"] == column_name
        for column in inspect(bind).get_columns(table_name)
    )


def upgrade() -> None:
    bind = op.get_bind()

    if "organization_invitations" not in inspect(bind).get_table_names():
        op.create_table(
            "organization_invitations",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column(
                "organization_id",
                sa.Integer(),
                sa.ForeignKey("organizations.id"),
                nullable=False,
            ),
            sa.Column(
                "created_by_user_id",
                sa.Integer(),
                sa.ForeignKey("users.id"),
                nullable=False,
            ),
            sa.Column("token_hash", sa.String(length=64), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "used_by_user_id",
                sa.Integer(),
                sa.ForeignKey("users.id"),
                nullable=True,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
            ),
            sa.UniqueConstraint("token_hash", name="uq_org_invitation_token_hash"),
        )
        op.create_index(
            "ix_organization_invitations_organization_id",
            "organization_invitations",
            ["organization_id"],
        )
        op.create_index(
            "ix_organization_invitations_created_by_user_id",
            "organization_invitations",
            ["created_by_user_id"],
        )

    if not _column_exists(bind, "sustainability_scores", "global_leaderboard_opt_in"):
        op.add_column(
            "sustainability_scores",
            sa.Column(
                "global_leaderboard_opt_in",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()

    if _column_exists(bind, "sustainability_scores", "global_leaderboard_opt_in"):
        op.drop_column("sustainability_scores", "global_leaderboard_opt_in")
    if "organization_invitations" in inspect(bind).get_table_names():
        op.drop_index(
            "ix_organization_invitations_created_by_user_id",
            table_name="organization_invitations",
        )
        op.drop_index(
            "ix_organization_invitations_organization_id",
            table_name="organization_invitations",
        )
        op.drop_table("organization_invitations")
