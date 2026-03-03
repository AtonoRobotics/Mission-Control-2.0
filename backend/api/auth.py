"""
Mission Control API — Auth Routes
Register, login, refresh, logout, and current user endpoints.
"""

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import get_settings
from db.registry.models import User, Session, Team
from db.session import get_registry_session
from services.auth import AuthService

logger = structlog.get_logger(__name__)
router = APIRouter()

_auth_service: AuthService | None = None


def _get_auth_service() -> AuthService:
    global _auth_service
    if _auth_service is None:
        settings = get_settings()
        _auth_service = AuthService(secret_key=settings.MC_SECRET_KEY)
    return _auth_service


# =============================================================================
# Pydantic Schemas
# =============================================================================


class RegisterRequest(BaseModel):
    email: str
    display_name: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


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


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


# =============================================================================
# Dependencies
# =============================================================================


async def get_current_user(
    authorization: str = Header(None),
    session: AsyncSession = Depends(get_registry_session),
) -> User:
    """Extract and validate JWT from Authorization header, return User."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = authorization.removeprefix("Bearer ")
    auth_svc = _get_auth_service()

    try:
        payload = auth_svc.decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    result = await session.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


# =============================================================================
# Endpoints
# =============================================================================


@router.post("/register", response_model=UserOut, status_code=201)
async def register(
    body: RegisterRequest,
    session: AsyncSession = Depends(get_registry_session),
):
    """Register a new user with email and password."""
    # Check for existing user
    result = await session.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    auth_svc = _get_auth_service()
    user = User(
        email=body.email,
        display_name=body.display_name,
        password_hash=auth_svc.hash_password(body.password),
        auth_provider="local",
        role="viewer",
    )
    session.add(user)
    await session.flush()
    await session.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    session: AsyncSession = Depends(get_registry_session),
):
    """Authenticate with email and password, receive JWT pair."""
    result = await session.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    auth_svc = _get_auth_service()
    if not auth_svc.verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Update last_login
    user.last_login = datetime.now(timezone.utc)

    access_token = auth_svc.create_access_token(
        user_id=str(user.user_id), role=user.role
    )
    refresh_token = auth_svc.create_refresh_token(user_id=str(user.user_id))

    # Store session
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    db_session = Session(
        user_id=user.user_id,
        token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    session.add(db_session)

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshRequest,
    session: AsyncSession = Depends(get_registry_session),
):
    """Exchange refresh token for new token pair."""
    auth_svc = _get_auth_service()

    try:
        payload = auth_svc.decode_token(body.refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = payload.get("sub")
    token_hash = hashlib.sha256(body.refresh_token.encode()).hexdigest()

    # Verify session exists
    result = await session.execute(
        select(Session).where(
            Session.user_id == user_id,
            Session.token_hash == token_hash,
        )
    )
    db_session = result.scalar_one_or_none()
    if not db_session:
        raise HTTPException(status_code=401, detail="Session not found or revoked")

    # Get user for role
    result = await session.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Delete old session, create new one
    await session.delete(db_session)

    new_access = auth_svc.create_access_token(user_id=str(user.user_id), role=user.role)
    new_refresh = auth_svc.create_refresh_token(user_id=str(user.user_id))
    new_hash = hashlib.sha256(new_refresh.encode()).hexdigest()

    new_session = Session(
        user_id=user.user_id,
        token_hash=new_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    session.add(new_session)

    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return current_user


@router.post("/logout", status_code=204)
async def logout(
    authorization: str = Header(None),
    session: AsyncSession = Depends(get_registry_session),
):
    """Invalidate the current session's refresh token."""
    if not authorization or not authorization.startswith("Bearer "):
        return

    token = authorization.removeprefix("Bearer ")
    auth_svc = _get_auth_service()

    try:
        payload = auth_svc.decode_token(token)
    except Exception:
        return

    user_id = payload.get("sub")
    if user_id:
        # Delete all sessions for this user (full logout)
        result = await session.execute(
            select(Session).where(Session.user_id == user_id)
        )
        for s in result.scalars():
            await session.delete(s)
