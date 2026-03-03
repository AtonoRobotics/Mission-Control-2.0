"""
Recordings API — CRUD + start/stop recording + MCAP file streaming.
"""

import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import structlog
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.settings import get_settings
from services.mcap_writer import McapRecorder

logger = structlog.get_logger(__name__)

router = APIRouter()
settings = get_settings()

# ── In-memory state (will migrate to DB) ──────────────────────────────────────

_recordings: dict[str, dict] = {}
_active_recorder: McapRecorder | None = None


# ── Models ────────────────────────────────────────────────────────────────────


class RecordingCreate(BaseModel):
    device_name: str
    topics: list[dict]  # [{name, type}]


class RecordingUpdate(BaseModel):
    tags: list[str] | None = None
    shared: bool | None = None


class RecordingStart(BaseModel):
    device_name: str
    topics: list[dict]  # [{name, type}]
    auto_upload: bool = False


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


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── CRUD ──────────────────────────────────────────────────────────────────────


@router.get("/", response_model=list[RecordingOut])
async def list_recordings(
    device_name: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    shared: Optional[bool] = Query(None),
):
    recs = list(_recordings.values())
    if device_name is not None:
        recs = [r for r in recs if r["device_name"] == device_name]
    if status is not None:
        recs = [r for r in recs if r["status"] == status]
    if shared is not None:
        recs = [r for r in recs if r["shared"] == shared]
    return recs


@router.get("/shared/list", response_model=list[RecordingOut])
async def list_shared_recordings():
    return [rec for rec in _recordings.values() if rec.get("shared")]


@router.get("/{recording_id}", response_model=RecordingOut)
async def get_recording(recording_id: str):
    if recording_id not in _recordings:
        raise HTTPException(status_code=404, detail="Recording not found")
    return _recordings[recording_id]


@router.patch("/{recording_id}", response_model=RecordingOut)
async def update_recording(recording_id: str, updates: RecordingUpdate):
    if recording_id not in _recordings:
        raise HTTPException(status_code=404, detail="Recording not found")
    data = updates.model_dump(exclude_unset=True)
    _recordings[recording_id].update(data)
    return _recordings[recording_id]


@router.delete("/{recording_id}")
async def delete_recording(recording_id: str):
    if recording_id not in _recordings:
        raise HTTPException(status_code=404, detail="Recording not found")
    # Delete local file if exists
    rec = _recordings[recording_id]
    if rec.get("local_path"):
        p = Path(rec["local_path"])
        if p.exists():
            p.unlink()
    del _recordings[recording_id]
    return {"detail": "Recording deleted"}


# ── Auto-upload background task ──────────────────────────────────────────────


async def _auto_upload_recording(recording_id: str) -> None:
    """Upload completed MCAP file to S3 in background."""
    from services.cloud_storage import get_cloud_storage

    rec = _recordings.get(recording_id)
    if not rec or not rec.get("local_path"):
        return

    rec["status"] = "uploading"
    local_path = rec["local_path"]
    filename = Path(local_path).name
    s3_key = f"recordings/{rec['device_name']}/{filename}"

    try:
        storage = get_cloud_storage()
        ok = await asyncio.to_thread(
            storage.upload_file, local_path, s3_key, "application/octet-stream"
        )
        if ok:
            rec["status"] = "cloud"
            rec["storage_url"] = storage.presign_download(s3_key)
            logger.info("recording_uploaded", recording_id=recording_id, s3_key=s3_key)
        else:
            rec["status"] = "complete"  # revert on failure
            logger.warning("recording_upload_failed", recording_id=recording_id)
    except Exception as exc:
        rec["status"] = "complete"
        logger.error("recording_upload_error", recording_id=recording_id, error=str(exc))


# ── Recording control ─────────────────────────────────────────────────────────

_pending_auto_upload: bool = False  # track if current recording wants auto-upload


@router.post("/start", response_model=RecordingOut)
async def start_recording(body: RecordingStart):
    global _active_recorder, _pending_auto_upload
    if _active_recorder and _active_recorder.recording:
        raise HTTPException(status_code=409, detail="Recording already in progress")

    output_dir = settings.MC_BAG_STORAGE_PATH or "/tmp/mcap_recordings"
    _active_recorder = McapRecorder(output_dir=output_dir, device_name=body.device_name)
    file_path = _active_recorder.start(body.topics)
    _pending_auto_upload = body.auto_upload

    recording_id = str(uuid.uuid4())
    rec = {
        "recording_id": recording_id,
        "device_name": body.device_name,
        "start_time": _now(),
        "end_time": None,
        "duration_sec": None,
        "topics": body.topics,
        "size_bytes": None,
        "local_path": file_path,
        "storage_url": None,
        "status": "recording",
        "shared": False,
        "tags": [],
        "created_at": _now(),
    }
    _recordings[recording_id] = rec
    return rec


@router.post("/stop", response_model=RecordingOut)
async def stop_recording():
    global _active_recorder, _pending_auto_upload
    if not _active_recorder or not _active_recorder.recording:
        raise HTTPException(status_code=409, detail="No active recording")

    result = _active_recorder.stop()
    auto_upload = _pending_auto_upload
    _pending_auto_upload = False

    # Find the active recording entry and update it
    for rec in _recordings.values():
        if rec["status"] == "recording" and rec["local_path"] == result.get("file_path"):
            rec["status"] = "complete"
            rec["end_time"] = _now()
            rec["duration_sec"] = result["duration_sec"]
            rec["size_bytes"] = result["size_bytes"]
            rec["topics"] = result["topics"]
            _active_recorder = None

            # Kick off background S3 upload if requested
            if auto_upload:
                asyncio.create_task(_auto_upload_recording(rec["recording_id"]))

            return rec

    _active_recorder = None
    raise HTTPException(status_code=500, detail="Recording entry not found")


@router.get("/status/active")
async def recording_status():
    if not _active_recorder:
        return {"recording": False}
    return _active_recorder.status


# ── MCAP file streaming ──────────────────────────────────────────────────────


@router.get("/{recording_id}/stream")
async def stream_recording(recording_id: str, request: Request):
    """Stream MCAP file with HTTP range request support."""
    if recording_id not in _recordings:
        raise HTTPException(status_code=404, detail="Recording not found")

    rec = _recordings[recording_id]
    if not rec.get("local_path"):
        raise HTTPException(status_code=404, detail="No local file")

    file_path = Path(rec["local_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")

    if range_header:
        # Parse range: bytes=start-end
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

    # Full file
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
async def share_recording(recording_id: str):
    if recording_id not in _recordings:
        raise HTTPException(status_code=404, detail="Recording not found")
    _recordings[recording_id]["shared"] = True
    logger.info("recording_shared", recording_id=recording_id)
    return _recordings[recording_id]
