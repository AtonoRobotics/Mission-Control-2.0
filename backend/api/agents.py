"""
Mission Control API — Agent Log Routes
Paginated agent logs, detail view, and aggregated summary.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from db.registry.models import AgentLog
from db.session import get_registry_session

logger = structlog.get_logger(__name__)
router = APIRouter()


# =============================================================================
# Pydantic Schemas
# =============================================================================


class AgentLogOut(BaseModel):
    log_id: UUID
    agent_name: str
    agent_type: str
    build_id: Optional[UUID]
    status: str
    input_params: Optional[dict]
    output: Optional[dict]
    error: Optional[str]
    duration_ms: Optional[float]
    duration_s: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    def model_post_init(self, __context):
        if self.duration_ms is not None and self.duration_s is None:
            self.duration_s = round(self.duration_ms / 1000, 2)


class AgentSummaryOut(BaseModel):
    agent_name: str
    total_runs: int
    success_rate: Optional[float]
    avg_duration: Optional[float]


# =============================================================================
# Endpoints
# =============================================================================


@router.get("/logs", response_model=list[AgentLogOut])
async def list_agent_logs(
    agent_name: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    build_id: Optional[UUID] = Query(None),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_registry_session),
):
    stmt = select(AgentLog).order_by(AgentLog.created_at.desc())
    if agent_name:
        stmt = stmt.where(AgentLog.agent_name == agent_name)
    if status:
        stmt = stmt.where(AgentLog.status == status)
    if build_id:
        stmt = stmt.where(AgentLog.build_id == build_id)
    stmt = stmt.limit(limit).offset(offset)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/logs/{log_id}", response_model=AgentLogOut)
async def get_agent_log(
    log_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(AgentLog).where(AgentLog.log_id == log_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Agent log not found")
    return entry


@router.get("/summary", response_model=list[AgentSummaryOut])
async def agent_summary(
    session: AsyncSession = Depends(get_registry_session),
):
    stmt = (
        select(
            AgentLog.agent_name,
            sa_func.count().label("total"),
            sa_func.count()
            .filter(AgentLog.status == "success")
            .label("succeeded"),
            sa_func.count()
            .filter(AgentLog.status == "error")
            .label("failed"),
            sa_func.avg(AgentLog.duration_ms).label("avg_duration_ms"),
        )
        .group_by(AgentLog.agent_name)
        .order_by(AgentLog.agent_name)
    )
    result = await session.execute(stmt)
    rows = result.all()
    return [
        AgentSummaryOut(
            agent_name=r.agent_name,
            total_runs=r.total,
            success_rate=round(r.succeeded / r.total, 2) if r.total > 0 else None,
            avg_duration=round(r.avg_duration_ms / 1000, 2) if r.avg_duration_ms else None,
        )
        for r in rows
    ]
