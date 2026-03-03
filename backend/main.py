"""
Mission Control — FastAPI Application
Cinema Robot Digital Twin Infrastructure Backend

Startup sequence:
  1. Integrity checks — CRITICAL failures block startup entirely
  2. Database engine initialization
  3. RosBridge connection (best-effort — DB works without ROS)
  4. Accept requests
"""

import structlog
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.settings import get_settings
from core.integrity import run_startup_integrity_check, has_critical_failures
from db.session import init_engines, dispose_engines, get_registry_engine, get_empirical_engine
from rosbridge.client import RosBridgeClient
from api import auth, users, ros2, isaac, containers, registry, builds, workflows, agents, compute, empirical, pipelines, recordings, cloud, layouts

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

    # ── Database engines ──────────────────────────────────────────────────────
    try:
        init_engines()
        # Verify connectivity with a simple query
        from sqlalchemy import text
        registry_engine = get_registry_engine()
        empirical_engine = get_empirical_engine()
        async with registry_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        async with empirical_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        app.state.db_status = "connected"
        logger.info("database_engines_ready")
    except Exception as e:
        app.state.db_status = f"error: {e}"
        logger.error("database_init_failed", error=str(e))
        # DB failure is fatal — cannot serve registry/build APIs without it
        sys.exit(1)

    # ── RosBridge (best-effort) ───────────────────────────────────────────────
    app.state.rosbridge = RosBridgeClient(url=settings.rosbridge_url)
    try:
        await app.state.rosbridge.connect()
        app.state.rosbridge_status = "connected"
    except Exception as e:
        app.state.rosbridge_status = f"disconnected: {e}"
        logger.warning("rosbridge_connect_failed", error=str(e),
                       hint="Backend will serve DB-backed endpoints without ROS.")

    logger.info("mission_control_ready", host=settings.MC_HOST_PRIMARY)

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    try:
        await app.state.rosbridge.disconnect()
    except Exception:
        pass
    await dispose_engines()
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

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(ros2.router, prefix="/api/ros2", tags=["ROS2"])
app.include_router(isaac.router, prefix="/api/isaac", tags=["Isaac"])
app.include_router(containers.router, prefix="/api/containers", tags=["Containers"])
app.include_router(registry.router, prefix="/api/registry", tags=["Registry"])
app.include_router(builds.router, prefix="/api/builds", tags=["Builds"])
app.include_router(workflows.router, prefix="/api/workflows", tags=["Workflows"])
app.include_router(agents.router, prefix="/api/agents", tags=["Agents"])
app.include_router(compute.router, prefix="/api/compute", tags=["Compute"])
app.include_router(empirical.router, prefix="/api/empirical", tags=["Empirical"])
app.include_router(pipelines.router, prefix="/api/pipelines", tags=["Pipelines"])
app.include_router(recordings.router, prefix="/api/recordings", tags=["Recordings"])
app.include_router(cloud.router, prefix="/api/cloud", tags=["Cloud"])
app.include_router(layouts.router, prefix="/api/layouts", tags=["Layouts"])


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "mission-control-backend",
        "db": getattr(app.state, "db_status", "unknown"),
        "rosbridge": getattr(app.state, "rosbridge_status", "unknown"),
    }


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
