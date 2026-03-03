"""Add layouts table.

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'layouts',
        sa.Column('layout_id', UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column('name', sa.String(256), nullable=False),
        sa.Column('owner_id', UUID(), sa.ForeignKey('users.user_id'), nullable=True),
        sa.Column('team_id', UUID(), sa.ForeignKey('teams.team_id'), nullable=True),
        sa.Column('layout_json', JSONB, nullable=False),
        sa.Column('is_default', sa.Boolean, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table('layouts')
