"""
Cloud Storage API — presigned URLs, object listing, delete.
"""

from typing import Optional

import structlog
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.cloud_storage import get_cloud_storage

logger = structlog.get_logger(__name__)
router = APIRouter()


# ── Models ────────────────────────────────────────────────────────────────────


class PresignUploadRequest(BaseModel):
    key: str
    content_type: str = "application/octet-stream"


class PresignDownloadRequest(BaseModel):
    key: str


class PresignResponse(BaseModel):
    url: str
    key: str
    expires_in: int


class CloudObjectOut(BaseModel):
    key: str
    size: int
    last_modified: str


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
    # Verify object exists
    meta = storage.head_object(body.key)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Object not found: {body.key}")
    url = storage.presign_download(body.key)
    return PresignResponse(url=url, key=body.key, expires_in=storage.presign_expire)


@router.get("/objects", response_model=list[CloudObjectOut])
async def list_objects(
    prefix: str = Query("", description="S3 key prefix filter"),
    max_keys: int = Query(200, le=1000),
):
    """List objects in the S3 bucket by prefix."""
    storage = get_cloud_storage()
    return storage.list_objects(prefix=prefix, max_keys=max_keys)


@router.delete("/objects/{key:path}", status_code=204)
async def delete_object(key: str):
    """Delete an object from S3."""
    storage = get_cloud_storage()
    meta = storage.head_object(key)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Object not found: {key}")
    if not storage.delete_object(key):
        raise HTTPException(status_code=500, detail="Failed to delete object")
    logger.info("cloud_object_deleted", key=key)


@router.get("/test", response_model=ConnectionTestOut)
async def test_connection():
    """Test S3 connectivity."""
    storage = get_cloud_storage()
    return storage.test_connection()
