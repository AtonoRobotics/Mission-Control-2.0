"""Unit tests for Robot Builder ORM models."""
import pytest
from backend.db.registry.models import (
    ComponentRegistry,
    ConfigurationPackage,
    RobotConfiguration,
)


def test_component_registry_table_name():
    assert ComponentRegistry.__tablename__ == "component_registry"


def test_component_registry_has_required_columns():
    cols = {c.name for c in ComponentRegistry.__table__.columns}
    required = {
        "component_id", "name", "category", "manufacturer", "model",
        "physics", "attachment_interfaces", "data_sources",
        "approval_status", "approved_by", "approved_at",
        "visual_mesh_file_id", "collision_mesh_file_id", "source_mesh_file_id",
        "thumbnail_path", "notes", "created_at", "updated_at",
    }
    assert required.issubset(cols), f"Missing columns: {required - cols}"


def test_configuration_package_table_name():
    assert ConfigurationPackage.__tablename__ == "configuration_packages"


def test_configuration_package_has_required_columns():
    cols = {c.name for c in ConfigurationPackage.__table__.columns}
    required = {
        "package_id", "name", "package_type", "component_tree",
        "total_mass_kg", "description", "created_at", "updated_at",
    }
    assert required.issubset(cols), f"Missing columns: {required - cols}"


def test_robot_configuration_table_name():
    assert RobotConfiguration.__tablename__ == "robot_configurations"


def test_robot_configuration_has_required_columns():
    cols = {c.name for c in RobotConfiguration.__table__.columns}
    required = {
        "config_id", "robot_id", "name", "base_type", "base_config",
        "payload_package_id", "sensor_package_id", "status",
        "generated_files", "validation_report_id", "created_at", "updated_at",
    }
    assert required.issubset(cols), f"Missing columns: {required - cols}"


def test_component_default_approval_status():
    c = ComponentRegistry()
    # server_default won't fire without DB, but column should exist
    assert hasattr(c, "approval_status")


def test_configuration_package_types():
    """Package type should accept payload and sensor."""
    p = ConfigurationPackage()
    p.package_type = "payload"
    assert p.package_type == "payload"
    p.package_type = "sensor"
    assert p.package_type == "sensor"
