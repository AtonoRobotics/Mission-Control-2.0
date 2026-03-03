"""
OSMO Service — Async HTTP client for NVIDIA OSMO workflow orchestration.
Thin proxy: MC routes map to OSMO API endpoints with auth + local persistence.
"""

import structlog
import httpx
import yaml
from typing import Any

from core.settings import get_settings

logger = structlog.get_logger(__name__)


class OSMOClient:
    """Async HTTP client wrapping the OSMO v6 REST + CLI API."""

    def __init__(self, base_url: str, username: str = "testuser"):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self._jwt: str | None = None
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=30.0,
            headers={"Content-Type": "application/json"},
        )

    async def _ensure_auth(self) -> dict[str, str]:
        """Return headers with x-osmo-user for dev-mode auth."""
        return {"x-osmo-user": self.username}

    # -- Health ----------------------------------------------------------------

    async def version(self) -> dict:
        resp = await self._client.get("/api/version")
        resp.raise_for_status()
        return resp.json()

    async def health(self) -> dict:
        """Return OSMO service health + pool status."""
        try:
            version = await self.version()
            pools = await self.list_pools()
            return {
                "status": "connected",
                "version": f"{version['major']}.{version['minor']}.{version['revision']}",
                "pools": pools,
            }
        except Exception as e:
            return {"status": "unreachable", "error": str(e)}

    # -- Pools -----------------------------------------------------------------

    async def list_pools(self) -> dict:
        headers = await self._ensure_auth()
        resp = await self._client.get("/api/pool", headers=headers)
        resp.raise_for_status()
        return resp.json()

    # -- Workflows -------------------------------------------------------------

    async def submit_workflow(
        self, workflow_spec: dict, pool: str = "default"
    ) -> dict:
        """Submit a workflow YAML (as dict) to OSMO.

        OSMO v6 TemplateSpec expects {"file": "<yaml-string>"}, not raw JSON.
        The YAML must have a top-level 'workflow:' key wrapping the spec.
        """
        headers = await self._ensure_auth()
        # Ensure the spec is wrapped under 'workflow:' key
        if "workflow" not in workflow_spec:
            workflow_spec = {"workflow": workflow_spec}
        payload = {"file": yaml.dump(workflow_spec, default_flow_style=False)}
        resp = await self._client.post(
            f"/api/pool/{pool}/workflow",
            json=payload,
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json()

    async def submit_workflow_raw(
        self, yaml_string: str, pool: str = "default"
    ) -> dict:
        """Submit a workflow from a raw YAML string (already formatted)."""
        headers = await self._ensure_auth()
        payload = {"file": yaml_string}
        resp = await self._client.post(
            f"/api/pool/{pool}/workflow",
            json=payload,
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json()

    async def query_workflow(self, workflow_id: str) -> dict:
        headers = await self._ensure_auth()
        resp = await self._client.get(
            f"/api/workflow/{workflow_id}",
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json()

    async def list_workflows(
        self,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        headers = await self._ensure_auth()
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if status:
            params["status"] = status
        resp = await self._client.get(
            "/api/workflow",
            params=params,
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json()

    async def cancel_workflow(self, workflow_id: str) -> dict:
        headers = await self._ensure_auth()
        resp = await self._client.post(
            f"/api/workflow/{workflow_id}/cancel",
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json()

    async def workflow_logs(self, workflow_id: str) -> dict:
        """Get workflow logs — OSMO returns plain text, not JSON."""
        headers = await self._ensure_auth()
        resp = await self._client.get(
            f"/api/workflow/{workflow_id}/logs",
            headers=headers,
        )
        resp.raise_for_status()
        return {"workflow_id": workflow_id, "logs": resp.text}

    async def workflow_error_logs(self, workflow_id: str) -> dict:
        """Get workflow error logs — OSMO returns plain text, not JSON."""
        headers = await self._ensure_auth()
        resp = await self._client.get(
            f"/api/workflow/{workflow_id}/error_logs",
            headers=headers,
        )
        resp.raise_for_status()
        return {"workflow_id": workflow_id, "error_logs": resp.text}

    # -- Config ----------------------------------------------------------------

    async def get_workflow_config(self) -> dict:
        headers = await self._ensure_auth()
        resp = await self._client.get("/api/configs/workflow", headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def get_pool_config(self, pool_name: str = "default") -> dict:
        headers = await self._ensure_auth()
        resp = await self._client.get(
            f"/api/configs/pool/{pool_name}", headers=headers
        )
        resp.raise_for_status()
        return resp.json()

    # -- Cleanup ---------------------------------------------------------------

    async def close(self):
        await self._client.aclose()


# -- Singleton -----------------------------------------------------------------

_osmo_client: OSMOClient | None = None


def get_osmo_client() -> OSMOClient:
    global _osmo_client
    if _osmo_client is None:
        settings = get_settings()
        url = settings.MC_OSMO_URL
        if not url:
            raise RuntimeError(
                "MC_OSMO_URL not set. Configure OSMO endpoint in .env.machines"
            )
        _osmo_client = OSMOClient(base_url=url)
        logger.info("osmo_client_initialized", url=url)
    return _osmo_client
