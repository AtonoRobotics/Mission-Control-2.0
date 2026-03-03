"""
LLM-powered scene generation via Ollama (qwen2.5:72b on DGX Spark).

Reads the NVIDIA asset catalog, builds a compact system prompt,
and calls the Ollama OpenAI-compatible chat/completions endpoint.
Returns a SceneGenerateResponse-compatible dict.
"""

import json
import uuid
from pathlib import Path
from typing import Any

import httpx
import structlog
from fastapi import HTTPException

logger = structlog.get_logger(__name__)

# Module-level cache for the asset catalog
_catalog_cache: dict[str, Any] | None = None

CATALOG_PATH = Path(__file__).resolve().parent.parent.parent / "packages" / "web" / "public" / "nvidia-assets.json"


async def _load_nvidia_catalog() -> dict[str, Any]:
    """Load and cache the NVIDIA asset catalog from the frontend public dir."""
    global _catalog_cache
    if _catalog_cache is not None:
        return _catalog_cache

    try:
        text = CATALOG_PATH.read_text()
        _catalog_cache = json.loads(text)
        logger.info("nvidia_catalog_loaded", path=str(CATALOG_PATH), categories=list(_catalog_cache.get("categories", {}).keys()))
        return _catalog_cache
    except Exception as exc:
        logger.error("nvidia_catalog_load_failed", error=str(exc))
        raise HTTPException(status_code=503, detail=f"Failed to load asset catalog: {exc}")


def _build_asset_summary(catalog: dict[str, Any]) -> str:
    """Convert the catalog into a compact text list grouped by category."""
    lines: list[str] = []
    categories = catalog.get("categories", {})
    for category, assets in categories.items():
        lines.append(f"\n## {category.upper()}")
        for asset in assets:
            lines.append(f"- {asset['id']} — {asset['label']}")
    return "\n".join(lines)


def _build_system_prompt(asset_summary: str, robot_dict: dict[str, Any]) -> str:
    """Build the full system prompt with schema, assets, robot info, and rules."""
    return f"""You are a robotics simulation scene designer. Given a user's description, you generate a scene layout as JSON.

## OUTPUT FORMAT — strict JSON, no markdown, no explanation

Return EXACTLY this structure:
{{
  "name": "<scene name>",
  "description": "<1-sentence description>",
  "physics_dt": 0.016667,
  "render_dt": 0.016667,
  "gravity": [0, 0, -9.81],
  "num_envs": <int or null>,
  "env_spacing": <float or null>,
  "placements": [
    {{
      "id": "<unique uuid>",
      "asset_id": "<from catalog below>",
      "asset_source": "nvidia",
      "asset_type": "<environment|robot|object|sensor|light>",
      "label": "<human-readable name>",
      "position": {{"x": 0, "y": 0, "z": 0}},
      "rotation": {{"x": 0, "y": 0, "z": 0}},
      "scale": {{"x": 1, "y": 1, "z": 1}},
      "physics_enabled": <true for graspable objects, false for static>,
      "is_global": <true for lights/cameras, false otherwise>,
      "properties": {{}}
    }}
  ]
}}

## AVAILABLE ASSETS (use ONLY these asset_id values)
{asset_summary}

## ROBOT INFO
- robot_id: {robot_dict.get('robot_id', 'unknown')}
- name: {robot_dict.get('name', 'Unknown Robot')}
- reach_mm: {robot_dict.get('reach_mm', 'unknown')}
- dof: {robot_dict.get('dof', 'unknown')}
- payload_kg: {robot_dict.get('payload_kg', 'unknown')}

## RULES
1. Output ONLY valid JSON. No markdown fences, no commentary.
2. Every asset_id MUST come from the catalog above. Do not invent IDs.
3. The user's robot MUST use asset_id="{robot_dict.get('robot_id', 'unknown')}", asset_source="registry", asset_type="robot", position (0,0,0). Do NOT use robot assets from the catalog for this — those are other robots.
4. Always include at least one light (dome or distant).
5. Coordinate system is Z-up. Ground plane is z=0. Place objects on surfaces, not floating.
6. Use realistic spacing — objects within the robot's reach ({robot_dict.get('reach_mm', 1000)}mm).
7. Generate a unique UUID for each placement's "id" field.
8. For manipulation tasks, set num_envs to 32 and env_spacing to 2.5.
9. For navigation tasks, spread obstacles across a larger area (5-10m range).
10. physics_enabled=true for objects the robot should interact with, false for static furniture/environment."""


async def generate_scene_with_llm(
    prompt: str,
    task_type: str,
    environment_style: str | None,
    robot_dict: dict[str, Any],
    settings: Any,
) -> dict[str, Any]:
    """Call Ollama to generate a scene layout from a natural language prompt.

    Returns a dict matching SceneGenerateResponse schema.
    Raises HTTPException(503) on timeout, connection, or parse errors.
    """
    catalog = await _load_nvidia_catalog()
    asset_summary = _build_asset_summary(catalog)
    system_prompt = _build_system_prompt(asset_summary, robot_dict)

    user_message = f"Task type: {task_type}\n"
    if environment_style:
        user_message += f"Environment style: {environment_style}\n"
    user_message += f"Scene description: {prompt}"

    payload = {
        "model": settings.MC_OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
    }

    url = f"{settings.MC_OLLAMA_BASE_URL}/chat/completions"
    logger.info("llm_scene_generate_start", model=settings.MC_OLLAMA_MODEL, prompt_len=len(prompt))

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(settings.MC_OLLAMA_TIMEOUT, connect=10.0)) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
    except httpx.TimeoutException:
        logger.error("llm_scene_timeout", timeout=settings.MC_OLLAMA_TIMEOUT)
        raise HTTPException(status_code=503, detail=f"LLM timed out after {settings.MC_OLLAMA_TIMEOUT}s. Try a simpler prompt.")
    except httpx.ConnectError:
        logger.error("llm_scene_connect_error", url=url)
        raise HTTPException(status_code=503, detail=f"Cannot reach Ollama at {settings.MC_OLLAMA_BASE_URL}. Is DGX Spark online?")
    except httpx.HTTPStatusError as exc:
        logger.error("llm_scene_http_error", status=exc.response.status_code, body=exc.response.text[:500])
        raise HTTPException(status_code=503, detail=f"Ollama returned {exc.response.status_code}")

    # Parse the LLM response
    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        scene = json.loads(content)
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        logger.error("llm_scene_parse_error", error=str(exc), raw=resp.text[:500])
        raise HTTPException(status_code=503, detail=f"LLM returned invalid JSON: {exc}")

    # Validate required keys
    if "placements" not in scene:
        raise HTTPException(status_code=503, detail="LLM response missing 'placements' key")
    if "name" not in scene:
        scene["name"] = f"{task_type.replace('_', ' ').title()} Scene"

    # Ensure each placement has an id
    for p in scene["placements"]:
        if "id" not in p or not p["id"]:
            p["id"] = str(uuid.uuid4())

    logger.info("llm_scene_generate_done", name=scene["name"], placement_count=len(scene["placements"]))
    return scene
