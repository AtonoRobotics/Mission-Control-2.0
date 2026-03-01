"""
Registry Database — Initial Schema
Mission Control Registry: builds, files, workflows, agents, datasets, compute.

Revision: 0001
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:

    # --- File Registry ---
    op.create_table(
        'file_registry',
        sa.Column('file_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('file_type', sa.String(64), nullable=False),
        sa.Column('robot_id', sa.Integer, nullable=True),
        sa.Column('scene_id', UUID(as_uuid=True), nullable=True),
        sa.Column('version', sa.String(32), nullable=False),
        sa.Column('file_hash', sa.String(64), nullable=False),
        sa.Column('file_path', sa.String(1024), nullable=False),
        sa.Column('build_id', UUID(as_uuid=True), nullable=True),
        sa.Column('null_fields', JSONB, nullable=True),
        sa.Column('status', sa.String(32), nullable=False, server_default='draft'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.Column('promoted_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('promoted_by', sa.String(256), nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
    )
    op.create_check_constraint(
        'file_status_valid',
        'file_registry',
        "status IN ('draft', 'validated', 'promoted', 'deprecated', 'failed')",
    )

    # --- Build Logs ---
    op.create_table(
        'build_logs',
        sa.Column('build_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('process', sa.String(64), nullable=False),
        sa.Column('robot_id', sa.Integer, nullable=True),
        sa.Column('status', sa.String(32), nullable=False, server_default='pending'),
        sa.Column('steps', JSONB, nullable=False, server_default='[]'),
        sa.Column('null_report', JSONB, nullable=False, server_default='[]'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
    )

    # --- Agent Logs ---
    op.create_table(
        'agent_logs',
        sa.Column('log_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('agent_name', sa.String(128), nullable=False),
        sa.Column('agent_type', sa.String(32), nullable=False),
        sa.Column('build_id', UUID(as_uuid=True), nullable=True),
        sa.Column('status', sa.String(32), nullable=False),
        sa.Column('input_params', JSONB, nullable=True),
        sa.Column('output', JSONB, nullable=True),
        sa.Column('error', sa.Text, nullable=True),
        sa.Column('duration_ms', sa.Float, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
    )

    # --- Scene Registry ---
    op.create_table(
        'scene_registry',
        sa.Column('scene_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(256), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('usd_stage_file_id', UUID(as_uuid=True), nullable=True),
        sa.Column('world_config_file_id', UUID(as_uuid=True), nullable=True),
        sa.Column('robot_ids', JSONB, nullable=False, server_default='[]'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
    )

    # --- Workflow Graphs ---
    op.create_table(
        'workflow_graphs',
        sa.Column('graph_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(256), nullable=False),
        sa.Column('version', sa.String(32), nullable=False, server_default='1.0.0'),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('graph_json', JSONB, nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.Column('created_by', sa.String(256), nullable=True),
    )

    # --- Workflow Runs ---
    op.create_table(
        'workflow_runs',
        sa.Column('run_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('graph_id', UUID(as_uuid=True), nullable=False),
        sa.Column('graph_name', sa.String(256), nullable=False),
        sa.Column('status', sa.String(32), nullable=False, server_default='running'),
        sa.Column('node_results', JSONB, nullable=False, server_default='{}'),
        sa.Column('started_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
    )

    # --- Dataset Registry ---
    op.create_table(
        'dataset_registry',
        sa.Column('dataset_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(256), nullable=False),
        sa.Column('version', sa.String(32), nullable=False),
        sa.Column('source_bag_paths', JSONB, nullable=False, server_default='[]'),
        sa.Column('robot_id', sa.Integer, nullable=True),
        sa.Column('scene_id', UUID(as_uuid=True), nullable=True),
        sa.Column('labels', JSONB, nullable=False, server_default='[]'),
        sa.Column('split', JSONB, nullable=True),
        sa.Column('size_bytes', sa.BigInteger, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
    )

    # --- Compute Snapshots ---
    op.create_table(
        'compute_snapshots',
        sa.Column('snapshot_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('host', sa.String(256), nullable=False),
        sa.Column('timestamp', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.Column('gpu_stats', JSONB, nullable=False, server_default='[]'),
        sa.Column('cpu_percent', sa.Float, nullable=True),
        sa.Column('memory_used_gb', sa.Float, nullable=True),
        sa.Column('memory_total_gb', sa.Float, nullable=True),
        sa.Column('disk_used_gb', sa.Float, nullable=True),
        sa.Column('disk_total_gb', sa.Float, nullable=True),
    )

    # --- ROS2 Parameter Snapshots ---
    op.create_table(
        'ros2_param_snapshots',
        sa.Column('snapshot_id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('node_name', sa.String(256), nullable=False),
        sa.Column('params', JSONB, nullable=False),
        sa.Column('captured_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.Column('captured_by', sa.String(256), nullable=True),
    )

    # Indexes
    op.create_index('ix_file_registry_robot_id', 'file_registry', ['robot_id'])
    op.create_index('ix_file_registry_status', 'file_registry', ['status'])
    op.create_index('ix_file_registry_file_type', 'file_registry', ['file_type'])
    op.create_index('ix_workflow_runs_graph_id', 'workflow_runs', ['graph_id'])
    op.create_index('ix_agent_logs_agent_name', 'agent_logs', ['agent_name'])
    op.create_index('ix_compute_snapshots_host_ts', 'compute_snapshots', ['host', 'timestamp'])


def downgrade() -> None:
    op.drop_table('ros2_param_snapshots')
    op.drop_table('compute_snapshots')
    op.drop_table('dataset_registry')
    op.drop_table('workflow_runs')
    op.drop_table('workflow_graphs')
    op.drop_table('scene_registry')
    op.drop_table('agent_logs')
    op.drop_table('build_logs')
    op.drop_table('file_registry')
