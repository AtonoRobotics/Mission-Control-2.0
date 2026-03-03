"""
Stub robot driver for CR10.
Accepts joint commands, returns fake encoder feedback.
Used for end-to-end testing without real hardware.
"""
import asyncio
import time
from dataclasses import dataclass
from typing import List, Optional

SIMULATION_IP = "192.168.5.1"
MOVEMENT_RATE = 0.5  # rad/s
TOLERANCE = 0.001  # rad


@dataclass
class StubJointState:
    positions: List[float]
    velocities: List[float]
    timestamp: float


class StubRobotDriver:
    """Simulates CR10 robot responses for development/testing."""

    def __init__(self):
        self._connected: bool = False
        self._current_positions: List[float] = [0.0] * 6
        self._target_positions: List[float] = [0.0] * 6
        self._last_update_time: float = time.time()
        self._mode: str = "IDLE"

    async def connect(self) -> bool:
        await asyncio.sleep(0.1)
        self._connected = True
        self._mode = "READY"
        return True

    async def disconnect(self):
        await asyncio.sleep(0.1)
        self._connected = False
        self._mode = "DISCONNECTED"

    async def _update_positions(self):
        if not self._connected:
            return
        current_time = time.time()
        dt = current_time - self._last_update_time
        if dt < 0.001:
            return
        max_change = MOVEMENT_RATE * dt
        for i in range(6):
            diff = self._target_positions[i] - self._current_positions[i]
            if abs(diff) <= TOLERANCE:
                self._current_positions[i] = self._target_positions[i]
            else:
                sign = 1 if diff > 0 else -1
                self._current_positions[i] += sign * min(max_change, abs(diff))
        self._last_update_time = current_time

    async def get_joint_positions(self) -> List[float]:
        await self._update_positions()
        return self._current_positions.copy()

    async def send_joint_command(self, positions: List[float]) -> bool:
        if not self._connected or len(positions) != 6:
            return False
        self._target_positions = [float(p) for p in positions]
        self._mode = "MOVING"
        return True

    async def get_status(self) -> dict:
        await self._update_positions()
        return {
            "connected": self._connected,
            "mode": self._mode,
            "positions": self._current_positions.copy(),
            "timestamp": time.time(),
            "ip": f"{SIMULATION_IP} (stubbed)",
        }


stub_driver = StubRobotDriver()
