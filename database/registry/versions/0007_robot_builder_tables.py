"""Robot Builder tables: component_registry, configuration_packages, robot_configurations."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0007"
down_revision = "0006"


def _table_exists(name):
    from sqlalchemy import inspect
    bind = op.get_bind()
    return inspect(bind).has_table(name)


def upgrade():
    if _table_exists("component_registry"):
        return  # Tables already created outside Alembic

    op.create_table(
        "component_registry",
        sa.Column("component_id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.VARCHAR(256), nullable=False),
        sa.Column("category", sa.VARCHAR(64), nullable=False),
        sa.Column("manufacturer", sa.VARCHAR(256)),
        sa.Column("model", sa.VARCHAR(256)),
        sa.Column("physics", JSONB),
        sa.Column("attachment_interfaces", JSONB),
        sa.Column("data_sources", JSONB),
        sa.Column("mesh_variants", JSONB),
        sa.Column("approval_status", sa.VARCHAR(32), nullable=False, server_default="pending"),
        sa.Column("approved_by", sa.VARCHAR(256)),
        sa.Column("approved_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("notes", sa.TEXT),
        sa.Column("created_at", sa.TIMESTAMP, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP, server_default=sa.text("now()")),
    )
    op.create_index("ix_component_registry_category", "component_registry", ["category"])
    op.create_index("ix_component_registry_approval_status", "component_registry", ["approval_status"])

    op.create_table(
        "configuration_packages",
        sa.Column("package_id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.VARCHAR(256), nullable=False),
        sa.Column("package_type", sa.VARCHAR(32), nullable=False),
        sa.Column("component_ids", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("tree_json", JSONB, nullable=False),
        sa.Column("total_mass_kg", sa.FLOAT),
        sa.Column("description", sa.TEXT),
        sa.Column("created_at", sa.TIMESTAMP, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP, server_default=sa.text("now()")),
    )
    op.create_index("ix_configuration_packages_package_type", "configuration_packages", ["package_type"])

    op.create_table(
        "robot_configurations",
        sa.Column("config_id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("robot_id", sa.VARCHAR(128), sa.ForeignKey("robots.robot_id"), nullable=False),
        sa.Column("name", sa.VARCHAR(256), nullable=False),
        sa.Column("base_type", sa.VARCHAR(32), nullable=False, server_default="fixed"),
        sa.Column("base_config", JSONB),
        sa.Column("payload_package_id", UUID(as_uuid=True), sa.ForeignKey("configuration_packages.package_id")),
        sa.Column("sensor_package_id", UUID(as_uuid=True), sa.ForeignKey("configuration_packages.package_id")),
        sa.Column("generated_files", JSONB),
        sa.Column("build_status", sa.VARCHAR(32), nullable=False, server_default="draft"),
        sa.Column("build_log", JSONB),
        sa.Column("notes", sa.TEXT),
        sa.Column("created_at", sa.TIMESTAMP, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP, server_default=sa.text("now()")),
    )
    op.create_index("ix_robot_configurations_robot_id", "robot_configurations", ["robot_id"])
    op.create_index("ix_robot_configurations_build_status", "robot_configurations", ["build_status"])


def downgrade():
    op.drop_index("ix_robot_configurations_build_status", table_name="robot_configurations")
    op.drop_index("ix_robot_configurations_robot_id", table_name="robot_configurations")
    op.drop_table("robot_configurations")

    op.drop_index("ix_configuration_packages_package_type", table_name="configuration_packages")
    op.drop_table("configuration_packages")

    op.drop_index("ix_component_registry_approval_status", table_name="component_registry")
    op.drop_index("ix_component_registry_category", table_name="component_registry")
    op.drop_table("component_registry")
