"""Unit tests for Configuration Package API schemas."""
import pytest
from pydantic import ValidationError


def test_package_create_minimal():
    from backend.api.packages import PackageCreate
    p = PackageCreate(name="ARRI Alexa Mini Payload", package_type="payload")
    assert p.name == "ARRI Alexa Mini Payload"
    assert p.component_tree == []


def test_package_create_with_tree():
    from backend.api.packages import PackageCreate
    p = PackageCreate(
        name="ARRI Alexa Mini Payload",
        package_type="payload",
        component_tree=[
            {
                "component_id": "550e8400-e29b-41d4-a716-446655440000",
                "attach_to": "ee_flange",
                "joint_config": {"type": "fixed", "origin_xyz": [0, 0, 0.05]},
            }
        ],
    )
    assert len(p.component_tree) == 1


def test_package_create_requires_name():
    from backend.api.packages import PackageCreate
    with pytest.raises(ValidationError):
        PackageCreate(package_type="payload")


def test_package_create_requires_type():
    from backend.api.packages import PackageCreate
    with pytest.raises(ValidationError):
        PackageCreate(name="test")


def test_package_out_fields():
    from backend.api.packages import PackageOut
    fields = set(PackageOut.model_fields.keys())
    assert {"package_id", "name", "package_type", "component_tree", "total_mass_kg"}.issubset(fields)
