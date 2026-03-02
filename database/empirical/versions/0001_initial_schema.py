"""Empirical DB — Initial schema: 6 tables for robot physical truth.

Revision ID: 0001
Revises: None
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── robots ──────────────────────────────────────────────────────────────
    op.create_table(
        'robots',
        sa.Column('robot_id', sa.String(128), primary_key=True),
        sa.Column('name', sa.String(256), nullable=False),
        sa.Column('manufacturer', sa.String(256), nullable=True),
        sa.Column('model', sa.String(256), nullable=True),
        sa.Column('dof', sa.Integer, nullable=True),
        sa.Column('payload_kg', sa.Float, nullable=True),
        sa.Column('reach_mm', sa.Float, nullable=True),
        sa.Column('weight_kg', sa.Float, nullable=True),
        sa.Column('repeatability_mm', sa.Float, nullable=True),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('metadata', JSONB, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
    )

    # ── joint_specs ─────────────────────────────────────────────────────────
    op.create_table(
        'joint_specs',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('robot_id', sa.String(128), nullable=False),
        sa.Column('joint_name', sa.String(128), nullable=False),
        sa.Column('joint_type', sa.String(32), nullable=True),
        sa.Column('parent_link', sa.String(128), nullable=True),
        sa.Column('child_link', sa.String(128), nullable=True),
        sa.Column('origin_xyz', sa.String(128), nullable=True),
        sa.Column('origin_rpy', sa.String(128), nullable=True),
        sa.Column('axis', sa.String(64), nullable=True),
        sa.Column('lower_limit', sa.Float, nullable=True),
        sa.Column('upper_limit', sa.Float, nullable=True),
        sa.Column('effort_limit', sa.Float, nullable=True),
        sa.Column('velocity_limit', sa.Float, nullable=True),
        sa.Column('damping', sa.Float, nullable=True),
        sa.Column('friction', sa.Float, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.UniqueConstraint('robot_id', 'joint_name', name='uq_joint_robot_name'),
    )
    op.create_index('ix_joint_specs_robot_id', 'joint_specs', ['robot_id'])

    # ── link_specs ──────────────────────────────────────────────────────────
    op.create_table(
        'link_specs',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('robot_id', sa.String(128), nullable=False),
        sa.Column('link_name', sa.String(128), nullable=False),
        sa.Column('mass', sa.Float, nullable=True),
        sa.Column('inertia_ixx', sa.Float, nullable=True),
        sa.Column('inertia_ixy', sa.Float, nullable=True),
        sa.Column('inertia_ixz', sa.Float, nullable=True),
        sa.Column('inertia_iyy', sa.Float, nullable=True),
        sa.Column('inertia_iyz', sa.Float, nullable=True),
        sa.Column('inertia_izz', sa.Float, nullable=True),
        sa.Column('origin_xyz', sa.String(128), nullable=True),
        sa.Column('origin_rpy', sa.String(128), nullable=True),
        sa.Column('visual_mesh', sa.String(512), nullable=True),
        sa.Column('collision_mesh', sa.String(512), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.UniqueConstraint('robot_id', 'link_name', name='uq_link_robot_name'),
    )
    op.create_index('ix_link_specs_robot_id', 'link_specs', ['robot_id'])

    # ── collision_spheres ───────────────────────────────────────────────────
    op.create_table(
        'collision_spheres',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('robot_id', sa.String(128), nullable=False),
        sa.Column('link_name', sa.String(128), nullable=False),
        sa.Column('sphere_index', sa.Integer, nullable=False),
        sa.Column('center_x', sa.Float, nullable=True),
        sa.Column('center_y', sa.Float, nullable=True),
        sa.Column('center_z', sa.Float, nullable=True),
        sa.Column('radius', sa.Float, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.UniqueConstraint('robot_id', 'link_name', 'sphere_index', name='uq_sphere_robot_link_idx'),
    )
    op.create_index('ix_collision_spheres_robot_id', 'collision_spheres', ['robot_id'])

    # ── calibration_data ────────────────────────────────────────────────────
    op.create_table(
        'calibration_data',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('robot_id', sa.String(128), nullable=False),
        sa.Column('calibration_type', sa.String(64), nullable=False),
        sa.Column('sensor_id', sa.String(128), nullable=True),
        sa.Column('data', JSONB, nullable=True),
        sa.Column('calibrated_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_calibration_data_robot_id', 'calibration_data', ['robot_id'])

    # ── sensor_specs ────────────────────────────────────────────────────────
    op.create_table(
        'sensor_specs',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('robot_id', sa.String(128), nullable=False),
        sa.Column('sensor_id', sa.String(128), nullable=False),
        sa.Column('sensor_type', sa.String(64), nullable=True),
        sa.Column('model', sa.String(256), nullable=True),
        sa.Column('mount_link', sa.String(128), nullable=True),
        sa.Column('mount_offset_xyz', sa.String(128), nullable=True),
        sa.Column('mount_offset_rpy', sa.String(128), nullable=True),
        sa.Column('intrinsics', JSONB, nullable=True),
        sa.Column('extrinsics', JSONB, nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_sensor_specs_robot_id', 'sensor_specs', ['robot_id'])


def downgrade() -> None:
    op.drop_table('sensor_specs')
    op.drop_table('calibration_data')
    op.drop_table('collision_spheres')
    op.drop_table('link_specs')
    op.drop_table('joint_specs')
    op.drop_table('robots')
