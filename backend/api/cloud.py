"""
Cloud Storage API — presigned URLs, object listing, delete.
All object metadata persisted to the cloud_objects DB table.
"""

from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import get_registry_session
from db.registry.models import CloudObject
from services.cloud_storage import get_cloud_storage

logger = structlog.get_logger(__name__)
router = APIRouter()


# ── Models ────────────────────────────────────────────────────────────────────


class PresignUploadRequest(BaseModel):
    key: str
    content_type: str = "application/octet-stream"
    object_type: str = "config"  # recording, config, dataset


class PresignDownloadRequest(BaseModel):
    key: str


class PresignResponse(BaseModel):
    url: str
    key: str
    expires_in: int


class CloudObjectOut(BaseModel):
    object_id: str | None = None
    key: str
    size: int | None = None
    content_type: str | None = None
    object_type: str | None = None
    status: str | None = None
    last_modified: str | None = None
    created_at: str | None = None


class RegisterUploadRequest(BaseModel):
    key: str
    content_type: str = "application/octet-stream"
    object_type: str = "config"
    size_bytes: int | None = None


class ConnectionTestOut(BaseModel):
    ok: bool
    bucket: str
    error: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/presign-upload", response_model=PresignResponse)
async def presign_upload(body: PresignUploadRequest):
    """Get a presigned URL for direct upload to S3."""
    storage = get_cloud_storage()
    url = storage.presign_upload(body.key, body.content_type)
    return PresignResponse(url=url, key=body.key, expires_in=storage.presign_expire)


@router.post("/presign-download", response_model=PresignResponse)
async def presign_download(body: PresignDownloadRequest):
    """Get a presigned URL for download from S3."""
    storage = get_cloud_storage()
    meta = storage.head_object(body.key)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Object not found: {body.key}")
    url = storage.presign_download(body.key)
    return PresignResponse(url=url, key=body.key, expires_in=storage.presign_expire)


@router.post("/register", response_model=CloudObjectOut, status_code=201)
async def register_upload(
    body: RegisterUploadRequest,
    session: AsyncSession = Depends(get_registry_session),
):
    """Register a completed upload in the DB. Call after successful presigned upload."""
    storage = get_cloud_storage()

    # Check if already registered
    existing = await session.execute(
        select(CloudObject).where(CloudObject.s3_key == body.key)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Object already registered: {body.key}")

    obj = CloudObject(
        s3_key=body.key,
        bucket=storage.bucket_name,
        content_type=body.content_type,
        size_bytes=body.size_bytes,
        object_type=body.object_type,
        status="uploaded",
    )
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    logger.info("cloud_object_registered", key=body.key, object_type=body.object_type)
    return CloudObjectOut(
        object_id=str(obj.object_id),
        key=obj.s3_key,
        size=obj.size_bytes,
        content_type=obj.content_type,
        object_type=obj.object_type,
        status=obj.status,
        created_at=obj.created_at.isoformat() if obj.created_at else None,
    )


@router.get("/objects", response_model=list[CloudObjectOut])
async def list_objects(
    prefix: str = Query("", description="S3 key prefix filter"),
    max_keys: int = Query(200, le=1000),
    source: str = Query("s3", description="'s3' for live listing, 'db' for registered objects"),
    session: AsyncSession = Depends(get_registry_session),
):
    """List objects. Use source=s3 for live S3 listing, source=db for registered objects."""
    if source == "db":
        query = select(CloudObject).order_by(CloudObject.created_at.desc())
        if prefix:
            query = query.where(CloudObject.s3_key.startswith(prefix))
        query = query.limit(max_keys)
        result = await session.execute(query)
        return [
            CloudObjectOut(
                object_id=str(obj.object_id),
                key=obj.s3_key,
                size=obj.size_bytes,
                content_type=obj.content_type,
                object_type=obj.object_type,
                status=obj.status,
                created_at=obj.created_at.isoformat() if obj.created_at else None,
            )
            for obj in result.scalars().all()
        ]

    storage = get_cloud_storage()
    return storage.list_objects(prefix=prefix, max_keys=max_keys)


@router.delete("/objects/{key:path}", status_code=204)
async def delete_object(
    key: str,
    session: AsyncSession = Depends(get_registry_session),
):
    """Delete an object from S3 and remove its DB record."""
    storage = get_cloud_storage()
    meta = storage.head_object(key)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Object not found: {key}")
    if not storage.delete_object(key):
        raise HTTPException(status_code=500, detail="Failed to delete object")

    # Remove DB record if exists
    result = await session.execute(
        select(CloudObject).where(CloudObject.s3_key == key)
    )
    obj = result.scalar_one_or_none()
    if obj:
        await session.delete(obj)
        await session.commit()

    logger.info("cloud_object_deleted", key=key)


@router.get("/test", response_model=ConnectionTestOut)
async def test_connection():
    """Test S3 connectivity."""
    storage = get_cloud_storage()
    return storage.test_connection()
