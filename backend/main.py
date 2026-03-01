"""
Mission Control — FastAPI Application
Cinema Robot Digital Twin Infrastructure Backend

Startup sequence:
  1. Integrity checks — CRITICAL failures block startup entirely
  2. RosBridge connection
  3. Accept requests
"""

import structlog
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.settings import get_settings
from core.integrity import run_startup_integrity_check, has_critical_failures
from rosbridge.client import RosBridgeClient
from api import ros2, isaac, containers, registry, builds, workflows, agents, compute

logger = structlog.get_logger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Integrity gate — blocks startup on CRITICAL failures ──────────────────
    failures = run_startup_integrity_check()
    if has_critical_failures(failures):
        logger.critical(
            "startup_blocked",
            failure_count=len(failures),
            message="Fix all CRITICAL integrity failures before restarting.",
        )
        sys.exit(1)

    if failures:
        logger.warning("startup_integrity_warnings", count=len(failures))

    # ── RosBridge ─────────────────────────────────────────────────────────────
    app.state.rosbridge = RosBridgeClient(url=settings.rosbridge_url)
    await app.state.rosbridge.connect()
    logger.info("mission_control_ready", host=settings.MC_HOST_PRIMARY)

    yield

    await app.state.rosbridge.disconnect()
    logger.info("mission_control_shutdown")


app = FastAPI(
    title="Mission Control",
    description="Cinema Robot Digital Twin Infrastructure",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"http://localhost:{settings.MC_UI_PORT}"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ros2.router, prefix="/api/ros2", tags=["ROS2"])
app.include_router(isaac.router, prefix="/api/isaac", tags=["Isaac"])
app.include_router(containers.router, prefix="/api/containers", tags=["Containers"])
app.include_router(registry.router, prefix="/api/registry", tags=["Registry"])
app.include_router(builds.router, prefix="/api/builds", tags=["Builds"])
app.include_router(workflows.router, prefix="/api/workflows", tags=["Workflows"])
app.include_router(agents.router, prefix="/api/agents", tags=["Agents"])
app.include_router(compute.router, prefix="/api/compute", tags=["Compute"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "mission-control-backend"}


@app.get("/integrity")
async def integrity_status() -> dict:
    """Live integrity check — callable by monitoring / health dashboards."""
    failures = run_startup_integrity_check()
    return {
        "status": "ok" if not has_critical_failures(failures) else "degraded",
        "failure_count": len(failures),
        "failures": [
            {
                "layer": f.layer,
                "rule": f.rule,
                "severity": f.severity,
                "detail": f.detail,
            }
            for f in failures
        ],
    }
