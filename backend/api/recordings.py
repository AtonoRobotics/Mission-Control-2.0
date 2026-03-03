"""
Recordings API — CRUD + start/stop recording + MCAP file streaming.
All metadata persisted to the recordings DB table.
"""

import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import get_settings
from db.session import get_registry_session
from db.registry.models import Recording
from services.mcap_writer import McapRecorder

logger = structlog.get_logger(__name__)

router = APIRouter()
settings = get_settings()

# ── Active recorder (runtime state — not persisted) ──────────────────────────

_active_recorder: McapRecorder | None = None
_active_recording_id: str | None = None
_pending_auto_upload: bool = False


# ── Models ────────────────────────────────────────────────────────────────────


class RecordingStart(BaseModel):
    device_name: str
    topics: list[dict]  # [{name, type}]
    auto_upload: bool = False


class RecordingUpdate(BaseModel):
    tags: list[str] | None = None
    shared: bool | None = None


class RecordingOut(BaseModel):
    recording_id: str
    device_name: str
    start_time: str
    end_time: str | None = None
    duration_sec: float | None = None
    topics: list[dict]
    size_bytes: int | None = None
    local_path: str | None = None
    storage_url: str | None = None
    status: str
    shared: bool
    tags: list[str]
    created_at: str


def _rec_to_out(rec: Recording) -> dict:
    """Convert ORM model to response dict."""
    return {
        "recording_id": str(rec.recording_id),
        "device_name": rec.device_name,
        "start_time": rec.start_time.isoformat() if rec.start_time else None,
        "end_time": rec.end_time.isoformat() if rec.end_time else None,
        "duration_sec": rec.duration_sec,
        "topics": rec.topics if rec.topics else [],
        "size_bytes": rec.size_bytes,
        "local_path": rec.local_path,
        "storage_url": rec.storage_url,
        "status": rec.status,
        "shared": rec.shared,
        "tags": rec.tags if rec.tags else [],
        "created_at": rec.created_at.isoformat() if rec.created_at else None,
    }


# ── CRUD ──────────────────────────────────────────────────────────────────────


@router.get("/", response_model=list[RecordingOut])
async def list_recordings(
    device_name: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    shared: Optional[bool] = Query(None),
    session: AsyncSession = Depends(get_registry_session),
):
    query = select(Recording).order_by(Recording.created_at.desc())
    if device_name is not None:
        query = query.where(Recording.device_name == device_name)
    if status is not None:
        query = query.where(Recording.status == status)
    if shared is not None:
        query = query.where(Recording.shared == shared)
    result = await session.execute(query)
    return [_rec_to_out(r) for r in result.scalars().all()]


@router.get("/shared/list", response_model=list[RecordingOut])
async def list_shared_recordings(
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(Recording).where(Recording.shared == True).order_by(Recording.created_at.desc())
    )
    return [_rec_to_out(r) for r in result.scalars().all()]


@router.get("/status/active")
async def recording_status():
    if not _active_recorder:
        return {"recording": False}
    return _active_recorder.status


@router.get("/{recording_id}", response_model=RecordingOut)
async def get_recording(
    recording_id: str,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(Recording).where(Recording.recording_id == recording_id)
    )
    rec = result.scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")
    return _rec_to_out(rec)


@router.patch("/{recording_id}", response_model=RecordingOut)
async def update_recording(
    recording_id: str,
    updates: RecordingUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(Recording).where(Recording.recording_id == recording_id)
    )
    rec = result.scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")
    data = updates.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(rec, key, value)
    await session.commit()
    await session.refresh(rec)
    return _rec_to_out(rec)


@router.delete("/{recording_id}")
async def delete_recording(
    recording_id: str,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(Recording).where(Recording.recording_id == recording_id)
    )
    rec = result.scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")
    # Delete local file if exists
    if rec.local_path:
        p = Path(rec.local_path)
        if p.exists():
            p.unlink()
    await session.delete(rec)
    await session.commit()
    return {"detail": "Recording deleted"}


# ── Auto-upload background task ──────────────────────────────────────────────


async def _auto_upload_recording(recording_id: str) -> None:
    """Upload completed MCAP file to S3 in background."""
    from services.cloud_storage import get_cloud_storage
    from db.session import get_registry_session_context

    async with get_registry_session_context() as session:
        result = await session.execute(
            select(Recording).where(Recording.recording_id == recording_id)
        )
        rec = result.scalar_one_or_none()
        if not rec or not rec.local_path:
            return

        rec.status = "uploading"
        await session.commit()

        local_path = rec.local_path
        filename = Path(local_path).name
        s3_key = f"recordings/{rec.device_name}/{filename}"

        try:
            storage = get_cloud_storage()
            ok = await asyncio.to_thread(
                storage.upload_file, local_path, s3_key, "application/octet-stream"
            )
            if ok:
                rec.status = "cloud"
                rec.storage_url = storage.presign_download(s3_key)
                logger.info("recording_uploaded", recording_id=recording_id, s3_key=s3_key)
            else:
                rec.status = "complete"
                logger.warning("recording_upload_failed", recording_id=recording_id)
            await session.commit()
        except Exception as exc:
            rec.status = "complete"
            await session.commit()
            logger.error("recording_upload_error", recording_id=recording_id, error=str(exc))


# ── Recording control ─────────────────────────────────────────────────────────


@router.post("/start", response_model=RecordingOut)
async def start_recording(
    body: RecordingStart,
    session: AsyncSession = Depends(get_registry_session),
):
    global _active_recorder, _active_recording_id, _pending_auto_upload
    if _active_recorder and _active_recorder.recording:
        raise HTTPException(status_code=409, detail="Recording already in progress")

    output_dir = settings.MC_BAG_STORAGE_PATH or "/tmp/mcap_recordings"
    _active_recorder = McapRecorder(output_dir=output_dir, device_name=body.device_name)
    file_path = _active_recorder.start(body.topics)
    _pending_auto_upload = body.auto_upload

    now = datetime.now(timezone.utc)
    rec = Recording(
        device_name=body.device_name,
        start_time=now,
        topics=body.topics,
        local_path=file_path,
        status="recording",
        shared=False,
        tags=[],
    )
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    _active_recording_id = str(rec.recording_id)
    return _rec_to_out(rec)


@router.post("/stop", response_model=RecordingOut)
async def stop_recording(
    session: AsyncSession = Depends(get_registry_session),
):
    global _active_recorder, _active_recording_id, _pending_auto_upload
    if not _active_recorder or not _active_recorder.recording:
        raise HTTPException(status_code=409, detail="No active recording")

    mcap_result = _active_recorder.stop()
    auto_upload = _pending_auto_upload
    _pending_auto_upload = False
    _active_recorder = None

    if not _active_recording_id:
        raise HTTPException(status_code=500, detail="No active recording ID tracked")

    result = await session.execute(
        select(Recording).where(Recording.recording_id == _active_recording_id)
    )
    rec = result.scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=500, detail="Recording entry not found in DB")

    rec.status = "complete"
    rec.end_time = datetime.now(timezone.utc)
    rec.duration_sec = mcap_result.get("duration_sec")
    rec.size_bytes = mcap_result.get("size_bytes")
    rec.topics = mcap_result.get("topics", rec.topics)
    await session.commit()
    await session.refresh(rec)

    rid = _active_recording_id
    _active_recording_id = None

    if auto_upload:
        asyncio.create_task(_auto_upload_recording(rid))

    return _rec_to_out(rec)


# ── MCAP file streaming ──────────────────────────────────────────────────────


@router.get("/{recording_id}/stream")
async def stream_recording(
    recording_id: str,
    request: Request,
    session: AsyncSession = Depends(get_registry_session),
):
    """Stream MCAP file with HTTP range request support."""
    result = await session.execute(
        select(Recording).where(Recording.recording_id == recording_id)
    )
    rec = result.scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")
    if not rec.local_path:
        raise HTTPException(status_code=404, detail="No local file")

    file_path = Path(rec.local_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")

    if range_header:
        range_spec = range_header.replace("bytes=", "")
        parts = range_spec.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else file_size - 1
        end = min(end, file_size - 1)
        length = end - start + 1

        def range_iter():
            with open(file_path, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(8192, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            range_iter(),
            status_code=206,
            media_type="application/octet-stream",
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(length),
                "Accept-Ranges": "bytes",
            },
        )

    def file_iter():
        with open(file_path, "rb") as f:
            while chunk := f.read(8192):
                yield chunk

    return StreamingResponse(
        file_iter(),
        media_type="application/octet-stream",
        headers={
            "Content-Length": str(file_size),
            "Accept-Ranges": "bytes",
        },
    )


# ── Recording sharing ────────────────────────────────────────────────────────


@router.post("/{recording_id}/share", response_model=RecordingOut)
async def share_recording(
    recording_id: str,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(Recording).where(Recording.recording_id == recording_id)
    )
    rec = result.scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")
    rec.shared = True
    await session.commit()
    await session.refresh(rec)
    logger.info("recording_shared", recording_id=recording_id)
    return _rec_to_out(rec)
