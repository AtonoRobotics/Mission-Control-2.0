"""
Component Researcher — dispatches AI research agent to find physics data.
Results stored in ComponentRegistry, queued for HIT approval.
"""

import structlog

logger = structlog.get_logger(__name__)


async def research_component_physics(
    component_id: str,
    name: str,
    category: str,
    manufacturer: str | None = None,
    model: str | None = None,
) -> dict:
    """
    Dispatch research agent to find physics data for a component.
    Returns structured research results.

    In V1, this builds a research prompt and dispatches to agent__research.
    The agent searches:
      - Tier 1: NVIDIA Omniverse catalog, manufacturer datasheets
      - Tier 2: Cross-validated web sources
    """
    search_query = (
        f"{manufacturer or ''} {model or name} {category} "
        "specifications mass dimensions datasheet"
    ).strip()

    # TODO: dispatch to MCP agent__research
    # result = await mcp_client.call("agent__research", task=search_query)
    # parse result, extract physics fields, build data_sources list

    logger.info(
        "component_research_dispatched",
        component_id=component_id,
        query=search_query,
    )

    # Placeholder return — agent will populate via DB update
    return {
        "status": "dispatched",
        "component_id": component_id,
        "query": search_query,
    }
