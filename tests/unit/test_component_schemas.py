"""Unit tests for Component API Pydantic schemas."""
import pytest
from pydantic import ValidationError


def test_component_create_minimal():
    from backend.api.components import ComponentCreate
    c = ComponentCreate(name="ARRI Alexa Mini LF", category="camera")
    assert c.name == "ARRI Alexa Mini LF"
    assert c.category == "camera"
    assert c.physics == {}
    assert c.attachment_interfaces == []


def test_component_create_full():
    from backend.api.components import ComponentCreate
    c = ComponentCreate(
        name="Signature Prime 35mm",
        category="lens",
        manufacturer="ARRI",
        model="Signature Prime 35mm T1.8",
        physics={"mass_kg": 1.8, "dimensions_mm": {"l": 141, "w": 100, "h": 100}},
        attachment_interfaces=[
            {"name": "lens_mount", "type": "pl_mount", "role": "provides"}
        ],
    )
    assert c.manufacturer == "ARRI"
    assert c.physics["mass_kg"] == 1.8


def test_component_create_requires_name():
    from backend.api.components import ComponentCreate
    with pytest.raises(ValidationError):
        ComponentCreate(category="camera")


def test_component_create_requires_category():
    from backend.api.components import ComponentCreate
    with pytest.raises(ValidationError):
        ComponentCreate(name="test")


def test_component_create_valid_categories():
    from backend.api.components import ComponentCreate, VALID_CATEGORIES
    assert "camera" in VALID_CATEGORIES
    assert "lens" in VALID_CATEGORIES
    assert "fiz" in VALID_CATEGORIES
    assert "base" in VALID_CATEGORIES


def test_component_out_has_all_fields():
    from backend.api.components import ComponentOut
    fields = set(ComponentOut.model_fields.keys())
    required = {
        "component_id", "name", "category", "manufacturer", "model",
        "physics", "attachment_interfaces", "data_sources",
        "approval_status", "approved_by", "approved_at",
        "visual_mesh_file_id", "collision_mesh_file_id", "source_mesh_file_id",
        "thumbnail_path", "notes", "created_at", "updated_at",
    }
    assert required.issubset(fields), f"Missing: {required - fields}"
