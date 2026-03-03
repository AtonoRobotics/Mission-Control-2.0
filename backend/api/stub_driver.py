"""Stub robot driver REST endpoints for development/testing."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.stub_robot_driver import stub_driver

router = APIRouter()


class JointCommand(BaseModel):
    positions: list[float]  # 6 joint positions in radians


@router.get("/status")
async def get_status():
    return await stub_driver.get_status()


@router.post("/connect")
async def connect():
    ok = await stub_driver.connect()
    return {"connected": ok}


@router.post("/disconnect")
async def disconnect():
    await stub_driver.disconnect()
    return {"connected": False}


@router.get("/joints")
async def get_joints():
    positions = await stub_driver.get_joint_positions()
    return {"positions": positions}


@router.post("/command")
async def send_command(cmd: JointCommand):
    if len(cmd.positions) != 6:
        raise HTTPException(400, "Exactly 6 joint positions required")
    ok = await stub_driver.send_joint_command(cmd.positions)
    return {"accepted": ok}
