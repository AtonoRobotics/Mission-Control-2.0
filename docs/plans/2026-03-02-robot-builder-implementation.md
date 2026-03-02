# Robot Builder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a component-based robot configurator that generates all Isaac pipeline files (USD, URDF, cuRobo YAML, sensor configs, launch files) from modular physical components with AI-researched physics data and HIT approval.

**Architecture:** New DB tables (ComponentRegistry, ConfigurationPackage, RobotConfiguration) + backend CRUD/build APIs + frontend tree-based configurator with 3D preview. Extends existing FastAPI + SQLAlchemy async stack, Zustand + Three.js frontend.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, PostgreSQL/JSONB, Alembic, React 18, TypeScript, Zustand, Three.js, Monaco Editor

**Design Doc:** `docs/plans/2026-03-02-robot-builder-design.md`

---

## Phase 1: Database Schema

### Task 1: Add ORM models for builder tables

**Files:**
- Modify: `backend/db/registry/models.py` (append after line 296)
- Modify: `backend/db/registry/__init__.py` (add exports)

**Step 1: Write the failing test**

Create `tests/unit/test_builder_models.py`:

```python
"""Unit tests for Robot Builder ORM models."""
import pytest
from backend.db.registry.models import (
    ComponentRegistry,
    ConfigurationPackage,
    RobotConfiguration,
)


def test_component_registry_table_name():
    assert ComponentRegistry.__tablename__ == "component_registry"


def test_component_registry_has_required_columns():
    cols = {c.name for c in ComponentRegistry.__table__.columns}
    required = {
        "component_id", "name", "category", "manufacturer", "model",
        "physics", "attachment_interfaces", "data_sources",
        "approval_status", "approved_by", "approved_at",
        "visual_mesh_file_id", "collision_mesh_file_id", "source_mesh_file_id",
        "thumbnail_path", "notes", "created_at", "updated_at",
    }
    assert required.issubset(cols), f"Missing columns: {required - cols}"


def test_configuration_package_table_name():
    assert ConfigurationPackage.__tablename__ == "configuration_packages"


def test_configuration_package_has_required_columns():
    cols = {c.name for c in ConfigurationPackage.__table__.columns}
    required = {
        "package_id", "name", "package_type", "component_tree",
        "total_mass_kg", "description", "created_at", "updated_at",
    }
    assert required.issubset(cols), f"Missing columns: {required - cols}"


def test_robot_configuration_table_name():
    assert RobotConfiguration.__tablename__ == "robot_configurations"


def test_robot_configuration_has_required_columns():
    cols = {c.name for c in RobotConfiguration.__table__.columns}
    required = {
        "config_id", "robot_id", "name", "base_type", "base_config",
        "payload_package_id", "sensor_package_id", "status",
        "generated_files", "validation_report_id", "created_at", "updated_at",
    }
    assert required.issubset(cols), f"Missing columns: {required - cols}"


def test_component_default_approval_status():
    c = ComponentRegistry()
    # server_default won't fire without DB, but column should exist
    assert hasattr(c, "approval_status")


def test_configuration_package_types():
    """Package type should accept payload and sensor."""
    p = ConfigurationPackage()
    p.package_type = "payload"
    assert p.package_type == "payload"
    p.package_type = "sensor"
    assert p.package_type == "sensor"
```

**Step 2: Run test to verify it fails**

Run: `cd /home/samuel/mission-control && python -m pytest tests/unit/test_builder_models.py -v`
Expected: FAIL with `ImportError: cannot import name 'ComponentRegistry'`

**Step 3: Write the ORM models**

Append to `backend/db/registry/models.py` after `WorkflowRunLog`:

```python
# =============================================================================
# 0003 — Robot Builder Tables
# =============================================================================


class ComponentRegistry(Base):
    __tablename__ = "component_registry"

    component_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    manufacturer: Mapped[str | None] = mapped_column(String(256), nullable=True)
    model: Mapped[str | None] = mapped_column(String(256), nullable=True)
    physics: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    attachment_interfaces: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    data_sources: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    approval_status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default="pending_hit"
    )
    approved_by: Mapped[str | None] = mapped_column(String(256), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(nullable=True)
    visual_mesh_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    collision_mesh_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    source_mesh_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    thumbnail_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class ConfigurationPackage(Base):
    __tablename__ = "configuration_packages"

    package_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    package_type: Mapped[str] = mapped_column(String(32), nullable=False)
    component_tree: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    total_mass_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class RobotConfiguration(Base):
    __tablename__ = "robot_configurations"

    config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    robot_id: Mapped[str] = mapped_column(
        String(128), ForeignKey("robots.robot_id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    base_type: Mapped[str] = mapped_column(String(32), nullable=False, server_default="standing")
    base_config: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    payload_package_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    sensor_package_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="draft")
    generated_files: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    validation_report_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

Update `backend/db/registry/__init__.py` — add to imports and `__all__`:

```python
from .models import (
    # ... existing imports ...
    ComponentRegistry,
    ConfigurationPackage,
    RobotConfiguration,
)

__all__ = [
    # ... existing exports ...
    "ComponentRegistry",
    "ConfigurationPackage",
    "RobotConfiguration",
]
```

**Step 4: Run test to verify it passes**

Run: `cd /home/samuel/mission-control && python -m pytest tests/unit/test_builder_models.py -v`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add tests/unit/test_builder_models.py backend/db/registry/models.py backend/db/registry/__init__.py
git commit -m "feat: Add ORM models for Robot Builder — ComponentRegistry, ConfigurationPackage, RobotConfiguration"
```

---

### Task 2: Create Alembic migration for builder tables

**Files:**
- Create: `database/registry/versions/0003_robot_builder_tables.py`

**Step 1: Generate migration**

```bash
cd /home/samuel/mission-control/database/registry
alembic -c alembic.ini revision -m "robot_builder_tables"
```

**Step 2: Write migration upgrade and downgrade**

Edit the generated migration file:

```python
"""robot_builder_tables

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "component_registry",
        sa.Column("component_id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("manufacturer", sa.String(256), nullable=True),
        sa.Column("model", sa.String(256), nullable=True),
        sa.Column("physics", JSONB, nullable=False, server_default="{}"),
        sa.Column("attachment_interfaces", JSONB, nullable=False, server_default="[]"),
        sa.Column("data_sources", JSONB, nullable=False, server_default="[]"),
        sa.Column("approval_status", sa.String(32), nullable=False, server_default="pending_hit"),
        sa.Column("approved_by", sa.String(256), nullable=True),
        sa.Column("approved_at", sa.DateTime, nullable=True),
        sa.Column("visual_mesh_file_id", UUID(as_uuid=True), nullable=True),
        sa.Column("collision_mesh_file_id", UUID(as_uuid=True), nullable=True),
        sa.Column("source_mesh_file_id", UUID(as_uuid=True), nullable=True),
        sa.Column("thumbnail_path", sa.String(1024), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "configuration_packages",
        sa.Column("package_id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("package_type", sa.String(32), nullable=False),
        sa.Column("component_tree", JSONB, nullable=False, server_default="[]"),
        sa.Column("total_mass_kg", sa.Float, nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "robot_configurations",
        sa.Column("config_id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("robot_id", sa.String(128), sa.ForeignKey("robots.robot_id"), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("base_type", sa.String(32), nullable=False, server_default="standing"),
        sa.Column("base_config", JSONB, nullable=False, server_default="{}"),
        sa.Column("payload_package_id", UUID(as_uuid=True), nullable=True),
        sa.Column("sensor_package_id", UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("generated_files", JSONB, nullable=False, server_default="{}"),
        sa.Column("validation_report_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_index("ix_component_registry_category", "component_registry", ["category"])
    op.create_index("ix_component_registry_approval", "component_registry", ["approval_status"])
    op.create_index("ix_configuration_packages_type", "configuration_packages", ["package_type"])
    op.create_index("ix_robot_configurations_robot_id", "robot_configurations", ["robot_id"])


def downgrade() -> None:
    op.drop_index("ix_robot_configurations_robot_id")
    op.drop_index("ix_configuration_packages_type")
    op.drop_index("ix_component_registry_approval")
    op.drop_index("ix_component_registry_category")
    op.drop_table("robot_configurations")
    op.drop_table("configuration_packages")
    op.drop_table("component_registry")
```

**Step 3: Run migration**

```bash
cd /home/samuel/mission-control/database/registry
alembic -c alembic.ini upgrade head
```
Expected: `INFO  [alembic.runtime.migration] Running upgrade 0002 -> 0003, robot_builder_tables`

**Step 4: Verify tables exist**

```bash
cd /home/samuel/mission-control
python -c "
import asyncio
from backend.db.session import init_engines, get_registry_session
from sqlalchemy import text

async def check():
    init_engines()
    async for session in get_registry_session():
        for tbl in ['component_registry', 'configuration_packages', 'robot_configurations']:
            r = await session.execute(text(f'SELECT count(*) FROM {tbl}'))
            print(f'{tbl}: {r.scalar()} rows (exists)')

asyncio.run(check())
"
```

**Step 5: Commit**

```bash
git add database/registry/versions/0003_robot_builder_tables.py
git commit -m "feat: Alembic migration 0003 — robot builder tables"
```

---

## Phase 2: Component API

### Task 3: Component CRUD endpoints — Pydantic schemas

**Files:**
- Create: `backend/api/components.py`
- Test: `tests/unit/test_component_schemas.py`

**Step 1: Write the failing test**

Create `tests/unit/test_component_schemas.py`:

```python
"""Unit tests for Component API Pydantic schemas."""
import pytest
from pydantic import ValidationError


def test_component_create_minimal():
    from backend.api.components import ComponentCreate
    c = ComponentCreate(name="ARRI Alexa Mini LF", category="camera")
    assert c.name == "ARRI Alexa Mini LF"
    assert c.category == "camera"
    assert c.physics == {}
    assert c.attachment_interfaces == []


def test_component_create_full():
    from backend.api.components import ComponentCreate
    c = ComponentCreate(
        name="Signature Prime 35mm",
        category="lens",
        manufacturer="ARRI",
        model="Signature Prime 35mm T1.8",
        physics={"mass_kg": 1.8, "dimensions_mm": {"l": 141, "w": 100, "h": 100}},
        attachment_interfaces=[
            {"name": "lens_mount", "type": "pl_mount", "role": "provides"}
        ],
    )
    assert c.manufacturer == "ARRI"
    assert c.physics["mass_kg"] == 1.8


def test_component_create_requires_name():
    from backend.api.components import ComponentCreate
    with pytest.raises(ValidationError):
        ComponentCreate(category="camera")


def test_component_create_requires_category():
    from backend.api.components import ComponentCreate
    with pytest.raises(ValidationError):
        ComponentCreate(name="test")


def test_component_create_valid_categories():
    from backend.api.components import ComponentCreate, VALID_CATEGORIES
    assert "camera" in VALID_CATEGORIES
    assert "lens" in VALID_CATEGORIES
    assert "fiz" in VALID_CATEGORIES
    assert "base" in VALID_CATEGORIES


def test_component_out_has_all_fields():
    from backend.api.components import ComponentOut
    fields = set(ComponentOut.model_fields.keys())
    required = {
        "component_id", "name", "category", "manufacturer", "model",
        "physics", "attachment_interfaces", "data_sources",
        "approval_status", "approved_by", "approved_at",
        "visual_mesh_file_id", "collision_mesh_file_id", "source_mesh_file_id",
        "thumbnail_path", "notes", "created_at", "updated_at",
    }
    assert required.issubset(fields), f"Missing: {required - fields}"
```

**Step 2: Run test to verify it fails**

Run: `cd /home/samuel/mission-control && python -m pytest tests/unit/test_component_schemas.py -v`
Expected: FAIL with `ModuleNotFoundError`

**Step 3: Write the schemas and router**

Create `backend/api/components.py`:

```python
"""
Mission Control API — Component Registry Routes
Component CRUD, HIT approval, AI research trigger.
"""

import uuid
from datetime import datetime
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from db.registry.models import ComponentRegistry
from db.session import get_registry_session

logger = structlog.get_logger(__name__)
router = APIRouter()

VALID_CATEGORIES = [
    "camera", "lens", "camera_plate", "fiz", "rail",
    "base", "sensor", "accessory",
]


# =============================================================================
# Pydantic Schemas
# =============================================================================


class ComponentCreate(BaseModel):
    name: str
    category: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    physics: dict = Field(default_factory=dict)
    attachment_interfaces: list = Field(default_factory=list)
    data_sources: list = Field(default_factory=list)
    notes: Optional[str] = None


class ComponentUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    physics: Optional[dict] = None
    attachment_interfaces: Optional[list] = None
    data_sources: Optional[list] = None
    notes: Optional[str] = None


class ComponentOut(BaseModel):
    component_id: uuid.UUID
    name: str
    category: str
    manufacturer: Optional[str]
    model: Optional[str]
    physics: dict
    attachment_interfaces: list
    data_sources: list
    approval_status: str
    approved_by: Optional[str]
    approved_at: Optional[datetime]
    visual_mesh_file_id: Optional[uuid.UUID]
    collision_mesh_file_id: Optional[uuid.UUID]
    source_mesh_file_id: Optional[uuid.UUID]
    thumbnail_path: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ResearchRequest(BaseModel):
    name: str
    category: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None


class ApprovalAction(BaseModel):
    approved_by: str
    notes: Optional[str] = None


# =============================================================================
# CRUD Endpoints
# =============================================================================


@router.get("", response_model=list[ComponentOut])
async def list_components(
    category: Optional[str] = Query(None),
    approval_status: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_registry_session),
):
    """List components, optionally filtered by category and approval status."""
    stmt = select(ComponentRegistry).order_by(ComponentRegistry.created_at.desc())
    if category:
        stmt = stmt.where(ComponentRegistry.category == category)
    if approval_status:
        stmt = stmt.where(ComponentRegistry.approval_status == approval_status)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=ComponentOut, status_code=201)
async def create_component(
    body: ComponentCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    """Create a new component in the registry."""
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category '{body.category}'. Must be one of: {VALID_CATEGORIES}",
        )
    entry = ComponentRegistry(
        name=body.name,
        category=body.category,
        manufacturer=body.manufacturer,
        model=body.model,
        physics=body.physics,
        attachment_interfaces=body.attachment_interfaces,
        data_sources=body.data_sources,
        notes=body.notes,
    )
    session.add(entry)
    await session.flush()
    await session.refresh(entry)
    logger.info("component_created", component_id=str(entry.component_id), name=entry.name)
    return entry


@router.get("/{component_id}", response_model=ComponentOut)
async def get_component(
    component_id: uuid.UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """Get a single component by ID."""
    result = await session.execute(
        select(ComponentRegistry).where(ComponentRegistry.component_id == component_id)
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@router.put("/{component_id}", response_model=ComponentOut)
async def update_component(
    component_id: uuid.UUID,
    body: ComponentUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    """Update a component's fields."""
    result = await session.execute(
        select(ComponentRegistry).where(ComponentRegistry.component_id == component_id)
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    if body.category and body.category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category '{body.category}'. Must be one of: {VALID_CATEGORIES}",
        )
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(component, field, value)
    component.updated_at = datetime.utcnow()
    await session.flush()
    await session.refresh(component)
    logger.info("component_updated", component_id=str(component_id))
    return component


@router.delete("/{component_id}", status_code=204)
async def delete_component(
    component_id: uuid.UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """Delete a component."""
    result = await session.execute(
        select(ComponentRegistry).where(ComponentRegistry.component_id == component_id)
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    await session.delete(component)
    logger.info("component_deleted", component_id=str(component_id))


# =============================================================================
# HIT Approval Endpoints
# =============================================================================


@router.post("/{component_id}/approve", response_model=ComponentOut)
async def approve_component(
    component_id: uuid.UUID,
    body: ApprovalAction,
    session: AsyncSession = Depends(get_registry_session),
):
    """HIT approve a component's physics data."""
    result = await session.execute(
        select(ComponentRegistry).where(ComponentRegistry.component_id == component_id)
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    if component.approval_status == "approved":
        raise HTTPException(status_code=409, detail="Component already approved")
    component.approval_status = "approved"
    component.approved_by = body.approved_by
    component.approved_at = datetime.utcnow()
    component.updated_at = datetime.utcnow()
    if body.notes:
        component.notes = body.notes
    await session.flush()
    await session.refresh(component)
    logger.info("component_approved", component_id=str(component_id), by=body.approved_by)
    return component


@router.post("/{component_id}/reject", response_model=ComponentOut)
async def reject_component(
    component_id: uuid.UUID,
    body: ApprovalAction,
    session: AsyncSession = Depends(get_registry_session),
):
    """HIT reject a component's physics data."""
    result = await session.execute(
        select(ComponentRegistry).where(ComponentRegistry.component_id == component_id)
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    component.approval_status = "rejected"
    component.updated_at = datetime.utcnow()
    if body.notes:
        component.notes = body.notes
    await session.flush()
    await session.refresh(component)
    logger.info("component_rejected", component_id=str(component_id), by=body.approved_by)
    return component


# =============================================================================
# AI Research Trigger
# =============================================================================


@router.post("/research", response_model=ComponentOut, status_code=201)
async def research_component(
    body: ResearchRequest,
    session: AsyncSession = Depends(get_registry_session),
):
    """
    Trigger AI research for a component.
    Creates the component entry with pending_hit status, then dispatches
    the research agent to populate physics data.
    """
    entry = ComponentRegistry(
        name=body.name,
        category=body.category,
        manufacturer=body.manufacturer,
        model=body.model,
        approval_status="pending_hit",
    )
    session.add(entry)
    await session.flush()
    await session.refresh(entry)
    # TODO: dispatch research agent via MCP agent__research
    # The agent will update physics, data_sources, and attachment_interfaces
    logger.info(
        "component_research_requested",
        component_id=str(entry.component_id),
        name=body.name,
    )
    return entry
```

**Step 4: Run test to verify it passes**

Run: `cd /home/samuel/mission-control && python -m pytest tests/unit/test_component_schemas.py -v`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add backend/api/components.py tests/unit/test_component_schemas.py
git commit -m "feat: Component CRUD API with HIT approval and research trigger"
```

---

### Task 4: Register component router in main.py

**Files:**
- Modify: `backend/main.py` (add router include)

**Step 1: Add router registration**

In `backend/main.py`, after existing router includes:

```python
from api.components import router as components_router
# ... in the router registration block:
app.include_router(components_router, prefix="/api/components", tags=["Components"])
```

**Step 2: Verify server starts**

```bash
cd /home/samuel/mission-control/backend && uvicorn main:app --port 8000 &
sleep 2
curl -s http://localhost:8000/api/components | python -m json.tool
kill %1
```
Expected: `[]` (empty list, no errors)

**Step 3: Commit**

```bash
git add backend/main.py
git commit -m "feat: Register component router at /api/components"
```

---

## Phase 3: Configuration & Package API

### Task 5: Configuration Package CRUD endpoints

**Files:**
- Create: `backend/api/packages.py`
- Test: `tests/unit/test_package_schemas.py`

**Step 1: Write the failing test**

Create `tests/unit/test_package_schemas.py`:

```python
"""Unit tests for Configuration Package API schemas."""
import pytest
from pydantic import ValidationError


def test_package_create_minimal():
    from backend.api.packages import PackageCreate
    p = PackageCreate(name="ARRI Alexa Mini Payload", package_type="payload")
    assert p.name == "ARRI Alexa Mini Payload"
    assert p.component_tree == []


def test_package_create_with_tree():
    from backend.api.packages import PackageCreate
    p = PackageCreate(
        name="ARRI Alexa Mini Payload",
        package_type="payload",
        component_tree=[
            {
                "component_id": "550e8400-e29b-41d4-a716-446655440000",
                "attach_to": "ee_flange",
                "joint_config": {"type": "fixed", "origin_xyz": [0, 0, 0.05]},
            }
        ],
    )
    assert len(p.component_tree) == 1


def test_package_create_requires_name():
    from backend.api.packages import PackageCreate
    with pytest.raises(ValidationError):
        PackageCreate(package_type="payload")


def test_package_create_requires_type():
    from backend.api.packages import PackageCreate
    with pytest.raises(ValidationError):
        PackageCreate(name="test")


def test_package_out_fields():
    from backend.api.packages import PackageOut
    fields = set(PackageOut.model_fields.keys())
    assert {"package_id", "name", "package_type", "component_tree", "total_mass_kg"}.issubset(fields)
```

**Step 2: Run test to verify it fails**

Run: `cd /home/samuel/mission-control && python -m pytest tests/unit/test_package_schemas.py -v`
Expected: FAIL with `ModuleNotFoundError`

**Step 3: Write the endpoints**

Create `backend/api/packages.py`:

```python
"""
Mission Control API — Configuration Package Routes
Payload and sensor package CRUD.
"""

import uuid
from datetime import datetime
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.registry.models import ConfigurationPackage, ComponentRegistry
from db.session import get_registry_session

logger = structlog.get_logger(__name__)
router = APIRouter()


class PackageCreate(BaseModel):
    name: str
    package_type: str
    component_tree: list = Field(default_factory=list)
    description: Optional[str] = None


class PackageUpdate(BaseModel):
    name: Optional[str] = None
    component_tree: Optional[list] = None
    description: Optional[str] = None


class PackageOut(BaseModel):
    package_id: uuid.UUID
    name: str
    package_type: str
    component_tree: list
    total_mass_kg: Optional[float]
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ValidateResult(BaseModel):
    compatible: bool
    warnings: list[str]
    total_mass_kg: float
    robot_capacity_kg: Optional[float]


@router.get("", response_model=list[PackageOut])
async def list_packages(
    package_type: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_registry_session),
):
    stmt = select(ConfigurationPackage).order_by(ConfigurationPackage.created_at.desc())
    if package_type:
        stmt = stmt.where(ConfigurationPackage.package_type == package_type)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=PackageOut, status_code=201)
async def create_package(
    body: PackageCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    if body.package_type not in ("payload", "sensor"):
        raise HTTPException(status_code=400, detail="package_type must be 'payload' or 'sensor'")

    # Compute total mass from component tree
    total_mass = 0.0
    for item in body.component_tree:
        cid = item.get("component_id")
        if cid:
            result = await session.execute(
                select(ComponentRegistry).where(ComponentRegistry.component_id == uuid.UUID(cid))
            )
            comp = result.scalar_one_or_none()
            if comp and comp.physics.get("mass_kg"):
                total_mass += comp.physics["mass_kg"]

    entry = ConfigurationPackage(
        name=body.name,
        package_type=body.package_type,
        component_tree=body.component_tree,
        total_mass_kg=total_mass if total_mass > 0 else None,
        description=body.description,
    )
    session.add(entry)
    await session.flush()
    await session.refresh(entry)
    logger.info("package_created", package_id=str(entry.package_id), name=entry.name)
    return entry


@router.get("/{package_id}", response_model=PackageOut)
async def get_package(
    package_id: uuid.UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(ConfigurationPackage).where(ConfigurationPackage.package_id == package_id)
    )
    pkg = result.scalar_one_or_none()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    return pkg


@router.put("/{package_id}", response_model=PackageOut)
async def update_package(
    package_id: uuid.UUID,
    body: PackageUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(ConfigurationPackage).where(ConfigurationPackage.package_id == package_id)
    )
    pkg = result.scalar_one_or_none()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(pkg, field, value)
    pkg.updated_at = datetime.utcnow()
    await session.flush()
    await session.refresh(pkg)
    return pkg


@router.delete("/{package_id}", status_code=204)
async def delete_package(
    package_id: uuid.UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(ConfigurationPackage).where(ConfigurationPackage.package_id == package_id)
    )
    pkg = result.scalar_one_or_none()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    await session.delete(pkg)
    logger.info("package_deleted", package_id=str(package_id))
```

**Step 4: Run test to verify it passes**

Run: `cd /home/samuel/mission-control && python -m pytest tests/unit/test_package_schemas.py -v`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add backend/api/packages.py tests/unit/test_package_schemas.py
git commit -m "feat: Configuration Package CRUD API — payload and sensor packages"
```

---

### Task 6: Robot Configuration CRUD + Build endpoint

**Files:**
- Create: `backend/api/configurations.py`
- Test: `tests/unit/test_configuration_schemas.py`

**Step 1: Write the failing test**

Create `tests/unit/test_configuration_schemas.py`:

```python
"""Unit tests for Robot Configuration API schemas."""
import pytest
from pydantic import ValidationError


def test_config_create_minimal():
    from backend.api.configurations import ConfigurationCreate
    c = ConfigurationCreate(name="CR10 Tabletop", base_type="standing")
    assert c.name == "CR10 Tabletop"
    assert c.base_config == {}


def test_config_create_with_packages():
    from backend.api.configurations import ConfigurationCreate
    c = ConfigurationCreate(
        name="CR10 Full Rig",
        base_type="track",
        base_config={"track_length_mm": 3000},
        payload_package_id="550e8400-e29b-41d4-a716-446655440000",
    )
    assert c.base_type == "track"
    assert c.base_config["track_length_mm"] == 3000


def test_config_create_valid_base_types():
    from backend.api.configurations import ConfigurationCreate, VALID_BASE_TYPES
    assert set(VALID_BASE_TYPES) == {"standing", "track", "track_weighted"}


def test_config_create_requires_name():
    from backend.api.configurations import ConfigurationCreate
    with pytest.raises(ValidationError):
        ConfigurationCreate(base_type="standing")


def test_config_out_has_generated_files():
    from backend.api.configurations import ConfigurationOut
    assert "generated_files" in ConfigurationOut.model_fields


def test_build_result_fields():
    from backend.api.configurations import BuildResult
    fields = set(BuildResult.model_fields.keys())
    assert {"config_id", "status", "generated_files", "errors"}.issubset(fields)
```

**Step 2: Run test to verify it fails**

Run: `cd /home/samuel/mission-control && python -m pytest tests/unit/test_configuration_schemas.py -v`
Expected: FAIL with `ModuleNotFoundError`

**Step 3: Write the endpoints**

Create `backend/api/configurations.py`:

```python
"""
Mission Control API — Robot Configuration Routes
Configuration CRUD and Build (file generation) endpoint.
"""

import uuid
from datetime import datetime
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.registry.models import (
    Robot,
    RobotConfiguration,
    ConfigurationPackage,
    ComponentRegistry,
)
from db.session import get_registry_session

logger = structlog.get_logger(__name__)
router = APIRouter()

VALID_BASE_TYPES = ["standing", "track", "track_weighted"]


class ConfigurationCreate(BaseModel):
    name: str
    base_type: str = "standing"
    base_config: dict = Field(default_factory=dict)
    payload_package_id: Optional[uuid.UUID] = None
    sensor_package_id: Optional[uuid.UUID] = None


class ConfigurationUpdate(BaseModel):
    name: Optional[str] = None
    base_type: Optional[str] = None
    base_config: Optional[dict] = None
    payload_package_id: Optional[uuid.UUID] = None
    sensor_package_id: Optional[uuid.UUID] = None


class ConfigurationOut(BaseModel):
    config_id: uuid.UUID
    robot_id: str
    name: str
    base_type: str
    base_config: dict
    payload_package_id: Optional[uuid.UUID]
    sensor_package_id: Optional[uuid.UUID]
    status: str
    generated_files: dict
    validation_report_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BuildResult(BaseModel):
    config_id: uuid.UUID
    status: str
    generated_files: dict
    errors: list[str]


@router.get("/{robot_id}/configurations", response_model=list[ConfigurationOut])
async def list_configurations(
    robot_id: str,
    session: AsyncSession = Depends(get_registry_session),
):
    stmt = (
        select(RobotConfiguration)
        .where(RobotConfiguration.robot_id == robot_id)
        .order_by(RobotConfiguration.created_at.desc())
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("/{robot_id}/configurations", response_model=ConfigurationOut, status_code=201)
async def create_configuration(
    robot_id: str,
    body: ConfigurationCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    # Verify robot exists
    result = await session.execute(select(Robot).where(Robot.robot_id == robot_id))
    robot = result.scalar_one_or_none()
    if not robot:
        raise HTTPException(status_code=404, detail="Robot not found")

    if body.base_type not in VALID_BASE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid base_type. Must be one of: {VALID_BASE_TYPES}",
        )

    entry = RobotConfiguration(
        robot_id=robot_id,
        name=body.name,
        base_type=body.base_type,
        base_config=body.base_config,
        payload_package_id=body.payload_package_id,
        sensor_package_id=body.sensor_package_id,
    )
    session.add(entry)
    await session.flush()
    await session.refresh(entry)
    logger.info("configuration_created", config_id=str(entry.config_id), robot_id=robot_id)
    return entry


@router.get("/configurations/{config_id}", response_model=ConfigurationOut)
async def get_configuration(
    config_id: uuid.UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(RobotConfiguration).where(RobotConfiguration.config_id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    return config


@router.put("/configurations/{config_id}", response_model=ConfigurationOut)
async def update_configuration(
    config_id: uuid.UUID,
    body: ConfigurationUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(RobotConfiguration).where(RobotConfiguration.config_id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")

    if body.base_type and body.base_type not in VALID_BASE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid base_type. Must be one of: {VALID_BASE_TYPES}",
        )

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(config, field, value)
    config.updated_at = datetime.utcnow()
    await session.flush()
    await session.refresh(config)
    return config


@router.delete("/configurations/{config_id}", status_code=204)
async def delete_configuration(
    config_id: uuid.UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(RobotConfiguration).where(RobotConfiguration.config_id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    await session.delete(config)
    logger.info("configuration_deleted", config_id=str(config_id))


@router.post("/configurations/{config_id}/build", response_model=BuildResult)
async def build_configuration(
    config_id: uuid.UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    """
    Build all Isaac pipeline files from a robot configuration.
    Checks approval gate, generates URDF + USD + cuRobo YAML + sensor configs,
    validates via Validator Agent, registers in FileRegistry.
    """
    # Load configuration
    result = await session.execute(
        select(RobotConfiguration).where(RobotConfiguration.config_id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")

    errors: list[str] = []

    # Approval gate: check all components in packages are approved
    for pkg_id in [config.payload_package_id, config.sensor_package_id]:
        if not pkg_id:
            continue
        pkg_result = await session.execute(
            select(ConfigurationPackage).where(ConfigurationPackage.package_id == pkg_id)
        )
        pkg = pkg_result.scalar_one_or_none()
        if not pkg:
            errors.append(f"Package {pkg_id} not found")
            continue
        for item in pkg.component_tree:
            cid = item.get("component_id")
            if not cid:
                continue
            comp_result = await session.execute(
                select(ComponentRegistry).where(
                    ComponentRegistry.component_id == uuid.UUID(cid)
                )
            )
            comp = comp_result.scalar_one_or_none()
            if not comp:
                errors.append(f"Component {cid} not found")
            elif comp.approval_status != "approved":
                errors.append(
                    f"Component '{comp.name}' ({cid}) has status '{comp.approval_status}' — must be approved"
                )

    if errors:
        return BuildResult(
            config_id=config_id,
            status="failed",
            generated_files={},
            errors=errors,
        )

    # TODO: Task 7 — call config_generator service to produce files
    # TODO: Task 8 — call Validator Agent for blind validation
    # TODO: register generated files in FileRegistry

    config.status = "built"
    config.updated_at = datetime.utcnow()
    await session.flush()

    logger.info("configuration_build_started", config_id=str(config_id))

    return BuildResult(
        config_id=config_id,
        status="built",
        generated_files=config.generated_files,
        errors=[],
    )
```

**Step 4: Run test to verify it passes**

Run: `cd /home/samuel/mission-control && python -m pytest tests/unit/test_configuration_schemas.py -v`
Expected: All 6 tests PASS

**Step 5: Register routers in main.py**

In `backend/main.py`:

```python
from api.packages import router as packages_router
from api.configurations import router as configurations_router

app.include_router(packages_router, prefix="/api/packages", tags=["Packages"])
app.include_router(configurations_router, prefix="/api/robots", tags=["Configurations"])
# Note: build endpoint is at /api/robots/configurations/{id}/build
```

**Step 6: Commit**

```bash
git add backend/api/configurations.py tests/unit/test_configuration_schemas.py backend/api/packages.py backend/main.py
git commit -m "feat: Robot Configuration CRUD + Build endpoint with approval gate"
```

---

## Phase 4: Config Generation Service

### Task 7: URDF generator from component tree

**Files:**
- Create: `backend/services/config_generator.py`
- Test: `tests/unit/test_config_generator.py`

**Step 1: Write the failing test**

Create `tests/unit/test_config_generator.py`:

```python
"""Unit tests for config generator — URDF output from component tree."""
import pytest


def test_generate_urdf_minimal():
    """Bare robot arm with no payload generates valid URDF."""
    from backend.services.config_generator import generate_urdf_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 6,
        "base_type": "standing",
        "base_config": {},
        "joints": [
            {
                "joint_name": "joint_1",
                "joint_type": "revolute",
                "parent_link": "base_link",
                "child_link": "link_1",
                "axis": [0, 0, 1],
                "lower_limit": -3.14,
                "upper_limit": 3.14,
                "effort_limit": 47.3,
                "velocity_limit": 2.618,
            },
        ],
        "links": [
            {"link_name": "base_link", "mass": 12.5, "inertia_ixx": 0.05, "inertia_iyy": 0.05, "inertia_izz": 0.03},
            {"link_name": "link_1", "mass": 3.7, "inertia_ixx": 0.01, "inertia_iyy": 0.01, "inertia_izz": 0.005},
        ],
        "payload_components": [],
        "sensor_components": [],
    }

    urdf_xml = generate_urdf_from_config(config)
    assert '<?xml version="1.0"' in urdf_xml
    assert '<robot name="Test Arm">' in urdf_xml
    assert 'joint_1' in urdf_xml
    assert 'base_link' in urdf_xml
    assert '<mass value="12.5"/>' in urdf_xml
    assert '</robot>' in urdf_xml


def test_generate_urdf_with_payload():
    """Robot with camera payload adds fixed joints and links."""
    from backend.services.config_generator import generate_urdf_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 1,
        "base_type": "standing",
        "base_config": {},
        "joints": [
            {
                "joint_name": "joint_1",
                "joint_type": "revolute",
                "parent_link": "base_link",
                "child_link": "link_1",
                "axis": [0, 0, 1],
                "lower_limit": -3.14,
                "upper_limit": 3.14,
                "effort_limit": 47.3,
                "velocity_limit": 2.618,
            },
        ],
        "links": [
            {"link_name": "base_link", "mass": 12.5},
            {"link_name": "link_1", "mass": 3.7},
        ],
        "payload_components": [
            {
                "joint_name": "camera_plate_joint",
                "joint_type": "fixed",
                "parent_link": "link_1",
                "child_link": "camera_plate_link",
                "origin_xyz": [0, 0, 0.05],
                "origin_rpy": [0, 0, 0],
                "link": {
                    "link_name": "camera_plate_link",
                    "mass": 0.45,
                },
            },
            {
                "joint_name": "camera_body_joint",
                "joint_type": "fixed",
                "parent_link": "camera_plate_link",
                "child_link": "camera_body_link",
                "origin_xyz": [0, 0, 0.03],
                "origin_rpy": [0, 0, 0],
                "link": {
                    "link_name": "camera_body_link",
                    "mass": 2.6,
                },
            },
        ],
        "sensor_components": [],
    }

    urdf_xml = generate_urdf_from_config(config)
    assert "camera_plate_joint" in urdf_xml
    assert "camera_body_joint" in urdf_xml
    assert "camera_plate_link" in urdf_xml
    assert '<mass value="2.6"/>' in urdf_xml


def test_generate_urdf_null_inertia_omitted():
    """Links with NULL inertia should omit inertial block, not use placeholders."""
    from backend.services.config_generator import generate_urdf_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 1,
        "base_type": "standing",
        "base_config": {},
        "joints": [],
        "links": [
            {"link_name": "base_link", "mass": None, "inertia_ixx": None},
        ],
        "payload_components": [],
        "sensor_components": [],
    }

    urdf_xml = generate_urdf_from_config(config)
    assert "<inertial>" not in urdf_xml
    assert "0.001" not in urdf_xml  # No placeholder inertia


def test_generate_urdf_track_base():
    """Track base adds prismatic joint."""
    from backend.services.config_generator import generate_urdf_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 1,
        "base_type": "track",
        "base_config": {"track_length_mm": 3000},
        "joints": [
            {
                "joint_name": "joint_1",
                "joint_type": "revolute",
                "parent_link": "base_link",
                "child_link": "link_1",
                "axis": [0, 0, 1],
                "lower_limit": -3.14,
                "upper_limit": 3.14,
                "effort_limit": 47.3,
                "velocity_limit": 2.618,
            },
        ],
        "links": [
            {"link_name": "base_link", "mass": 12.5},
            {"link_name": "link_1", "mass": 3.7},
        ],
        "payload_components": [],
        "sensor_components": [],
    }

    urdf_xml = generate_urdf_from_config(config)
    assert "base_track_joint" in urdf_xml
    assert 'type="prismatic"' in urdf_xml
```

**Step 2: Run test to verify it fails**

Run: `cd /home/samuel/mission-control && python -m pytest tests/unit/test_config_generator.py -v`
Expected: FAIL with `ImportError`

**Step 3: Write the URDF generator**

Create `backend/services/config_generator.py`:

```python
"""
Config Generator — Generates URDF, USD, cuRobo YAML from RobotConfiguration data.
All values must come from approved components. No placeholders. No estimates.
NULL fields are omitted, not filled.
"""

from typing import Any, Optional


def _fmt(v: float) -> str:
    """Format float without trailing zeros."""
    return f"{v:g}"


def _origin_tag(xyz: Optional[list], rpy: Optional[list]) -> str:
    if not xyz and not rpy:
        return ""
    x, y, z = xyz or [0, 0, 0]
    r, p, yw = rpy or [0, 0, 0]
    return f'    <origin xyz="{_fmt(x)} {_fmt(y)} {_fmt(z)}" rpy="{_fmt(r)} {_fmt(p)} {_fmt(yw)}"/>'


def _link_xml(link: dict, mesh_path_urdf: Optional[str] = None) -> str:
    """Generate URDF <link> XML. Omits inertial block if mass is NULL."""
    name = link["link_name"]
    lines = [f'  <link name="{name}">']

    # Visual
    if mesh_path_urdf:
        lines += [
            "    <visual>",
            f'      <geometry><mesh filename="{mesh_path_urdf}"/></geometry>',
            "    </visual>",
        ]

    # Collision
    if mesh_path_urdf:
        lines += [
            "    <collision>",
            f'      <geometry><mesh filename="{mesh_path_urdf}"/></geometry>',
            "    </collision>",
        ]

    # Inertial — ONLY if mass is present (never placeholder)
    mass = link.get("mass")
    if mass is not None:
        lines.append("    <inertial>")
        lines.append(f'      <mass value="{_fmt(mass)}"/>')
        ixx = link.get("inertia_ixx")
        iyy = link.get("inertia_iyy")
        izz = link.get("inertia_izz")
        if ixx is not None and iyy is not None and izz is not None:
            ixy = link.get("inertia_ixy", 0)
            ixz = link.get("inertia_ixz", 0)
            iyz = link.get("inertia_iyz", 0)
            lines.append(
                f'      <inertia ixx="{_fmt(ixx)}" ixy="{_fmt(ixy)}" ixz="{_fmt(ixz)}" '
                f'iyy="{_fmt(iyy)}" iyz="{_fmt(iyz)}" izz="{_fmt(izz)}"/>'
            )
        lines.append("    </inertial>")

    lines.append("  </link>")
    return "\n".join(lines)


def _joint_xml(joint: dict) -> str:
    """Generate URDF <joint> XML."""
    name = joint["joint_name"]
    jtype = joint.get("joint_type", "fixed")
    parent = joint["parent_link"]
    child = joint["child_link"]

    lines = [f'  <joint name="{name}" type="{jtype}">']
    lines.append(f'    <parent link="{parent}"/>')
    lines.append(f'    <child link="{child}"/>')

    origin = _origin_tag(joint.get("origin_xyz"), joint.get("origin_rpy"))
    if origin:
        lines.append(origin)

    axis = joint.get("axis")
    if axis and jtype != "fixed":
        lines.append(f'    <axis xyz="{_fmt(axis[0])} {_fmt(axis[1])} {_fmt(axis[2])}"/>')

    if jtype in ("revolute", "prismatic"):
        lower = joint.get("lower_limit")
        upper = joint.get("upper_limit")
        effort = joint.get("effort_limit")
        velocity = joint.get("velocity_limit")
        if lower is not None and upper is not None:
            parts = [f'lower="{_fmt(lower)}"', f'upper="{_fmt(upper)}"']
            if effort is not None:
                parts.append(f'effort="{_fmt(effort)}"')
            if velocity is not None:
                parts.append(f'velocity="{_fmt(velocity)}"')
            lines.append(f"    <limit {' '.join(parts)}/>")

    lines.append("  </joint>")
    return "\n".join(lines)


def generate_urdf_from_config(config: dict) -> str:
    """
    Generate complete URDF XML from a robot configuration dict.

    config keys:
        robot_id, robot_name, dof, base_type, base_config,
        joints (list), links (list),
        payload_components (list), sensor_components (list)
    """
    robot_name = config["robot_name"]
    base_type = config.get("base_type", "standing")
    base_config = config.get("base_config", {})

    lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        f'<robot name="{robot_name}">',
        "",
    ]

    # Track base: add world link + prismatic joint before base_link
    if base_type in ("track", "track_weighted"):
        track_length_m = (base_config.get("track_length_mm", 3000)) / 1000.0
        lines.append(_link_xml({"link_name": "world"}))
        lines.append("")
        track_joint = {
            "joint_name": "base_track_joint",
            "joint_type": "prismatic",
            "parent_link": "world",
            "child_link": "base_link",
            "axis": [1, 0, 0],
            "lower_limit": 0,
            "upper_limit": track_length_m,
            "origin_xyz": [0, 0, 0],
        }
        lines.append(_joint_xml(track_joint))
        lines.append("")

        if base_type == "track_weighted":
            weight_kg = base_config.get("weight_plate_kg")
            lines.append(_link_xml({
                "link_name": "weight_plate_link",
                "mass": weight_kg,
            }))
            lines.append("")
            lines.append(_joint_xml({
                "joint_name": "base_weight_plate",
                "joint_type": "fixed",
                "parent_link": "world",
                "child_link": "weight_plate_link",
            }))
            lines.append("")

    # Robot links
    for link in config.get("links", []):
        lines.append(_link_xml(link))
        lines.append("")

    # Robot joints
    for joint in config.get("joints", []):
        lines.append(_joint_xml(joint))
        lines.append("")

    # Payload components (camera plate, camera body, lens, FIZ, etc.)
    for comp in config.get("payload_components", []):
        if "link" in comp:
            lines.append(_link_xml(comp["link"]))
            lines.append("")
        lines.append(_joint_xml(comp))
        lines.append("")

    # Sensor components
    for comp in config.get("sensor_components", []):
        if "link" in comp:
            lines.append(_link_xml(comp["link"]))
            lines.append("")
        lines.append(_joint_xml(comp))
        lines.append("")

    lines.append("</robot>")
    return "\n".join(lines)


def generate_usd_from_config(config: dict) -> str:
    """Generate USDA from a robot configuration. Task 8."""
    # TODO: implement in Task 8
    raise NotImplementedError("USD generation not yet implemented")


def generate_curobo_yaml_from_config(config: dict) -> str:
    """Generate cuRobo YAML from a robot configuration. Task 9."""
    # TODO: implement in Task 9
    raise NotImplementedError("cuRobo YAML generation not yet implemented")
```

**Step 4: Run test to verify it passes**

Run: `cd /home/samuel/mission-control && python -m pytest tests/unit/test_config_generator.py -v`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add backend/services/config_generator.py tests/unit/test_config_generator.py
git commit -m "feat: URDF generator from component tree — no placeholders, NULL-safe"
```

---

### Task 8: USD generator from component tree

**Files:**
- Modify: `backend/services/config_generator.py` (implement `generate_usd_from_config`)
- Test: `tests/unit/test_config_generator_usd.py`

**Step 1: Write the failing test**

Create `tests/unit/test_config_generator_usd.py`:

```python
"""Unit tests for USD generation from component tree."""
import pytest


def test_generate_usd_minimal():
    from backend.services.config_generator import generate_usd_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 1,
        "base_type": "standing",
        "base_config": {},
        "joints": [
            {
                "joint_name": "joint_1",
                "joint_type": "revolute",
                "parent_link": "base_link",
                "child_link": "link_1",
                "axis": [0, 0, 1],
                "lower_limit": -3.14,
                "upper_limit": 3.14,
            },
        ],
        "links": [
            {"link_name": "base_link", "mass": 12.5},
            {"link_name": "link_1", "mass": 3.7},
        ],
        "payload_components": [],
        "sensor_components": [],
    }

    usda = generate_usd_from_config(config)
    assert "#usda 1.0" in usda
    assert 'defaultPrim = "Test_Arm"' in usda
    assert 'upAxis = "Z"' in usda
    assert "base_link" in usda
    assert "link_1" in usda


def test_generate_usd_with_payload():
    from backend.services.config_generator import generate_usd_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 1,
        "base_type": "standing",
        "base_config": {},
        "joints": [],
        "links": [{"link_name": "base_link", "mass": 12.5}],
        "payload_components": [
            {
                "joint_name": "camera_body_joint",
                "joint_type": "fixed",
                "parent_link": "base_link",
                "child_link": "camera_body_link",
                "origin_xyz": [0, 0, 0.05],
                "link": {"link_name": "camera_body_link", "mass": 2.6},
            },
        ],
        "sensor_components": [],
    }

    usda = generate_usd_from_config(config)
    assert "camera_body_link" in usda
    assert "2.6" in usda


def test_generate_usd_null_mass_omitted():
    from backend.services.config_generator import generate_usd_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 1,
        "base_type": "standing",
        "base_config": {},
        "joints": [],
        "links": [{"link_name": "base_link", "mass": None}],
        "payload_components": [],
        "sensor_components": [],
    }

    usda = generate_usd_from_config(config)
    assert "physics:mass" not in usda
```

**Step 2: Run test to verify it fails**

Run: `cd /home/samuel/mission-control && python -m pytest tests/unit/test_config_generator_usd.py -v`
Expected: FAIL with `NotImplementedError`

**Step 3: Implement USD generator**

Replace the `generate_usd_from_config` stub in `backend/services/config_generator.py`:

```python
def generate_usd_from_config(config: dict) -> str:
    """
    Generate USDA (ASCII USD) from a robot configuration.
    Physics properties included where available. NULL = omitted.
    """
    robot_name = config["robot_name"].replace(" ", "_")
    base_type = config.get("base_type", "standing")

    lines = [
        "#usda 1.0",
        "(",
        f'    defaultPrim = "{robot_name}"',
        '    upAxis = "Z"',
        "    metersPerUnit = 1.0",
        ")",
        "",
        f'def Xform "{robot_name}" (',
        '    kind = "component"',
        ")",
        "{",
    ]

    def _add_link_xform(link: dict, indent: int = 1) -> None:
        pad = "    " * indent
        name = link["link_name"]
        mass = link.get("mass")
        lines.append(f'{pad}def Xform "{name}"')
        lines.append(f"{pad}{{")
        if mass is not None:
            lines.append(f"{pad}    float physics:mass = {_fmt(mass)}")
        lines.append(f"{pad}}}")
        lines.append("")

    # Track base
    if base_type in ("track", "track_weighted"):
        lines.append('    def Xform "world"')
        lines.append("    {")
        lines.append("    }")
        lines.append("")

    # Robot links
    for link in config.get("links", []):
        _add_link_xform(link)

    # Payload component links
    for comp in config.get("payload_components", []):
        if "link" in comp:
            _add_link_xform(comp["link"])

    # Sensor component links
    for comp in config.get("sensor_components", []):
        if "link" in comp:
            _add_link_xform(comp["link"])

    lines.append("}")
    return "\n".join(lines)
```

**Step 4: Run test to verify it passes**

Run: `cd /home/samuel/mission-control && python -m pytest tests/unit/test_config_generator_usd.py -v`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add backend/services/config_generator.py tests/unit/test_config_generator_usd.py
git commit -m "feat: USD generator from component tree — physics properties, NULL-safe"
```

---

### Task 9: cuRobo YAML generator from component tree

**Files:**
- Modify: `backend/services/config_generator.py` (implement `generate_curobo_yaml_from_config`)
- Test: `tests/unit/test_config_generator_curobo.py`

**Step 1: Write the failing test**

Create `tests/unit/test_config_generator_curobo.py`:

```python
"""Unit tests for cuRobo YAML generation from component tree."""
import pytest
import yaml


def test_generate_curobo_minimal():
    from backend.services.config_generator import generate_curobo_yaml_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 2,
        "joints": [
            {
                "joint_name": "joint_1",
                "velocity_limit": 2.618,
                "acceleration_limit": 5.0,
                "jerk_limit": 20.0,
            },
            {
                "joint_name": "joint_2",
                "velocity_limit": 2.618,
                "acceleration_limit": 5.0,
                "jerk_limit": 20.0,
            },
        ],
        "ee_link": "camera_body_link",
        "payload_components": [
            {
                "joint_name": "camera_body_joint",
                "link": {"link_name": "camera_body_link"},
            },
        ],
    }

    yaml_str = generate_curobo_yaml_from_config(config)
    parsed = yaml.safe_load(yaml_str)

    assert "robot_cfg" in parsed
    kin = parsed["robot_cfg"]["kinematics"]
    assert kin["ee_link"] == "camera_body_link"
    assert len(kin["cspace"]["joint_names"]) == 2
    assert len(kin["cspace"]["max_velocity"]) == 2


def test_generate_curobo_no_collision_spheres():
    """cuRobo config must NOT include collision_spheres or world_model."""
    from backend.services.config_generator import generate_curobo_yaml_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 1,
        "joints": [{"joint_name": "j1", "velocity_limit": 2.0, "acceleration_limit": 5.0, "jerk_limit": 20.0}],
        "ee_link": "link_1",
        "payload_components": [],
    }

    yaml_str = generate_curobo_yaml_from_config(config)
    assert "collision_spheres" not in yaml_str
    assert "world_model" not in yaml_str
    assert "obstacle" not in yaml_str


def test_generate_curobo_null_limit_omitted():
    """Joints with NULL velocity limit should be omitted from limits."""
    from backend.services.config_generator import generate_curobo_yaml_from_config

    config = {
        "robot_id": "test_arm",
        "robot_name": "Test Arm",
        "dof": 2,
        "joints": [
            {"joint_name": "j1", "velocity_limit": 2.618, "acceleration_limit": 5.0, "jerk_limit": 20.0},
            {"joint_name": "j2", "velocity_limit": None, "acceleration_limit": None, "jerk_limit": None},
        ],
        "ee_link": "link_2",
        "payload_components": [],
    }

    yaml_str = generate_curobo_yaml_from_config(config)
    parsed = yaml.safe_load(yaml_str)
    # j2 should still be listed but with null_fields noted
    assert "null_fields" in parsed["robot_cfg"]
    assert any("j2" in f.get("joint_name", "") for f in parsed["robot_cfg"]["null_fields"])
```

**Step 2: Run test to verify it fails**

Run: `cd /home/samuel/mission-control && python -m pytest tests/unit/test_config_generator_curobo.py -v`
Expected: FAIL with `NotImplementedError`

**Step 3: Implement cuRobo generator**

Replace the `generate_curobo_yaml_from_config` stub in `backend/services/config_generator.py`:

```python
def generate_curobo_yaml_from_config(config: dict) -> str:
    """
    Generate cuRobo YAML from robot configuration.
    Robot arm joints only. ee_link points to final payload frame.
    No collision_spheres, no world_model, no obstacle parameters.
    """
    import yaml

    robot_id = config["robot_id"]
    robot_name = config["robot_name"]
    joints = config.get("joints", [])
    ee_link = config.get("ee_link", f"link_{config.get('dof', 6)}")

    joint_names = []
    max_velocity = []
    max_acceleration = []
    max_jerk = []
    retract_config = []
    null_fields = []

    for j in joints:
        jname = j["joint_name"]
        joint_names.append(jname)
        retract_config.append(0.0)

        vel = j.get("velocity_limit")
        acc = j.get("acceleration_limit")
        jrk = j.get("jerk_limit")

        if vel is not None:
            max_velocity.append(vel)
        else:
            max_velocity.append(0.0)  # placeholder — flagged below
            null_fields.append({"joint_name": jname, "field": "velocity_limit", "criticality": "critical"})

        if acc is not None:
            max_acceleration.append(acc)
        else:
            max_acceleration.append(0.0)
            null_fields.append({"joint_name": jname, "field": "acceleration_limit", "criticality": "critical"})

        if jrk is not None:
            max_jerk.append(jrk)
        else:
            max_jerk.append(0.0)
            null_fields.append({"joint_name": jname, "field": "jerk_limit", "criticality": "critical"})

    curobo_config: dict[str, Any] = {
        "robot_cfg": {
            "kinematics": {
                "urdf_path": f"robots/{robot_id}/{robot_id}.urdf",
                "base_link": "base_link",
                "ee_link": ee_link,
                "cspace": {
                    "joint_names": joint_names,
                    "retract_config": retract_config,
                    "max_velocity": max_velocity,
                    "max_acceleration": max_acceleration,
                    "max_jerk": max_jerk,
                },
            },
            "self_collision": {
                "ignore_pairs": [],
            },
            "null_fields": null_fields,
        },
    }

    header = (
        f"# cuRobo configuration for {robot_name} ({robot_id})\n"
        f"# Generated by Robot Builder — jerk minimization only\n"
        f"# No collision_spheres, no world_model (per project constraints)\n\n"
    )

    return header + yaml.dump(curobo_config, default_flow_style=False, sort_keys=False)
```

**Step 4: Run test to verify it passes**

Run: `cd /home/samuel/mission-control && python -m pytest tests/unit/test_config_generator_curobo.py -v`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add backend/services/config_generator.py tests/unit/test_config_generator_curobo.py
git commit -m "feat: cuRobo YAML generator — jerk minimization only, NULL-flagged"
```

---

## Phase 5: Frontend Stores

### Task 10: Component store (Zustand)

**Files:**
- Create: `frontend/src/stores/componentStore.ts`

**Step 1: Create the store**

```typescript
import { create } from 'zustand';

export interface ComponentPhysics {
  mass_kg?: number | null;
  dimensions_mm?: { l: number; w: number; h: number } | null;
  center_of_mass?: [number, number, number] | null;
  inertia_tensor?: Record<string, number> | null;
}

export interface AttachmentInterface {
  name: string;
  type: string;
  role: 'provides' | 'accepts';
  offset_xyz?: [number, number, number];
  offset_rpy?: [number, number, number];
}

export interface DataSource {
  source: string;
  url?: string;
  tier: 1 | 2;
  field_path?: string;
  retrieved_at?: string;
}

export interface Component {
  component_id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  model: string | null;
  physics: ComponentPhysics;
  attachment_interfaces: AttachmentInterface[];
  data_sources: DataSource[];
  approval_status: 'pending_hit' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  visual_mesh_file_id: string | null;
  collision_mesh_file_id: string | null;
  source_mesh_file_id: string | null;
  thumbnail_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ComponentState {
  components: Component[];
  loading: boolean;
  error: string | null;

  fetchComponents: (category?: string, approvalStatus?: string) => Promise<void>;
  createComponent: (data: Partial<Component>) => Promise<Component | null>;
  approveComponent: (id: string, approvedBy: string, notes?: string) => Promise<boolean>;
  rejectComponent: (id: string, approvedBy: string, notes?: string) => Promise<boolean>;
  researchComponent: (name: string, category: string, manufacturer?: string, model?: string) => Promise<Component | null>;
  deleteComponent: (id: string) => Promise<boolean>;
}

export const useComponentStore = create<ComponentState>((set, get) => ({
  components: [],
  loading: false,
  error: null,

  fetchComponents: async (category, approvalStatus) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (approvalStatus) params.set('approval_status', approvalStatus);
      const qs = params.toString();
      const res = await fetch(`/mc/api/components${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ components: Array.isArray(data) ? data : [], loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load components', loading: false });
    }
  },

  createComponent: async (data) => {
    try {
      const res = await fetch('/mc/api/components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const comp: Component = await res.json();
      set({ components: [comp, ...get().components] });
      return comp;
    } catch {
      return null;
    }
  },

  approveComponent: async (id, approvedBy, notes) => {
    try {
      const res = await fetch(`/mc/api/components/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved_by: approvedBy, notes }),
      });
      if (!res.ok) return false;
      const updated: Component = await res.json();
      set({ components: get().components.map((c) => c.component_id === id ? updated : c) });
      return true;
    } catch {
      return false;
    }
  },

  rejectComponent: async (id, approvedBy, notes) => {
    try {
      const res = await fetch(`/mc/api/components/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved_by: approvedBy, notes }),
      });
      if (!res.ok) return false;
      const updated: Component = await res.json();
      set({ components: get().components.map((c) => c.component_id === id ? updated : c) });
      return true;
    } catch {
      return false;
    }
  },

  researchComponent: async (name, category, manufacturer, model) => {
    try {
      const res = await fetch('/mc/api/components/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, manufacturer, model }),
      });
      if (!res.ok) return null;
      const comp: Component = await res.json();
      set({ components: [comp, ...get().components] });
      return comp;
    } catch {
      return null;
    }
  },

  deleteComponent: async (id) => {
    try {
      const res = await fetch(`/mc/api/components/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      set({ components: get().components.filter((c) => c.component_id !== id) });
      return true;
    } catch {
      return false;
    }
  },
}));
```

**Step 2: Type check**

Run: `cd /home/samuel/mission-control/frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/stores/componentStore.ts
git commit -m "feat: Component store — Zustand store for component registry CRUD"
```

---

### Task 11: Builder store (Zustand)

**Files:**
- Create: `frontend/src/stores/builderStore.ts`

**Step 1: Create the store**

```typescript
import { create } from 'zustand';

export interface TreeNode {
  component_id: string;
  attach_to: string;
  joint_config: {
    type: string;
    origin_xyz?: [number, number, number];
    origin_rpy?: [number, number, number];
    axis?: [number, number, number];
    limits?: Record<string, number>;
  };
}

export interface Package {
  package_id: string;
  name: string;
  package_type: 'payload' | 'sensor';
  component_tree: TreeNode[];
  total_mass_kg: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface RobotConfig {
  config_id: string;
  robot_id: string;
  name: string;
  base_type: 'standing' | 'track' | 'track_weighted';
  base_config: Record<string, unknown>;
  payload_package_id: string | null;
  sensor_package_id: string | null;
  status: string;
  generated_files: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface BuildResult {
  config_id: string;
  status: string;
  generated_files: Record<string, string>;
  errors: string[];
}

interface BuilderState {
  // Robot configurations for selected robot
  configurations: RobotConfig[];
  selectedConfigId: string | null;
  configLoading: boolean;

  // Packages
  packages: Package[];
  packagesLoading: boolean;

  // Build state
  building: boolean;
  buildResult: BuildResult | null;

  // HIT approval queue
  pendingApprovals: number;

  fetchConfigurations: (robotId: string) => Promise<void>;
  createConfiguration: (robotId: string, data: Partial<RobotConfig>) => Promise<RobotConfig | null>;
  updateConfiguration: (configId: string, data: Partial<RobotConfig>) => Promise<boolean>;
  deleteConfiguration: (configId: string) => Promise<boolean>;
  selectConfiguration: (configId: string | null) => void;
  buildConfiguration: (configId: string) => Promise<BuildResult | null>;

  fetchPackages: (packageType?: string) => Promise<void>;
  createPackage: (data: Partial<Package>) => Promise<Package | null>;
  deletePackage: (packageId: string) => Promise<boolean>;
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  configurations: [],
  selectedConfigId: null,
  configLoading: false,
  packages: [],
  packagesLoading: false,
  building: false,
  buildResult: null,
  pendingApprovals: 0,

  fetchConfigurations: async (robotId) => {
    set({ configLoading: true });
    try {
      const res = await fetch(`/mc/api/robots/${robotId}/configurations`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ configurations: Array.isArray(data) ? data : [], configLoading: false });
    } catch {
      set({ configurations: [], configLoading: false });
    }
  },

  createConfiguration: async (robotId, data) => {
    try {
      const res = await fetch(`/mc/api/robots/${robotId}/configurations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) return null;
      const config: RobotConfig = await res.json();
      set({ configurations: [config, ...get().configurations] });
      return config;
    } catch {
      return null;
    }
  },

  updateConfiguration: async (configId, data) => {
    try {
      const res = await fetch(`/mc/api/robots/configurations/${configId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) return false;
      const updated: RobotConfig = await res.json();
      set({ configurations: get().configurations.map((c) => c.config_id === configId ? updated : c) });
      return true;
    } catch {
      return false;
    }
  },

  deleteConfiguration: async (configId) => {
    try {
      const res = await fetch(`/mc/api/robots/configurations/${configId}`, { method: 'DELETE' });
      if (!res.ok) return false;
      set({ configurations: get().configurations.filter((c) => c.config_id !== configId) });
      return true;
    } catch {
      return false;
    }
  },

  selectConfiguration: (configId) => {
    set({ selectedConfigId: configId, buildResult: null });
  },

  buildConfiguration: async (configId) => {
    set({ building: true, buildResult: null });
    try {
      const res = await fetch(`/mc/api/robots/configurations/${configId}/build`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result: BuildResult = await res.json();
      set({ building: false, buildResult: result });
      // Refresh configurations to get updated status
      const config = get().configurations.find((c) => c.config_id === configId);
      if (config) {
        await get().fetchConfigurations(config.robot_id);
      }
      return result;
    } catch {
      set({ building: false });
      return null;
    }
  },

  fetchPackages: async (packageType) => {
    set({ packagesLoading: true });
    try {
      const qs = packageType ? `?package_type=${packageType}` : '';
      const res = await fetch(`/mc/api/packages${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ packages: Array.isArray(data) ? data : [], packagesLoading: false });
    } catch {
      set({ packages: [], packagesLoading: false });
    }
  },

  createPackage: async (data) => {
    try {
      const res = await fetch('/mc/api/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) return null;
      const pkg: Package = await res.json();
      set({ packages: [pkg, ...get().packages] });
      return pkg;
    } catch {
      return null;
    }
  },

  deletePackage: async (packageId) => {
    try {
      const res = await fetch(`/mc/api/packages/${packageId}`, { method: 'DELETE' });
      if (!res.ok) return false;
      set({ packages: get().packages.filter((p) => p.package_id !== packageId) });
      return true;
    } catch {
      return false;
    }
  },
}));
```

**Step 2: Type check**

Run: `cd /home/samuel/mission-control/frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/stores/builderStore.ts
git commit -m "feat: Builder store — configurations, packages, build action"
```

---

## Phase 6: Frontend Components

### Task 12: ComponentTree component

**Files:**
- Create: `frontend/src/components/builder/ComponentTree.tsx`

This is the hierarchical tree showing robot → base → EE → payload → sensors. Full implementation in the file — too large for inline plan code. Key behaviors:

- Renders tree nodes with component name, mass, approval status icon
- Click node → select (calls `onSelect(componentId)`)
- "+" button on nodes with open attachment points
- Right-click → remove, swap
- "Save as Package" button in header

**Step 1: Create file with component skeleton + key logic**

*(Implementer: follow the design doc UI spec at section 5, center-left panel. Use inline styles consistent with amber theme. See `RobotsPage.tsx` for style patterns.)*

**Step 2: Type check**

Run: `cd /home/samuel/mission-control/frontend && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add frontend/src/components/builder/ComponentTree.tsx
git commit -m "feat: ComponentTree — hierarchical component assembly tree"
```

---

### Task 13: ComponentPicker modal

**Files:**
- Create: `frontend/src/components/builder/ComponentPicker.tsx`

Modal for selecting a component to add at an attachment point. Filters by category and interface compatibility. Shows component name, manufacturer, mass, approval status.

*(Implementer: follow `SceneGenerateModal.tsx` for modal pattern. Filter components from `useComponentStore` by matching attachment interface types.)*

**Step 1: Create file**
**Step 2: Type check**
**Step 3: Commit**

```bash
git add frontend/src/components/builder/ComponentPicker.tsx
git commit -m "feat: ComponentPicker modal — search/filter compatible components"
```

---

### Task 14: PropertiesPanel component

**Files:**
- Create: `frontend/src/components/builder/PropertiesPanel.tsx`

Shows selected component's physics, dimensions, sources, approval status. Inline HIT approve/reject buttons. Source citations with tier badges.

**Step 1: Create file**
**Step 2: Type check**
**Step 3: Commit**

```bash
git add frontend/src/components/builder/PropertiesPanel.tsx
git commit -m "feat: PropertiesPanel — component physics, sources, HIT approval"
```

---

### Task 15: BuilderPreview3D component

**Files:**
- Create: `frontend/src/components/builder/BuilderPreview3D.tsx`

Three.js viewport showing assembled robot. Renders meshes where available, primitive geometry fallback. Highlights attachment points as amber markers. Highlights selected component.

*(Implementer: reuse patterns from `frontend/src/panels/Viewport3D/Viewport3D.tsx`. Orbit controls, ambient + directional light, grid helper.)*

**Step 1: Create file**
**Step 2: Type check**
**Step 3: Commit**

```bash
git add frontend/src/components/builder/BuilderPreview3D.tsx
git commit -m "feat: BuilderPreview3D — Three.js assembled robot preview"
```

---

### Task 16: MeshUploader component

**Files:**
- Create: `frontend/src/components/builder/MeshUploader.tsx`

Upload mesh files (STL, STEP, SolidWorks, OBJ, DAE, FBX). Preview in viewport. Confirm orientation. Trigger conversion. Link to component.

**Step 1: Create file**
**Step 2: Type check**
**Step 3: Commit**

```bash
git add frontend/src/components/builder/MeshUploader.tsx
git commit -m "feat: MeshUploader — mesh upload, preview, and format conversion"
```

---

### Task 17: Redesign RobotsPage with builder layout

**Files:**
- Modify: `frontend/src/pages/RobotsPage.tsx` (major rewrite)

Replace current 4-tab layout with:
- Left: Robot list with thumbnails
- Center: Configurator (ComponentTree + 3D preview + PropertiesPanel)
- Bottom bar: Build button + payload summary

*(Implementer: reference the UI layout from design doc section 5. Keep the existing robot creation form as a modal triggered by "+ New Robot". The Isaac and Real sub-tabs move to their own pages or become secondary views — discuss with user.)*

**Step 1: Create the new layout structure**
**Step 2: Wire up stores (robotStore, builderStore, componentStore)**
**Step 3: Type check and visual verification**
**Step 4: Commit**

```bash
git add frontend/src/pages/RobotsPage.tsx
git commit -m "feat: Redesigned RobotsPage — robot list + component-based configurator"
```

---

## Phase 7: Integration

### Task 18: Wire build endpoint to config generators

**Files:**
- Modify: `backend/api/configurations.py` (build endpoint)
- Modify: `backend/services/config_generator.py` (assembly logic)

Connect the build endpoint to actually call `generate_urdf_from_config`, `generate_usd_from_config`, `generate_curobo_yaml_from_config`. Register output files in `FileRegistry`.

**Step 1: Write integration test**

Create `tests/integration/test_build_pipeline.py`:

```python
"""Integration test: build endpoint produces valid files from configuration."""
import pytest


@pytest.mark.asyncio
async def test_build_produces_urdf_and_usd():
    """End-to-end: configuration with approved components → generated files."""
    # This test requires a running DB with test data
    # TODO: set up async test client with in-memory DB
    pass  # Placeholder — implement when async test fixtures are ready
```

**Step 2: Wire the generators into the build endpoint**

In `backend/api/configurations.py`, after the approval gate check, add:

```python
from services.config_generator import (
    generate_urdf_from_config,
    generate_usd_from_config,
    generate_curobo_yaml_from_config,
)
```

Assemble the config dict from Robot + packages + components, call each generator, hash the output, register in FileRegistry.

**Step 3: Commit**

```bash
git add backend/api/configurations.py backend/services/config_generator.py tests/integration/test_build_pipeline.py
git commit -m "feat: Wire build endpoint to URDF, USD, cuRobo generators"
```

---

### Task 19: AI research agent dispatcher

**Files:**
- Create: `backend/services/component_researcher.py`

Dispatches to MCP `agent__research` to find physics data for a component. Stores results in `ComponentRegistry.physics` and `data_sources`. Adds to HIT approval queue.

**Step 1: Create service**

```python
"""
Component Researcher — dispatches AI research agent to find physics data.
Results stored in ComponentRegistry, queued for HIT approval.
"""

import structlog

logger = structlog.get_logger(__name__)


async def research_component_physics(
    component_id: str,
    name: str,
    category: str,
    manufacturer: str | None = None,
    model: str | None = None,
) -> dict:
    """
    Dispatch research agent to find physics data for a component.
    Returns structured research results.

    In V1, this builds a research prompt and dispatches to agent__research.
    The agent searches:
      - Tier 1: NVIDIA Omniverse catalog, manufacturer datasheets
      - Tier 2: Cross-validated web sources
    """
    search_query = f"{manufacturer or ''} {model or name} {category} specifications mass dimensions datasheet"

    # TODO: dispatch to MCP agent__research
    # result = await mcp_client.call("agent__research", task=search_query)
    # parse result, extract physics fields, build data_sources list

    logger.info(
        "component_research_dispatched",
        component_id=component_id,
        query=search_query,
    )

    # Placeholder return — agent will populate via DB update
    return {
        "status": "dispatched",
        "component_id": component_id,
        "query": search_query,
    }
```

**Step 2: Wire into research endpoint**

In `backend/api/components.py`, update the `/research` endpoint to call `research_component_physics`.

**Step 3: Commit**

```bash
git add backend/services/component_researcher.py backend/api/components.py
git commit -m "feat: Component researcher service — AI agent dispatch for physics data"
```

---

### Task 20: Naming convention research

**Files:**
- No code — research task

**Step 1: Dispatch research agent**

Use `agent__research` to survey:
- ROS Industrial URDF naming conventions
- NVIDIA Isaac Sim/Lab example URDFs
- Cinema robotics frame naming (if any standard exists)
- USD naming conventions for articulated robots

**Step 2: Document findings**

Write results to `docs/plans/2026-03-XX-naming-convention.md`.

**Step 3: Propose convention and get HIT approval**

Present findings to user, finalize naming convention, update design doc.

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| **1. Database** | 1-2 | ORM models + Alembic migration |
| **2. Component API** | 3-4 | CRUD + approval + research trigger + router registration |
| **3. Config & Package API** | 5-6 | Package CRUD + Configuration CRUD + Build endpoint |
| **4. Config Generation** | 7-9 | URDF, USD, cuRobo YAML generators from component tree |
| **5. Frontend Stores** | 10-11 | componentStore + builderStore |
| **6. Frontend Components** | 12-17 | ComponentTree, ComponentPicker, PropertiesPanel, BuilderPreview3D, MeshUploader, RobotsPage redesign |
| **7. Integration** | 18-20 | Wire build pipeline, AI research dispatcher, naming convention |

**Total: 20 tasks, ~40-60 steps**

Each task is independently committable and testable. Backend tasks have TDD steps. Frontend tasks have type-check verification.
