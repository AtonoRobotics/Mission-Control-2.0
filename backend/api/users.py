"""
Mission Control API — User & Team Management Routes
CRUD operations for users and teams with role-based access control.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.registry.models import User, Team
from db.session import get_registry_session
from middleware.auth import require_role

logger = structlog.get_logger(__name__)
router = APIRouter()


# =============================================================================
# Pydantic Schemas
# =============================================================================


class UserOut(BaseModel):
    user_id: UUID
    email: str
    display_name: str
    avatar_url: Optional[str] = None
    auth_provider: str
    role: str
    team_id: Optional[UUID] = None
    created_at: datetime
    last_login: Optional[datetime] = None

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    role: Optional[str] = None
    team_id: Optional[UUID] = None


class TeamCreate(BaseModel):
    name: str


class TeamOut(BaseModel):
    team_id: UUID
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TeamUpdate(BaseModel):
    name: str


# =============================================================================
# Team Endpoints (MUST be before /{user_id} to avoid route conflict)
# =============================================================================


@router.post("/teams", response_model=TeamOut, status_code=201)
async def create_team(
    body: TeamCreate,
    current_user: User = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_registry_session),
):
    """Create a new team (admin only)."""
    result = await session.execute(select(Team).where(Team.name == body.name))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Team name already exists")

    team = Team(name=body.name)
    session.add(team)
    await session.flush()
    await session.refresh(team)
    return team


@router.get("/teams", response_model=list[TeamOut])
async def list_teams(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_registry_session),
):
    """List all teams. Any authenticated user can view."""
    result = await session.execute(select(Team).order_by(Team.name))
    return result.scalars().all()


@router.patch("/teams/{team_id}", response_model=TeamOut)
async def update_team(
    team_id: UUID,
    body: TeamUpdate,
    current_user: User = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_registry_session),
):
    """Update team name (admin only)."""
    result = await session.execute(select(Team).where(Team.team_id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    team.name = body.name
    await session.flush()
    await session.refresh(team)
    return team


# =============================================================================
# User Endpoints
# =============================================================================


@router.get("", response_model=list[UserOut])
async def list_users(
    current_user: User = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_registry_session),
):
    """List all users (admin only)."""
    result = await session.execute(select(User).order_by(User.created_at))
    return result.scalars().all()


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_registry_session),
):
    """Get user detail. Any authenticated user can view."""
    result = await session.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: UUID,
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_registry_session),
):
    """Update user. Admin can update any field; self can update display_name/avatar."""
    result = await session.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    is_self = str(current_user.user_id) == str(user_id)
    is_admin = current_user.role == "admin"

    if not is_self and not is_admin:
        raise HTTPException(status_code=403, detail="Cannot update other users")

    if body.display_name is not None:
        user.display_name = body.display_name
    if body.avatar_url is not None:
        user.avatar_url = body.avatar_url

    # Only admin can change role and team
    if is_admin:
        if body.role is not None:
            user.role = body.role
        if body.team_id is not None:
            user.team_id = body.team_id
    elif body.role is not None or body.team_id is not None:
        raise HTTPException(status_code=403, detail="Only admins can change role or team")

    await session.flush()
    await session.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: UUID,
    current_user: User = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_registry_session),
):
    """Delete user (admin only)."""
    result = await session.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await session.delete(user)
