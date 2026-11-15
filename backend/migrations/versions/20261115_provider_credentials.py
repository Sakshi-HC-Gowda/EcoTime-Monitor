"""Add encrypted organization-scoped provider credentials."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261115_provider_credentials"
down_revision = "20261115_inv_global"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organization_provider_credentials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "organization_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("encrypted_token", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "organization_id",
            name="uq_organization_provider_credentials_organization",
        ),
    )
    op.create_index(
        "ix_organization_provider_credentials_organization_id",
        "organization_provider_credentials",
        ["organization_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_organization_provider_credentials_organization_id",
        table_name="organization_provider_credentials",
    )
    op.drop_table("organization_provider_credentials")
