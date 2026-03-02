"""
Add remaining registry tables: robots, urdf_registry, usd_registry,
sensor_configs, launch_templates, workflow_run_logs.

Revision: 0002
Revises: 0001
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:

    # --- Robots ---
    op.create_table(
        'robots',
        sa.Column('robot_id', sa.String(128), primary_key=True),
        sa.Column('name', sa.String(256), nullable=False),
        sa.Column('manufacturer', sa.String(256), nullable=True),
        sa.Column('model', sa.String(256), nullable=True),
        sa.Column('dof', sa.Integer, nullable=True),
        sa.Column('payload_kg', sa.Float, nullable=True),
        sa.Column('reach_mm', sa.Float, nullable=True),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('metadata', JSONB, nullable=False, server_default='{}'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
    )

    # --- URDF Registry ---
    op.create_table(
        'urdf_registry',
        sa.Column('urdf_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('robot_id', sa.String(128), nullable=False),
        sa.Column('version', sa.String(32), nullable=False),
        sa.Column('file_id', UUID(as_uuid=True), nullable=True),
        sa.Column('joint_count', sa.Integer, nullable=True),
        sa.Column('link_count', sa.Integer, nullable=True),
        sa.Column('null_fields', JSONB, nullable=True),
        sa.Column('status', sa.String(32), nullable=False, server_default='draft'),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['robot_id'], ['robots.robot_id'], name='fk_urdf_robot'),
    )
    op.create_index('ix_urdf_registry_robot_id', 'urdf_registry', ['robot_id'])

    # --- USD Registry ---
    op.create_table(
        'usd_registry',
        sa.Column('usd_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('robot_id', sa.String(128), nullable=False),
        sa.Column('source_urdf_id', UUID(as_uuid=True), nullable=True),
        sa.Column('version', sa.String(32), nullable=False),
        sa.Column('file_id', UUID(as_uuid=True), nullable=True),
        sa.Column('articulation_valid', sa.Boolean, nullable=True),
        sa.Column('joint_count', sa.Integer, nullable=True),
        sa.Column('conversion_log', JSONB, nullable=True),
        sa.Column('status', sa.String(32), nullable=False, server_default='draft'),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['robot_id'], ['robots.robot_id'], name='fk_usd_robot'),
    )
    op.create_index('ix_usd_registry_robot_id', 'usd_registry', ['robot_id'])

    # --- Sensor Configs ---
    op.create_table(
        'sensor_configs',
        sa.Column('config_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('sensor_id', sa.String(128), nullable=False),
        sa.Column('sensor_type', sa.String(64), nullable=False),
        sa.Column('robot_id', sa.String(128), nullable=True),
        sa.Column('setup_id', sa.String(128), nullable=True),
        sa.Column('file_id', UUID(as_uuid=True), nullable=True),
        sa.Column('calibration_status', sa.String(32), nullable=False, server_default='uncalibrated'),
        sa.Column('null_fields', JSONB, nullable=True),
        sa.Column('topic_names', JSONB, nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_sensor_configs_robot_id', 'sensor_configs', ['robot_id'])

    # --- Launch Templates ---
    op.create_table(
        'launch_templates',
        sa.Column('template_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(256), nullable=False),
        sa.Column('pipeline_type', sa.String(64), nullable=False),
        sa.Column('robot_id', sa.String(128), nullable=True),
        sa.Column('file_id', UUID(as_uuid=True), nullable=True),
        sa.Column('node_list', JSONB, nullable=False, server_default='[]'),
        sa.Column('topic_connectivity', JSONB, nullable=True),
        sa.Column('null_fields', JSONB, nullable=True),
        sa.Column('status', sa.String(32), nullable=False, server_default='draft'),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_launch_templates_robot_id', 'launch_templates', ['robot_id'])

    # --- Workflow Run Logs ---
    op.create_table(
        'workflow_run_logs',
        sa.Column('log_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('run_id', UUID(as_uuid=True), nullable=False),
        sa.Column('node_name', sa.String(256), nullable=False),
        sa.Column('status', sa.String(32), nullable=False),
        sa.Column('input_data', JSONB, nullable=True),
        sa.Column('output_data', JSONB, nullable=True),
        sa.Column('error', sa.Text, nullable=True),
        sa.Column('duration_ms', sa.Float, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_workflow_run_logs_run_id', 'workflow_run_logs', ['run_id'])


def downgrade() -> None:
    op.drop_table('workflow_run_logs')
    op.drop_table('launch_templates')
    op.drop_table('sensor_configs')
    op.drop_table('usd_registry')
    op.drop_table('urdf_registry')
    op.drop_table('robots')
