# Robot Builder — Design Document

**Date:** 2026-03-02
**Version:** 1.0.0
**Status:** Approved
**Author:** Samuel + Claude

---

## 1. Overview

A **component-based robot configurator** that assembles modular physical components (robot arms, bases, cameras, lenses, FIZ motors, rails, sensors) into complete robot configurations, then generates all files required for the Isaac pipeline: USD, URDF, cuRobo YAML, sensor configs, and launch files.

The builder is AI-assisted — research agents find physics-accurate data from manufacturer datasheets and NVIDIA Omniverse, with Human-in-the-Loop (HIT) approval before any data enters the system.

### Goals

- Component-based robot assembly with predefined attachment points
- AI research agent populates physics data from ground-truth sources
- HIT approval for all AI-researched data before use
- Portable payload and sensor packages reusable across robots (with validation)
- Generate complete Isaac pipeline configs from assembled configuration
- Support STL, STEP, and SolidWorks 2025 mesh imports with format conversion

### Non-Goals (V1)

- Visual drag-and-drop 3D assembly (tree + 3D preview instead)
- Scene composition (separate feature, deferred)
- Real-time robot control from the builder
- Automated mesh generation (meshes must be uploaded or sourced)

---

## 2. Architecture

### Three-Layer Asset Model

```
Robot Asset (bare arm + base)
  + Payload Package (camera plate, camera body, lens, rails, FIZ, accessories)
  + Sensor Package (tracking cameras, depth sensors, etc.)
  = Complete Robot Configuration → generates all Isaac pipeline files
```

Each layer is independently saveable and reattachable. Payload and sensor packages are portable across compatible robots with validation checks (payload weight vs robot capacity, interface compatibility).

### Cinema Arm Attachment Chain

```
Robot Arm
 └─ End Effector (ee_flange)
     └─ Camera Plate (optional)
         └─ Camera Body
             ├─ Lens Mount → Lens
             └─ Rod Mount → 15mm/19mm Rails → FIZ Motors (Focus, Iris, Zoom)

Robot Base
 ├─ Standing (fixed pedestal)
 ├─ Track (linear rail, prismatic joint)
 └─ Track + Weight Plate
```

### Initial Scope

Cinema robot arms first (CR10, KUKA, Staubli, Fanuc used in film). Architecture supports future extension to bipeds, quadrupeds, wheeled bipeds, and mobile bases.

---

## 3. Data Model

### ComponentRegistry (new table)

Every physical component that can be part of a robot configuration.

```sql
component_registry (
    component_id         UUID PK DEFAULT gen_random_uuid(),
    name                 VARCHAR(256) NOT NULL,
    category             VARCHAR(64) NOT NULL,
        -- camera | lens | camera_plate | fiz | rail | base | sensor | accessory
    manufacturer         VARCHAR(256),
    model                VARCHAR(256),
    physics              JSONB NOT NULL DEFAULT '{}',
        -- {mass_kg, dimensions_mm: {l,w,h}, center_of_mass: [x,y,z], inertia_tensor: {ixx,iyy,izz,ixy,ixz,iyz}}
    attachment_interfaces JSONB NOT NULL DEFAULT '[]',
        -- [{name, type, role: "provides"|"accepts", offset_xyz, offset_rpy}]
    data_sources         JSONB NOT NULL DEFAULT '[]',
        -- [{source, url, tier: 1|2, field_path, retrieved_at}]
    approval_status      VARCHAR(32) NOT NULL DEFAULT 'pending_hit',
        -- pending_hit | approved | rejected
    approved_by          VARCHAR(256),
    approved_at          TIMESTAMP,
    visual_mesh_file_id  UUID,        -- FK to file_registry (USD/DAE for rendering)
    collision_mesh_file_id UUID,      -- FK to file_registry (simplified collision mesh)
    source_mesh_file_id  UUID,        -- FK to file_registry (original upload: STL/STEP/SLDPRT)
    thumbnail_path       VARCHAR(1024),
    notes                TEXT,
    created_at           TIMESTAMP DEFAULT now(),
    updated_at           TIMESTAMP DEFAULT now()
)
```

### ConfigurationPackage (new table)

Saved, reusable assemblies of components.

```sql
configuration_packages (
    package_id           UUID PK DEFAULT gen_random_uuid(),
    name                 VARCHAR(256) NOT NULL,
    package_type         VARCHAR(32) NOT NULL,
        -- payload | sensor
    component_tree       JSONB NOT NULL DEFAULT '[]',
        -- [{component_id, attach_to, joint_config: {type, origin_xyz, origin_rpy, axis, limits}}]
    total_mass_kg        FLOAT,       -- computed from components
    description          TEXT,
    created_at           TIMESTAMP DEFAULT now(),
    updated_at           TIMESTAMP DEFAULT now()
)
```

### RobotConfiguration (new table)

Ties robot + base + packages together. This is what the "Build" button operates on.

```sql
robot_configurations (
    config_id            UUID PK DEFAULT gen_random_uuid(),
    robot_id             VARCHAR(128) NOT NULL REFERENCES robots(robot_id),
    name                 VARCHAR(256) NOT NULL,
    base_type            VARCHAR(32) NOT NULL DEFAULT 'standing',
        -- standing | track | track_weighted
    base_config          JSONB NOT NULL DEFAULT '{}',
        -- {track_length_mm, weight_plate_kg, mount_height_mm, ...}
    payload_package_id   UUID REFERENCES configuration_packages(package_id),
    sensor_package_id    UUID REFERENCES configuration_packages(package_id),
    status               VARCHAR(32) NOT NULL DEFAULT 'draft',
        -- draft | built | validated | promoted
    generated_files      JSONB DEFAULT '{}',
        -- {urdf_file_id, usd_file_id, curobo_file_id, sensor_config_file_id, launch_file_id}
    validation_report_id UUID,
    created_at           TIMESTAMP DEFAULT now(),
    updated_at           TIMESTAMP DEFAULT now()
)
```

### Attachment Interface Types (reference data)

Standard interface types that components can provide/accept:

| Interface Type | Description | Standard |
|----------------|-------------|----------|
| `ee_flange` | Robot end effector | ISO 9409 |
| `camera_mount_3_8` | 3/8" camera mount | Industry standard |
| `camera_mount_1_4` | 1/4" camera mount | Industry standard |
| `pl_mount` | ARRI PL lens mount | ARRI |
| `lpl_mount` | ARRI LPL lens mount | ARRI |
| `ef_mount` | Canon EF lens mount | Canon |
| `rod_mount_15mm` | 15mm rod system | Cinema standard |
| `rod_mount_19mm` | 19mm studio rod system | Cinema standard |
| `arri_accessory_mount` | ARRI rosette/accessory mount | ARRI |
| `rail_clamp` | Rail-mounted clamp (FIZ, matte box) | Cinema standard |

*Note: Naming convention to be validated by research agent against existing URDF/USD/cinema robotics standards before finalizing.*

---

## 4. AI Research Pipeline

### Data Trust Tiers

| Tier | Source | Confidence | Auto-Accept? |
|------|--------|------------|-------------|
| **1 (ground truth)** | NVIDIA Omniverse assets, manufacturer datasheets | 1.0 | No — HIT approves |
| **2 (cross-validated)** | Multiple independent sources + physics sanity check | 0.95 | No — HIT approves |
| **3 (flagged)** | Single source or uncertain | 0.0 (NULL) | Never — must resolve |

No scores in the 0.01–0.79 range. A value is verified or absent.

### Research Flow

```
User requests component (e.g. "ARRI Signature Prime 35mm T1.8")
    │
    ▼
Research Agent (MCP: agent__research)
    ├─ Tier 1: NVIDIA Omniverse catalog lookup
    ├─ Tier 1: Manufacturer datasheet search
    ├─ Tier 2: Cross-validated web sources
    └─ Physics sanity checks
    │
    ▼
Structured Component Proposal
    ├─ All physics fields populated or explicitly NULL with reason
    ├─ Every value has source citation + tier
    ├─ Sanity check results (pass/warn/fail)
    └─ Confidence score per field
    │
    ▼
HIT Approval Queue
    ├─ Simple items → inline approve in builder
    └─ Complex items → dedicated review panel
    │
    ▼
Approved → ComponentRegistry (approval_status = approved)
```

### Required Research Fields Per Category

| Category | Required | Nice-to-Have |
|----------|----------|--------------|
| **Camera** | mass_kg, dimensions_mm, lens_mount_type, body_mount_points | center_of_mass, inertia_tensor, power_draw_W |
| **Lens** | mass_kg, length_mm, front_diameter_mm, mount_type, focal_length_mm | center_of_mass, max_diameter_mm |
| **Camera Plate** | mass_kg, dimensions_mm, mount_accepts, mount_provides | material, load_capacity_kg |
| **FIZ Motor** | mass_kg, dimensions_mm, clamp_type (15mm/19mm) | torque_nm, gear_pitch |
| **Rails** | mass_kg_per_m, diameter_mm (15/19), length_mm | material |
| **Base** | mass_kg, dimensions_mm, mount_type, load_capacity_kg | track_travel_mm (if track) |
| **Sensor** | mass_kg, dimensions_mm, mount_type, FOV, resolution | interface (USB/Ethernet/MIPI) |

### Physics Sanity Checks (automated, pre-HIT)

- Mass vs material density × volume (aluminum ~2700 kg/m³, steel ~7800)
- Total payload mass vs robot capacity
- Lens weight vs camera mount rated load
- Inertia tensor positive semi-definite
- Dimensions consistency (all positive, proportions reasonable)
- Flag round numbers per guardrail L1-R5

### Knowledge Persistence

Research agent stores sources in `data_sources` JSONB per component. Can create structured knowledge files (skills) for common manufacturer product lines to avoid re-researching the same patterns.

---

## 5. Builder UI

### Layout — Redesigned Robots Page

```
┌──────────────────────────────────────────────────────────────────────┐
│  Robots                                              [+ New Robot]   │
├────────────┬─────────────────────────────────────────────────────────┤
│            │                                                         │
│  ROBOT     │              CONFIGURATOR                               │
│  LIST      │                                                         │
│  (240px)   │  ┌─────────────────────┬──────────────────────────┐    │
│            │  │                     │                          │    │
│  [thumb]   │  │  COMPONENT TREE     │    3D PREVIEW            │    │
│  CR10      │  │  (280px)            │                          │    │
│  ────────  │  │                     │    Live preview of       │    │
│  [thumb]   │  │  ▾ Robot: CR10      │    assembled config      │    │
│  KUKA      │  │    Base: Track      │                          │    │
│            │  │  ▾ Payload Package  │    Attachment points     │    │
│            │  │    Camera Plate     │    highlighted            │    │
│  ────────  │  │    ▾ Camera Body    │                          │    │
│  [+ New]   │  │      Lens           │                          │    │
│            │  │      Rod Mount     │                          │    │
│            │  │        Rails        │                          │    │
│            │  │        FIZ Focus    │                          │    │
│            │  │        FIZ Iris     │                          │    │
│            │  │  ▾ Sensor Package   │                          │    │
│            │  │    Tracking Cam     │                          │    │
│            │  │                     │                          │    │
│            │  ├─────────────────────┴──────────────────────────┤    │
│            │  │  PROPERTIES PANEL (collapsible, bottom)        │    │
│            │  │  Selected: ARRI Alexa Mini LF  mass: 2.6kg    │    │
│            │  │  Mount: PL  Sources: [ARRI datasheet ✓]       │    │
│            │  └───────────────────────────────────────────────┘    │
├────────────┴─────────────────────────────────────────────────────────┤
│  [Build All Configs]   Status: Draft    Payload: 4.8kg / 10kg max   │
└──────────────────────────────────────────────────────────────────────┘
```

### Left Panel — Robot List

- Thumbnail + name for each registered robot
- Status badge (draft, configured, validated)
- Click to load into configurator
- "+ New Robot" button at bottom

### Center-Left — Component Tree

- Hierarchical tree mirroring the physical attachment chain
- Each node shows: component name, mass, approval status icon
- Click node → select, shows properties below + highlights in 3D
- Right-click node → remove, swap, edit joint config
- "+" button on nodes with open attachment points → component picker
- Component picker: search/filter by category, shows only interface-compatible components
- "Save as Payload Package" / "Save as Sensor Package" in tree header
- "Load Package" to attach a saved package

### Center-Right — 3D Preview

- Three.js viewport showing assembled robot
- Available attachment points rendered as glowing amber markers
- Selected component highlighted
- Mesh when available, primitive geometry (wireframe/dashed outline) when missing
- Updates live as tree changes
- Orbit/zoom controls

### Bottom — Properties Panel (collapsible)

- Selected component's physics data, dimensions, sources
- Editable joint config (origin xyz/rpy) for the attachment
- Inline HIT approve/reject buttons for pending components
- Source citations with tier badges (Tier 1 green, Tier 2 amber)
- Mesh status indicator (has mesh / missing mesh / primitive fallback)

### Bottom Bar — Build Action

- "Build All Configs" button → generates all Isaac pipeline files
- Payload summary: total mass vs robot capacity (progress bar, red if over)
- Configuration status badge (draft / built / validated / promoted)

---

## 6. Mesh Management

### Supported Import Formats

| Format | URDF (visual) | URDF (collision) | USD/Isaac Sim | RViz2 | Notes |
|--------|:---:|:---:|:---:|:---:|-------|
| **STL** | Yes | Yes (preferred) | Yes | Yes | Geometry only, no materials |
| **DAE (Collada)** | Yes | Yes | Yes | Yes | Materials + textures, preferred for URDF visual |
| **OBJ** | Yes | Yes | Yes | Yes | Materials via .mtl file |
| **FBX** | No | No | Yes | No | USD/Isaac only |
| **glTF/GLB** | No | No | Yes | No | Web-optimized, USD/Isaac only |
| **STEP** | No | No | Yes (CAD converter) | No | CAD native, Omniverse converts to USD |
| **SolidWorks 2025** | No | No | Yes (CAD converter) | No | .SLDPRT, .SLDASM via Omniverse |

### Conversion Pipeline

```
User uploads mesh (STL, STEP, SolidWorks, OBJ, FBX, DAE, glTF)
    │
    ├─ STL/DAE/OBJ → Store directly, usable by URDF + USD + RViz
    │
    ├─ FBX/glTF → Convert to DAE (for URDF) + keep original (for USD)
    │
    └─ STEP/SolidWorks/CAD →
         Convert to USD via Omniverse CAD Converter
         Convert to DAE or STL (for URDF) via intermediate step
         Store both: original CAD + converted formats
```

### Per-Component Mesh Storage

| Variant | Purpose | Format |
|---------|---------|--------|
| `source_mesh_file_id` | Original upload, archive/provenance | Any (STL, STEP, SLDPRT, etc.) |
| `visual_mesh_file_id` | Rendering in Isaac Sim + 3D preview | USD-compatible (USD, FBX, OBJ, DAE) |
| `collision_mesh_file_id` | Collision geometry in URDF + simulation | STL preferred, DAE accepted |

The generation engine picks the correct mesh variant per output format. Missing mesh → primitive geometry fallback with visual indicator in builder and warning in generated files.

### Upload Flow

```
Upload mesh file
    → Format detection
    → Preview in 3D viewport
    → User confirms orientation + origin alignment
    → Convert to required formats (USD, DAE/STL)
    → Store all variants in FileRegistry
    → Link to component (visual_mesh_file_id, collision_mesh_file_id, source_mesh_file_id)
    → Regenerate robot configs if component is in use
```

---

## 7. File Generation Pipeline

### Output Files

When the user clicks "Build All Configs", the system generates:

| File | Format | Contents |
|------|--------|----------|
| **URDF** | XML | Full kinematic chain: base → arm → EE → payload → sensors. Meshes as DAE/STL. Inertial from approved physics. NULL omitted, not estimated. |
| **USD** | USDA | Composed stage with ArticulationRoot. USD meshes where available, primitive fallback. Physics properties. Material assignments. |
| **cuRobo YAML** | YAML | Joint limits for robot arm joints only. ee_link pointing to final payload frame. Max velocity/acceleration/jerk from empirical data. No collision spheres, no world model. |
| **Sensor Configs** | YAML | Per-sensor parameters, topic names, calibration values or NULL-flagged. |
| **Launch File** | Python | ROS2 launch wiring: robot_state_publisher with URDF, sensor nodes with configs. |

### Generation Rules

1. **No placeholders.** Every value from an approved component or NULL. Build fails if any value is estimated or placeholder.
2. **Approval gate.** Build refuses if any component has `approval_status = pending_hit`.
3. **Validation pass.** Generated files go through the Validator Agent (blind validation) before registration.
4. **Atomic output.** All files generated together and registered as a set. Partial generation = failure.
5. **Provenance.** Each generated file records config_id, package_ids, and component_ids that produced it.

### Build Flow

```
"Build All Configs" clicked
    │
    ├─ Approval gate check → all components approved?
    │   └─ No → show which components need HIT approval, abort
    │
    ├─ Generate all files in memory
    │   ├─ URDF from component tree + joint configs + physics
    │   ├─ USD from component tree + mesh references + physics
    │   ├─ cuRobo YAML from robot arm joints + empirical limits
    │   ├─ Sensor configs from sensor package components
    │   └─ Launch file from complete configuration
    │
    ├─ Validator Agent validates each file (blind)
    │   └─ Any fail → show validation errors, no files registered
    │
    ├─ All pass → Register in FileRegistry as status=draft
    │   └─ generated_files JSONB updated with all file_ids
    │
    └─ User reviews → promotes to validated → promoted
```

### Backward Compatibility

The existing `generate-files` endpoint (scaffold generator) remains as fallback for robots not configured through the builder. The builder is the upgrade path — once a robot has a `RobotConfiguration`, builder output replaces scaffold files.

---

## 8. Joint/Frame Naming Convention

*To be validated by research agent against existing URDF/USD/cinema robotics standards before finalizing.*

### Proposed Standard

```
# Robot arm (existing, from manufacturer URDF)
joint_{n}                    # joint_1 through joint_6 (or manufacturer names)

# End effector
ee_flange                    # robot tool flange (ISO 9409)

# Base
base_mount                   # fixed base attachment
base_track_joint             # prismatic joint (track base, linear travel)
base_weight_plate            # fixed joint (track → weight plate)

# Payload chain
camera_plate_joint           # fixed, EE → camera plate
camera_body_joint            # fixed, plate/EE → camera body
lens_mount_joint             # fixed, camera → lens
rod_mount_joint              # fixed, plate/camera → rod mount
rail_joint                   # fixed, rod mount → rails
fiz_focus_joint              # fixed, rail → FIZ focus motor
fiz_iris_joint               # fixed, rail → FIZ iris motor
fiz_zoom_joint               # fixed, rail → FIZ zoom motor

# Sensors
sensor_{name}_joint          # fixed, mount point → sensor

# Link naming follows same pattern
# e.g. camera_plate_link, camera_body_link, lens_link, etc.
```

### Convention Rules

- All lowercase, underscore-separated
- Joints end with `_joint`, links end with `_link`
- Payload components prefixed by their category
- Sensor joints prefixed with `sensor_`
- Research agent will survey ROS Industrial, NVIDIA examples, and cinema robotics conventions before finalizing

---

## 9. File Organization

### Per-Robot Configuration Files

```
registry/robots/{robot_id}/
  ├── meshes/
  │   ├── source/          # Original uploads (STL, STEP, SLDPRT)
  │   ├── usd/             # Converted USD meshes
  │   └── urdf/            # Converted DAE/STL for URDF
  ├── configs/
  │   ├── {config_name}.urdf
  │   ├── {config_name}.usda
  │   ├── {config_name}_curobo.yaml
  │   ├── {config_name}_sensors.yaml
  │   └── {config_name}_launch.py
  └── packages/
      ├── payload_{name}.json
      └── sensor_{name}.json
```

### Shared Component Library

```
registry/components/
  ├── cameras/
  │   └── arri_alexa_mini_lf/
  │       ├── component.json       # Physics, interfaces, sources
  │       ├── meshes/              # source + converted variants
  │       └── thumbnail.png
  ├── lenses/
  ├── camera_plates/
  ├── fiz/
  ├── rails/
  ├── bases/
  ├── sensors/
  └── accessories/
```

---

## 10. API Endpoints (New)

### Components

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/components` | List components (filter by category, approval_status) |
| POST | `/api/components` | Create component (manual or from AI research) |
| GET | `/api/components/{id}` | Get component details |
| PUT | `/api/components/{id}` | Update component |
| POST | `/api/components/{id}/approve` | HIT approve component |
| POST | `/api/components/{id}/reject` | HIT reject component |
| POST | `/api/components/{id}/upload-mesh` | Upload mesh file for component |
| POST | `/api/components/research` | Trigger AI research for a component |

### Configuration Packages

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/packages` | List packages (filter by type) |
| POST | `/api/packages` | Save a package |
| GET | `/api/packages/{id}` | Get package details |
| PUT | `/api/packages/{id}` | Update package |
| DELETE | `/api/packages/{id}` | Delete package |
| POST | `/api/packages/{id}/validate` | Validate package against a robot |

### Robot Configurations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/robots/{robot_id}/configurations` | List configurations for a robot |
| POST | `/api/robots/{robot_id}/configurations` | Create configuration |
| GET | `/api/configurations/{id}` | Get configuration details |
| PUT | `/api/configurations/{id}` | Update configuration |
| DELETE | `/api/configurations/{id}` | Delete configuration |
| POST | `/api/configurations/{id}/build` | Build all Isaac pipeline files |
| GET | `/api/configurations/{id}/build-status` | Get build/validation status |

### Mesh Conversion

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/meshes/convert` | Convert uploaded mesh to target format(s) |
| GET | `/api/meshes/{file_id}/preview` | Get mesh preview data for 3D viewport |

### HIT Approval Queue

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/approvals/pending` | List all pending HIT approvals |
| GET | `/api/approvals/pending/{id}` | Get approval details with sources |
| POST | `/api/approvals/{id}/approve` | Approve with optional notes |
| POST | `/api/approvals/{id}/reject` | Reject with reason |

---

## 11. File Manifest

### New Files

| File | Purpose |
|------|---------|
| `frontend/src/pages/RobotsPage.tsx` | Redesigned: robot list + configurator (replaces current 4-tab layout) |
| `frontend/src/components/builder/ComponentTree.tsx` | Hierarchical component tree with attachment management |
| `frontend/src/components/builder/ComponentPicker.tsx` | Search/filter modal for adding components |
| `frontend/src/components/builder/PropertiesPanel.tsx` | Selected component properties, sources, HIT approval |
| `frontend/src/components/builder/BuilderPreview3D.tsx` | Three.js preview of assembled configuration |
| `frontend/src/components/builder/PackageManager.tsx` | Save/load payload and sensor packages |
| `frontend/src/components/builder/MeshUploader.tsx` | Mesh upload, preview, orientation, conversion |
| `frontend/src/components/builder/ApprovalQueue.tsx` | Dedicated HIT approval review panel |
| `frontend/src/stores/builderStore.ts` | Zustand store for builder state |
| `frontend/src/stores/componentStore.ts` | Zustand store for component library |
| `backend/api/components.py` | Component CRUD + research trigger endpoints |
| `backend/api/configurations.py` | Robot configuration + build endpoints |
| `backend/api/packages.py` | Configuration package CRUD endpoints |
| `backend/api/approvals.py` | HIT approval queue endpoints |
| `backend/services/config_generator.py` | Generates URDF, USD, cuRobo YAML, sensor configs, launch files from RobotConfiguration |
| `backend/services/mesh_converter.py` | Mesh format conversion (STL↔DAE, CAD→USD) |
| `backend/services/component_researcher.py` | AI research agent dispatcher for component physics |
| `backend/db/registry/models.py` | Add ComponentRegistry, ConfigurationPackage, RobotConfiguration tables |

### Modified Files

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Update Robots route to new builder layout |
| `backend/main.py` | Register new routers (components, configurations, packages, approvals) |

---

*Design approved 2026-03-02. Next step: implementation plan.*
