"""Integration test: build endpoint produces valid files from configuration."""
import pytest


@pytest.mark.asyncio
async def test_build_produces_urdf_and_usd():
    """End-to-end: configuration with approved components -> generated files."""
    # This test requires a running DB with test data
    # TODO: set up async test client with in-memory DB
    pass  # Placeholder — implement when async test fixtures are ready


def test_generator_wiring_importable():
    """Verify the config generator functions are importable from configurations module."""
    from backend.api.configurations import (
        generate_urdf_from_config,
        generate_usd_from_config,
        generate_curobo_yaml_from_config,
    )
    assert callable(generate_urdf_from_config)
    assert callable(generate_usd_from_config)
    assert callable(generate_curobo_yaml_from_config)


def test_researcher_importable():
    """Verify the component researcher is importable."""
    from backend.services.component_researcher import research_component_physics
    assert callable(research_component_physics)
