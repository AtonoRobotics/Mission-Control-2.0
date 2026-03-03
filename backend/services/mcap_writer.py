"""
MCAP Writer Service — record ROS2 topics to MCAP files.
Messages arrive from rosbridge WebSocket subscriptions.
"""

import json
import struct
import time
from datetime import datetime, timezone
from pathlib import Path


class McapRecorder:
    """Records ROS2 messages to an MCAP file."""

    def __init__(self, output_dir: str, device_name: str):
        self.output_dir = Path(output_dir)
        self.device_name = device_name
        self._file = None
        self.file_path: Path | None = None
        self.recording = False
        self.start_time: float = 0
        self.message_count = 0
        self.size_bytes = 0
        self.topics: dict[str, dict] = {}

    def start(self, topics: list[dict]) -> str:
        """Start recording. topics = [{name, type}]. Returns file path."""
        self.output_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
        filename = f"{self.device_name}_{ts}.mcap"
        self.file_path = self.output_dir / filename

        self._file = open(self.file_path, "wb")
        # Write MCAP magic
        self._file.write(b"\x89MCAP0\r\n")
        # Write header record (opcode 0x01)
        header = json.dumps({"profile": "ros2", "library": "mission-control"}).encode()
        self._write_record(0x01, header)

        self.recording = True
        self.start_time = time.time()
        self.message_count = 0
        self.size_bytes = 0
        self.topics = {}

        # Register channels
        for i, t in enumerate(topics):
            self.topics[t["name"]] = {
                "type": t["type"],
                "count": 0,
                "channel_id": i + 1,
            }

        return str(self.file_path)

    def write_message(self, topic: str, data: bytes, timestamp_ns: int) -> None:
        """Write a single message to the file."""
        if not self.recording or not self._file:
            return

        info = self.topics.get(topic)
        if not info:
            return

        # Simple message record: opcode 0x05
        # channel_id (2B) + sequence (4B) + log_time (8B) + publish_time (8B) + data
        channel_id = info["channel_id"]
        payload = (
            struct.pack("<HIqq", channel_id, self.message_count, timestamp_ns, timestamp_ns)
            + data
        )
        self._write_record(0x05, payload)

        self.message_count += 1
        info["count"] += 1

    def stop(self) -> dict:
        """Stop recording. Returns metadata."""
        if not self.recording:
            return {}

        self.recording = False
        duration = time.time() - self.start_time

        if self._file:
            # Write footer (opcode 0x02)
            self._write_record(0x02, b"")
            # Write MCAP magic again (trailer)
            self._file.write(b"\x89MCAP0\r\n")
            self._file.close()
            self._file = None

        self.size_bytes = (
            self.file_path.stat().st_size
            if self.file_path and self.file_path.exists()
            else 0
        )

        return {
            "file_path": str(self.file_path),
            "duration_sec": round(duration, 2),
            "message_count": self.message_count,
            "size_bytes": self.size_bytes,
            "topics": [
                {"name": name, "type": info["type"], "message_count": info["count"]}
                for name, info in self.topics.items()
            ],
        }

    @property
    def status(self) -> dict:
        if not self.recording:
            return {"recording": False}
        return {
            "recording": True,
            "duration_sec": round(time.time() - self.start_time, 2),
            "message_count": self.message_count,
            "file_path": str(self.file_path),
        }

    def _write_record(self, opcode: int, data: bytes) -> None:
        """Write a length-prefixed record."""
        if self._file:
            self._file.write(struct.pack("<BQ", opcode, len(data)))
            self._file.write(data)
