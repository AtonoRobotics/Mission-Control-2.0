"""robot_builder_tables

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "component_registry",
        sa.Column("component_id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("manufacturer", sa.String(256), nullable=True),
        sa.Column("model", sa.String(256), nullable=True),
        sa.Column("physics", JSONB, nullable=False, server_default="{}"),
        sa.Column("attachment_interfaces", JSONB, nullable=False, server_default="[]"),
        sa.Column("data_sources", JSONB, nullable=False, server_default="[]"),
        sa.Column("approval_status", sa.String(32), nullable=False, server_default="pending_hit"),
        sa.Column("approved_by", sa.String(256), nullable=True),
        sa.Column("approved_at", sa.DateTime, nullable=True),
        sa.Column("visual_mesh_file_id", UUID(as_uuid=True), nullable=True),
        sa.Column("collision_mesh_file_id", UUID(as_uuid=True), nullable=True),
        sa.Column("source_mesh_file_id", UUID(as_uuid=True), nullable=True),
        sa.Column("thumbnail_path", sa.String(1024), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "configuration_packages",
        sa.Column("package_id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("package_type", sa.String(32), nullable=False),
        sa.Column("component_tree", JSONB, nullable=False, server_default="[]"),
        sa.Column("total_mass_kg", sa.Float, nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "robot_configurations",
        sa.Column("config_id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("robot_id", sa.String(128), sa.ForeignKey("robots.robot_id"), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("base_type", sa.String(32), nullable=False, server_default="standing"),
        sa.Column("base_config", JSONB, nullable=False, server_default="{}"),
        sa.Column("payload_package_id", UUID(as_uuid=True), nullable=True),
        sa.Column("sensor_package_id", UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("generated_files", JSONB, nullable=False, server_default="{}"),
        sa.Column("validation_report_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_index("ix_component_registry_category", "component_registry", ["category"])
    op.create_index("ix_component_registry_approval", "component_registry", ["approval_status"])
    op.create_index("ix_configuration_packages_type", "configuration_packages", ["package_type"])
    op.create_index("ix_robot_configurations_robot_id", "robot_configurations", ["robot_id"])


def downgrade() -> None:
    op.drop_index("ix_robot_configurations_robot_id")
    op.drop_index("ix_configuration_packages_type")
    op.drop_index("ix_component_registry_approval")
    op.drop_index("ix_component_registry_category")
    op.drop_table("robot_configurations")
    op.drop_table("configuration_packages")
    op.drop_table("component_registry")
