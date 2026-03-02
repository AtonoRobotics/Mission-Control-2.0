"""
Mission Control API — Isaac Sim Status Routes
Static placeholder — Isaac Sim runs in a container and is not always active.
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class IsaacStatus(BaseModel):
    running: bool
    version: str | None = None
    detail: str


@router.get("/status", response_model=IsaacStatus)
async def isaac_status():
    return IsaacStatus(
        running=False,
        version=None,
        detail="Isaac Sim status requires container inspection — use /api/containers",
    )
