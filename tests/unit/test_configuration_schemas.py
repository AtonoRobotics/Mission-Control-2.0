"""Unit tests for Robot Configuration API schemas."""
import pytest
from pydantic import ValidationError


def test_config_create_minimal():
    from backend.api.configurations import ConfigurationCreate
    c = ConfigurationCreate(name="CR10 Tabletop", base_type="standing")
    assert c.name == "CR10 Tabletop"
    assert c.base_config == {}


def test_config_create_with_packages():
    from backend.api.configurations import ConfigurationCreate
    c = ConfigurationCreate(
        name="CR10 Full Rig",
        base_type="track",
        base_config={"track_length_mm": 3000},
        payload_package_id="550e8400-e29b-41d4-a716-446655440000",
    )
    assert c.base_type == "track"
    assert c.base_config["track_length_mm"] == 3000


def test_config_create_valid_base_types():
    from backend.api.configurations import ConfigurationCreate, VALID_BASE_TYPES
    assert set(VALID_BASE_TYPES) == {"standing", "track", "track_weighted"}


def test_config_create_requires_name():
    from backend.api.configurations import ConfigurationCreate
    with pytest.raises(ValidationError):
        ConfigurationCreate(base_type="standing")


def test_config_out_has_generated_files():
    from backend.api.configurations import ConfigurationOut
    assert "generated_files" in ConfigurationOut.model_fields


def test_build_result_fields():
    from backend.api.configurations import BuildResult
    fields = set(BuildResult.model_fields.keys())
    assert {"config_id", "status", "generated_files", "errors"}.issubset(fields)
