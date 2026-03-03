"""Add recordings and cloud_objects tables.

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:

    # --- Recordings ---
    op.create_table(
        'recordings',
        sa.Column('recording_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('device_name', sa.String(256), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), nullable=True),
        sa.Column('team_id', UUID(as_uuid=True), nullable=True),
        sa.Column('start_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('duration_sec', sa.Float, nullable=True),
        sa.Column('topics', JSONB, nullable=False),
        sa.Column('size_bytes', sa.BigInteger, nullable=True),
        sa.Column('local_path', sa.String(1024), nullable=True),
        sa.Column('storage_url', sa.String(1024), nullable=True),
        sa.Column('storage_type', sa.String(32), nullable=False, server_default='local'),
        sa.Column('status', sa.String(32), nullable=False, server_default='recording'),
        sa.Column('shared', sa.Boolean, server_default='false'),
        sa.Column('tags', JSONB, server_default="'[]'::jsonb"),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], name='fk_recordings_user'),
        sa.ForeignKeyConstraint(['team_id'], ['teams.team_id'], name='fk_recordings_team'),
    )
    op.create_index('ix_recordings_device_name', 'recordings', ['device_name'])
    op.create_index('ix_recordings_status', 'recordings', ['status'])

    # --- Cloud Objects ---
    op.create_table(
        'cloud_objects',
        sa.Column('object_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('s3_key', sa.String(1024), unique=True, nullable=False),
        sa.Column('bucket', sa.String(256), nullable=False),
        sa.Column('content_type', sa.String(128), nullable=False, server_default='application/octet-stream'),
        sa.Column('size_bytes', sa.BigInteger, nullable=True),
        sa.Column('object_type', sa.String(64), nullable=False),
        sa.Column('source_id', UUID(as_uuid=True), nullable=True),
        sa.Column('user_id', UUID(as_uuid=True), nullable=True),
        sa.Column('team_id', UUID(as_uuid=True), nullable=True),
        sa.Column('status', sa.String(32), nullable=False, server_default='uploading'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], name='fk_cloud_objects_user'),
        sa.ForeignKeyConstraint(['team_id'], ['teams.team_id'], name='fk_cloud_objects_team'),
    )
    op.create_index('ix_cloud_objects_object_type', 'cloud_objects', ['object_type'])
    op.create_index('ix_cloud_objects_status', 'cloud_objects', ['status'])


def downgrade() -> None:
    op.drop_table('cloud_objects')
    op.drop_table('recordings')
