"""Add auth tables: teams, users, sessions.

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "teams",
        sa.Column("team_id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("name", sa.String(256), unique=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "users",
        sa.Column("user_id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("email", sa.String(256), unique=True, nullable=False),
        sa.Column("display_name", sa.String(256), nullable=False),
        sa.Column("password_hash", sa.String(256), nullable=True),
        sa.Column("avatar_url", sa.String(1024), nullable=True),
        sa.Column("auth_provider", sa.String(32), nullable=False, server_default="local"),
        sa.Column("role", sa.String(32), nullable=False, server_default="viewer"),
        sa.Column("team_id", UUID(as_uuid=True), sa.ForeignKey("teams.team_id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "sessions",
        sa.Column("session_id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("device", sa.String(256), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("sessions")
    op.drop_table("users")
    op.drop_table("teams")
