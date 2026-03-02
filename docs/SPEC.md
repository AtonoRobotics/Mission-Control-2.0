# Mission Control — Infrastructure Specification
**Version:** 2.1.0
**Project:** Cinema Robot Digital Twin
**Date:** 2026-03-01
**Status:** Active — v1 in development. Both databases live, all API routers implemented.

---

## Table of Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [What Mission Control Is Not](#2-what-mission-control-is-not)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Core Principles](#4-core-principles)
5. [Compute Layout & Modularity](#5-compute-layout--modularity)
6. [Unified Database](#6-unified-database)
7. [Agent Architecture](#7-agent-architecture)
8. [Claude Code Orchestration Rules](#8-claude-code-orchestration-rules)
9. [Infrastructure Build Processes](#9-infrastructure-build-processes)
10. [Workflow Builder](#10-workflow-builder)
11. [Web UI — Custom Full-Stack](#11-web-ui--custom-full-stack)
12. [ROS2 Visualization Layer](#12-ros2-visualization-layer)
13. [Isaac Stack Management](#13-isaac-stack-management)
14. [File & Config Registry](#14-file--config-registry)
15. [Repo Structure](#15-repo-structure)
16. [Open Decisions](#16-open-decisions)
17. [Glossary](#17-glossary)

---

## 1. Purpose & Scope

Mission Control is the **single on-premises web platform** for the cinema robot digital twin program. It serves two functions that are equally important and must be unified in one interface:

**Function 1 — Robotics Observability**
A full custom replacement for Foxglove Studio. Every ROS2 tool, every visualization panel, every data management feature — rebuilt natively inside Mission Control. No third-party observability platform. No vendor dependency.

**Function 2 — AI Training Pipeline Automation**
A node-based visual workflow builder for composing, saving, versioning, and executing multi-step training workflows across Isaac Sim, Isaac Lab, bag recording, dataset curation, config generation, and validation. Different scenarios get different workflow graphs. No monolithic scripts.

These two functions share one UI, one database, one auth system, and one backend. They are not separate products.

### In Scope — v1

| Domain | Responsibility |
|---|---|
| ROS2 Observability | Full custom web UI: topic monitor, TF tree, 3D viewer, image/pointcloud, bag record/play, node graph, diagnostics, parameter editor, service caller, log viewer |
| Isaac Sim 5.1 | Launch, configure, monitor USD stages, world configs, digital twin sync |
| Isaac Lab 2.3 | Training run config, trigger, monitor (scope TBD — see Open Decision OD-03) |
| Isaac ROS 4.0 | Configure, launch, monitor all nodes inside Docker containers |
| nvblox | Configure occupancy world params, monitor maps |
| cuRobo | Manage per-robot jerk minimization YAML configs |
| ZED X | Configure sensor params, calibration YAMLs, ROS2 topic routing |
| Docker Containers | Launch, stop, restart, monitor, manage volumes and networking |
| Empirical Database | Unified source of truth; validate all generated configs against it |
| File & Config Registry | Version, validate, promote URDFs, launch files, YAMLs, USD assets |
| Workflow Builder | Node-based visual composer for training and automation workflows |
| Compute Monitoring | GPU, CPU, memory, disk across all machines |
| Agent Monitoring | Status, logs, success/failure of all Claude Code sub-agents |

### Out of Scope — v1 (Future)

| Item | Reason |
|---|---|
| NVIDIA Cosmos | Deferred — future cinematography model training |
| GR00T | Deferred — future autonomous robot training |
| Cinematography model training | Deferred — future scope |
| Cloud compute | On-premises only in v1 |
| Motion control software interface | Separate upstream system — no interface |

---

## 2. What Mission Control Is Not

> These boundaries must be enforced in all agent prompts, Claude Code system prompts, and backend service logic.

- **Not a motion controller** — does not send joint commands to hardware
- **Not a path planner** — cuRobo runs as a pipeline component; Mission Control manages only its config files
- **Not a data pipeline** — does not transform or process sensor data; configures the nodes that do
- **Not a Foxglove wrapper** — builds all visualization natively; no iframe embeds of third-party tools
- **Not a cloud service** — all compute, storage, and execution on-premises

---

## 3. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MISSION CONTROL                              │
│                    Web UI (React) + Backend API (FastAPI)            │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────┐  │
│  │  ROS2 Viz    │  │  Workflow    │  │  Registry  │  │  Agent   │  │
│  │  (Custom     │  │  Builder     │  │  & DB      │  │  Monitor │  │
│  │  Foxglove    │  │  (Node-based │  │  Admin     │  │          │  │
│  │  replacement)│  │   composer)  │  │            │  │          │  │
│  └──────────────┘  └──────────────┘  └────────────┘  └──────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────┐  │
│  │  Isaac Stack │  │  Container   │  │  Build     │  │  Compute │  │
│  │  Manager     │  │  Manager     │  │  Processes │  │  Monitor │  │
│  └──────────────┘  └──────────────┘  └────────────┘  └──────────┘  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
   ┌──────────▼───────┐ ┌──────▼──────┐ ┌──────▼──────────┐
   │  Isaac ROS 4.0   │ │  Isaac Sim  │ │  Unified DB     │
   │  Docker          │ │  5.1        │ │  PostgreSQL      │
   │  Containers      │ │  Isaac Lab  │ │  ┌────────────┐  │
   │  ┌─────────────┐ │ │  2.3        │ │  │Empirical   │  │
   │  │ ROS2 Jazzy  │ │ └─────────────┘ │  │DB (6 tbl)  │  │
   │  │ nvblox      │ │                 │  ├────────────┤  │
   │  │ cuRobo      │ │                 │  │Registry DB │  │
   │  │ ZED X nodes │ │                 │  │(15 tbl)    │  │
   │  │ rosbridge   │ │                 │  └────────────┘  │
   │  └─────────────┘ │                 └─────────────────┘
   └──────────────────┘
              │
   ┌──────────▼───────────────────────┐
   │  Claude Code (Orchestrator)      │
   │  MCP Agents + Autogen Agents     │
   │  Infrastructure admin only       │
   │  Does NOT execute workflows      │
   └──────────────────────────────────┘
```

### Critical Architectural Constraints

| Constraint | Rule |
|---|---|
| ROS2 location | Never installed locally. Lives exclusively inside Isaac ROS Docker containers. |
| ROS2 web bridge | rosbridge_websocket inside container → WebSocket → Mission Control backend |
| Workflow execution | Mission Control backend executes workflow graphs directly. Claude Code agents are not involved. |
| Claude Code scope | Infrastructure administration only. Config generation, file management, container ops, DB queries. |
| Compute | On-premises only. No cloud dependencies. |
| Data integrity | Valid values or NULL with warning. No placeholders, no estimates, no dummy data. |

---

## 4. Core Principles

### P1 — Data Integrity (Non-Negotiable)
All generated configs, YAMLs, URDFs, launch files, and database records must contain only empirically verified values. Missing values are left blank/NULL with a warning notification logged and surfaced in the UI. Dummy values, placeholder values, and estimates are strictly prohibited at every layer — backend, agent, and UI.

**NULL handling:**
- Field with no verified source → written as blank/NULL
- Warning logged: field name, file path, build step, reason
- NULL summary report shown to operator after every build
- Files with critical NULLs (joint limits, mass, inertia, calibration paths) blocked from promotion
- Non-critical NULLs allow promotion with operator acknowledgment

### P2 — Modularity (Machines Move)
No hardcoded machine addresses. All inter-component addressing uses environment variables defined in a single `.env.machines` file per deployment. Moving any component to a new machine requires changing one environment variable.

### P3 — Separation of Concerns
- Mission Control backend = workflow execution + API + rosbridge client
- Claude Code agents = infrastructure administration (configs, files, containers, DB)
- These two systems do not overlap. Agents do not execute workflows. The workflow engine does not generate configs.

### P4 — Repeatability
Every process that can be done once must be repeatable exactly. Build processes produce identical outputs from identical inputs. Workflow graphs are versioned and replayable. Configs are registered and diffable.

### P5 — No Vendor Lock-in
All visualization is custom-built. No Foxglove, no third-party observability SaaS. All data stays on-premises. All tooling is owned.

---

## 5. Compute Layout & Modularity

### v1 Layout (Current)

| Machine | Hostname Env Var | Components |
|---|---|---|
| Workstation | `MC_HOST_PRIMARY` | Isaac Sim 5.1, Isaac Lab 2.3, Isaac ROS containers, nvblox, bag storage, Mission Control server, all visualization |

### Modular Config Pattern

Every deployable component declares its location via environment variable:

```yaml
# component.deploy.yaml — example Isaac ROS container
component: isaac-ros-container
host: ${MC_HOST_PRIMARY}
ros_domain_id: ${ROS_DOMAIN_ID}
rosbridge_port: ${MC_ROSBRIDGE_PORT}
volumes:
  urdf: ${MC_URDF_REGISTRY_PATH}
  bags: ${MC_BAG_STORAGE_PATH}
  configs: ${MC_CONFIG_REGISTRY_PATH}
  calibration: ${MC_CALIBRATION_PATH}
```

### `.env.machines` Structure

```bash
# Machine addresses
MC_HOST_PRIMARY=192.168.1.100
MC_HOST_TRAINING=192.168.1.101       # future
MC_HOST_STORAGE=192.168.1.102        # future

# Ports
MC_ROSBRIDGE_PORT=9090
MC_API_PORT=8000
MC_UI_PORT=3000

# Storage paths (all absolute, machine-local)
MC_BAG_STORAGE_PATH=/data/bags
MC_URDF_REGISTRY_PATH=/data/registry/urdf
MC_CONFIG_REGISTRY_PATH=/data/registry/configs
MC_USD_REGISTRY_PATH=/data/registry/usd
MC_CALIBRATION_PATH=/data/calibration
MC_DATASET_PATH=/data/datasets
MC_MODEL_PATH=/data/models

# ROS2
ROS_DOMAIN_ID=0
```

### Future Layout (designed for, not built in v1)

- Workstation: Isaac Sim rendering, Mission Control UI
- Training server: Isaac Lab, dataset storage
- Storage server: bag archive, model registry
- Cosmos/GR00T server: future synthetic data and training

---

## 6. Unified Database

Two logically and physically separate PostgreSQL databases, co-located on `MC_HOST_PRIMARY`.

### DB 1 — Empirical Database (v1.0.0 — live)

Single source of truth for all robot physical properties. Read-only for all agents and services except the DB Admin Agent.

**Tables:**

```
robots               — robot inventory (robot_id PK, dof, payload_kg, reach_mm, weight_kg, repeatability_mm)
joint_specs          — per-joint physical properties (type, limits, damping, friction, parent/child links)
link_specs           — per-link physical properties (mass, full inertia tensor, visual/collision meshes)
collision_spheres    — cuRobo collision geometry (center xyz + radius per link per sphere_index)
calibration_data     — sensor calibration records (JSONB data, calibration_type, sensor_id)
sensor_specs         — sensor hardware specs (type, model, mount offset, intrinsics/extrinsics JSONB)
```

- All physical fields nullable — NULL = unverified per GUARDRAILS L1-R3
- Unique constraints: (robot_id, joint_name), (robot_id, link_name), (robot_id, link_name, sphere_index)
- CR10 seeded: 1 robot, 8 joints, 9 links, 24 collision spheres (calibration/sensor empty — correct NULL)
- Never duplicated, never estimated — empirical values only
- Alembic migrations: `database/empirical/` (separate from registry)

### DB 2 — Mission Control Registry (live — 15 tables)

Tracks all artifacts, builds, sessions, and workflow state.

**Tables:**

```
file_registry        — versioned config files with status lifecycle (draft→validated→promoted→deprecated)
robots               — robot inventory, links to empirical DB by robot_id
urdf_registry        — canonical URDF versions per robot, build history, status
usd_registry         — USD assets, conversion history
scene_registry       — scene/environment definitions and USD stage paths
sensor_configs       — ZED X configs per robot/setup combination
launch_templates     — launch file templates per pipeline configuration
ros2_param_snapshots — parameter state captured per session
build_logs           — per-build step logs with NULL reports
agent_logs           — per-agent-run logs, inputs, outputs, errors
workflow_graphs      — saved node-based workflow definitions (JSON)
workflow_runs        — execution history per workflow graph
workflow_run_logs    — per-node execution log within a workflow run
dataset_registry     — training datasets, source bags, curation state
compute_snapshots    — periodic GPU/CPU/RAM/disk readings per machine
```

### Access Control

| Role | Empirical DB | Registry DB |
|---|---|---|
| Claude Code Orchestrator | Read | Read/Write |
| Infrastructure Agents | Read | Write (own domain) |
| Workflow Engine (backend) | Read | Read/Write |
| Web UI (via API) | Read | Read |
| Human Operator (via UI) | Read/Write (admin panel) | Read/Write |
| Motion pipeline software | None | None |

---

## 7. Agent Architecture

Claude Code agents handle **infrastructure administration only**. They do not execute workflow graphs. They do not control running pipelines.

### Hierarchy

```
Claude Code (Orchestrator)
│
├── MCP Agents (always try first)
│   ├── DB Agent          — empirical DB queries, registry writes
│   ├── File Agent        — config generation, validation, registry
│   └── Container Agent   — Docker lifecycle management
│
└── Autogen Agents (fallback — when no MCP agent covers the task)
    ├── URDF Build Agent
    ├── USD Conversion Agent
    ├── Scene Build Agent
    ├── Sensor Config Agent
    ├── Launch File Agent
    ├── cuRobo Config Agent
    └── Audit Agent
```

### Agent Definitions

#### DB Agent (MCP)
- **Purpose:** Query empirical DB; read/write registry DB
- **Scope:** Database operations only — no file writes, no process execution
- **Input:** Structured query spec from orchestrator
- **Output:** Structured data or write confirmation + row count

#### File Agent (MCP)
- **Purpose:** Generate, validate, version, register config files
- **Scope:** File system operations within `MC_CONFIG_REGISTRY_PATH` and `MC_URDF_REGISTRY_PATH` only
- **Input:** Config spec + validated data from DB Agent
- **Output:** Written file path + registry entry ID + NULL warning list

#### Container Agent (MCP)
- **Purpose:** Docker container lifecycle
- **Scope:** Start, stop, restart, inspect containers; manage volumes and env vars
- **Input:** Container action request with target container name
- **Output:** Container status + tail of logs

#### URDF Build Agent (Autogen)
- **Purpose:** Build URDF XML from empirical DB values
- **Scope:** URDF generation and structural validation only — no DB writes
- **Input:** robot_id, joint selection, link selection
- **Output:** URDF file (NULLs for unverified fields) + field-level validation report

#### USD Conversion Agent (Autogen)
- **Purpose:** Convert URDF ↔ USD, expand XACRO → URDF
- **Scope:** Conversion script execution only — no direct DB writes
- **Supported conversions:** URDF→USD, USD→URDF, XACRO→URDF
- **Input:** Source file path, target format, conversion params
- **Output:** Converted file path + conversion log

#### Scene Build Agent (Autogen)
- **Purpose:** Construct USD stages and Isaac Sim world configs
- **Scope:** Scene files and world YAMLs only
- **Input:** Scene spec (objects, layout, lighting, sensor placements, robot_id)
- **Output:** USD stage file + world config YAML + scene registry entry

#### Sensor Config Agent (Autogen)
- **Purpose:** Generate ZED X configuration YAMLs and ROS2 param files
- **Scope:** Sensor config files only — reads calibration from empirical DB
- **Input:** sensor_id, setup_id, robot_id
- **Output:** ZED X YAML + ROS2 param file + NULL warnings for missing calibration values

#### Launch File Agent (Autogen)
- **Purpose:** Generate and manage ROS2 launch files for all Isaac ROS nodes
- **Scope:** Launch files and associated param files only
- **Input:** Pipeline config spec, node list, param overrides, robot_id
- **Output:** Launch file set + validation report + NULL warnings for critical params

#### cuRobo Config Agent (Autogen)
- **Purpose:** Generate cuRobo jerk minimization configs per robot
- **Scope:** cuRobo YAML files only
- **Note:** cuRobo role is jerk minimization on 6-axis joint-space trajectories only — not path planning, not collision avoidance
- **Input:** robot_id, empirical per-joint limits from DB Agent
- **Output:** cuRobo YAML + NULL warnings for any missing joint limits

#### Audit Agent (Autogen)
- **Purpose:** Full pipeline health check and config drift detection
- **Scope:** Read-only across all systems — no writes
- **Input:** Scheduled trigger or operator request
- **Output:** Structured audit report (JSON) + human-readable summary for UI

---

## 8. Claude Code Orchestration Rules

Known failure mode: Claude Code drifts into executing agent tasks directly, bypassing the agent architecture. These rules are mandatory and must be embedded in `CLAUDE.md`.

### Hard Rules

**Rule 1 — Sub-agents always**
Claude Code never executes agent tasks directly. Every task with a defined agent must be dispatched to that agent. Claude Code only: receives requests, plans execution, dispatches, monitors, and reports results.

**Rule 2 — MCP agents first**
If a task can be handled by an MCP agent, it must be. Autogen agents are fallback only when no MCP agent covers the task.

**Rule 3 — No direct file writes**
Claude Code does not write config files, YAMLs, URDFs, or launch files. All file operations go through the File Agent.

**Rule 4 — No direct DB queries**
Claude Code does not query the database directly. All DB operations go through the DB Agent.

**Rule 5 — No direct container exec**
Claude Code does not run Docker commands directly. All container operations go through the Container Agent.

**Rule 6 — No workflow execution**
Claude Code does not execute workflow graphs. The Mission Control backend workflow engine owns that. Claude Code has no role in workflow execution.

**Rule 7 — Autogen setup is mandatory**
Before dispatching to any Autogen agent, Claude Code verifies the agent is properly initialized with all 6 required parameters (see Section 7). If setup fails, Claude Code fixes it and retries — it never absorbs the task itself.

**Rule 8 — Autonomous scope is limited**
Claude Code may act autonomously for: monitoring, scheduling, audit triggers, drift detection, and notifications. It may not autonomously modify any config, file, container state, or workflow without operator approval.

### Autogen Agent Initialization Checklist
Before dispatch, Claude Code verifies:
1. Role definition matches spec Section 7
2. Scope boundaries explicitly stated
3. DB connection params (read-only empirical, scoped write for registry)
4. File registry paths from `.env.machines`
5. NULL policy acknowledged
6. Output schema defined

---

## 9. Infrastructure Build Processes

Five repeatable, operator-triggered build processes. All are Claude Code agent workflows — not Mission Control workflow graphs (which are for training pipelines).

### Process 1 — Robot Build
**Trigger:** Operator selects robot_id → "Build Robot" in Mission Control UI

**Execution:**
1. DB Agent: Fetch all empirical data for robot_id
2. DB Agent: Identify NULL fields per criticality tier, generate NULL report
3. URDF Build Agent: Generate URDF from verified fields, leave NULLs blank
4. File Agent: Validate URDF structure, register in registry as `draft`
5. USD Conversion Agent: Convert URDF → USD
6. cuRobo Config Agent: Generate jerk config from per-joint empirical limits
7. File Agent: Register all outputs, assign build_id, tag semver
8. Mission Control UI: Display NULL summary, show build record, prompt operator review

**Outputs:** URDF + USD + cuRobo YAML + NULL report + build_log entry

**Promotion gate:** Operator reviews NULL report → approves → status `draft` → `validated` → `promoted`

---

### Process 2 — Environment / Scene Build
**Trigger:** Operator creates scene spec in UI → "Build Scene"

**Execution:**
1. DB Agent: Fetch asset registry entries for selected objects and robot_id
2. Scene Build Agent: Construct USD stage from spec
3. Scene Build Agent: Generate Isaac Sim world config YAML
4. File Agent: Register scene, assets, and world config
5. Launch File Agent: Generate Isaac Sim launch file for this scene

**Outputs:** USD stage + world YAML + launch file + scene registry entry

---

### Process 3 — Sensor Configuration
**Trigger:** Operator selects sensor_id + setup_id → "Generate Config"

**Execution:**
1. DB Agent: Fetch ZED X calibration and params for this sensor/setup
2. Sensor Config Agent: Generate ZED X YAML + ROS2 param file
3. File Agent: Validate and register sensor config
4. Launch File Agent: Generate or update relevant launch file section

**Outputs:** ZED X YAML + ROS2 params + launch file section + NULL warnings

---

### Process 4 — Isaac ROS Pipeline Launch
**Trigger:** Operator selects pipeline config → "Launch Pipeline"

**Execution:**
1. DB Agent: Fetch promoted launch file for selected config
2. Launch File Agent: Validate params, check for critical NULLs
3. Container Agent: Verify Isaac ROS container running; start if not
4. Container Agent: Execute launch file inside container
5. Mission Control: Open topic monitor for this pipeline's topics

**Outputs:** Running Isaac ROS pipeline + live ROS2 topic feed in web UI

---

### Process 5 — Full Pipeline Audit
**Trigger:** Operator request or scheduled (configurable interval, default: daily)

**Execution:**
1. Audit Agent: Scan empirical DB for critical NULL fields across all robots
2. Audit Agent: Check registry for config drift (file hash vs. registered hash)
3. Audit Agent: Check health of all Isaac ROS containers
4. Audit Agent: Verify launch file consistency against current DB values
5. Audit Agent: Verify sensor configs against calibration data in DB
6. File Agent: Write audit report to registry

**Outputs:** JSON audit report + web UI summary panel with drift alerts

---

## 10. Workflow Builder

The Workflow Builder is the core automation feature of Mission Control. It is a **node-based visual pipeline composer** for building, saving, versioning, and executing multi-step automation workflows. It is executed directly by the Mission Control backend — Claude Code agents have no role in workflow execution.

### Design Reference
Conceptually similar to: Isaac Sim Action Graph, Unreal Engine Blueprints, n8n, Node-RED. The key principle: different scenarios get different graphs. No monolithic script handles all cases.

### Execution Model
```
Operator opens graph in Workflow Builder UI
    │
    ▼
Operator clicks "Run"
    │
    ▼
Mission Control backend: parse graph JSON → build execution plan
    │
    ▼
Backend: execute nodes sequentially (or in parallel where edges allow)
    │
Each node:
    ├── Calls the relevant backend service (Isaac Sim API, ROS2 via rosbridge,
    │   container exec, DB query, file operation)
    ├── Returns result to graph runtime
    ├── Logs result to workflow_run_logs
    └── Evaluates output edges (conditional nodes branch here)
    │
    ▼
Backend: write workflow_run record (status, duration, per-node results)
    │
    ▼
Mission Control UI: show run result, per-node status, any errors
```

### Storage
- Graph definition stored as JSON in `workflow_graphs` table (DB)
- Exportable to YAML for Git versioning and human readability
- YAML importable back into DB
- Every run stored in `workflow_runs` with full per-node log

### Node Categories

#### 1. Bag Recording Nodes
| Node | Description |
|---|---|
| `bag.start` | Start recording specified topics to bag file |
| `bag.stop` | Stop active bag recording, register in dataset registry |
| `bag.filter` | Record only topics matching a filter pattern |
| `bag.inspect` | Read bag metadata, topic list, duration, size |

#### 2. Isaac Sim Scene Setup Nodes
| Node | Description |
|---|---|
| `sim.load_stage` | Load a USD stage into Isaac Sim |
| `sim.set_lighting` | Configure scene lighting (HDR, directional, ambient) |
| `sim.place_robot` | Place robot at specified pose in scene |
| `sim.set_physics` | Configure physics params (gravity, timestep, solver) |
| `sim.reset` | Reset simulation to initial state |
| `sim.play` | Start simulation playback |
| `sim.stop` | Stop simulation |

#### 3. Isaac Lab Training Config Nodes
| Node | Description |
|---|---|
| `lab.set_env` | Set Isaac Lab environment config params |
| `lab.set_training_params` | Set learning rate, batch size, steps, checkpointing |
| `lab.trigger_run` | Start a training run |
| `lab.monitor_run` | Poll training run status until complete or timeout |
| `lab.stop_run` | Stop an in-progress training run |
| `lab.export_checkpoint` | Export checkpoint to model registry |

#### 4. Dataset Curation Nodes
| Node | Description |
|---|---|
| `dataset.filter` | Filter bag files by topic, time range, or metadata |
| `dataset.label` | Apply labels/annotations to dataset entries |
| `dataset.version` | Create a versioned dataset snapshot in registry |
| `dataset.split` | Split dataset into train/val/test splits |
| `dataset.inspect` | Show dataset stats (size, topics, duration, labels) |

#### 5. Config Generation Nodes
| Node | Description |
|---|---|
| `config.urdf_build` | Trigger URDF build for robot_id (dispatches to URDF Build Agent) |
| `config.sensor_config` | Generate sensor config for sensor_id/setup_id |
| `config.launch_file` | Generate launch file for a pipeline config |
| `config.curob_config` | Generate cuRobo YAML for robot_id |

#### 6. Validation Nodes
| Node | Description |
|---|---|
| `validate.audit` | Run full pipeline audit (dispatches to Audit Agent) |
| `validate.null_check` | Check specified config file for NULL critical fields |
| `validate.db_compare` | Compare config values against current empirical DB values |
| `validate.hash_check` | Verify file hash matches registry entry |

#### 7. Notification Nodes
| Node | Description |
|---|---|
| `notify.operator` | Surface alert in Mission Control UI notification panel |
| `notify.log` | Write a message to workflow run log |
| `notify.email` | Send email notification (if SMTP configured) |

#### 8. Conditional Nodes
| Node | Description |
|---|---|
| `condition.if` | Branch on boolean result of previous node |
| `condition.threshold` | Branch based on numeric comparison (e.g. eval score > 0.95) |
| `condition.null_gate` | Block execution if specified field is NULL |
| `condition.switch` | Multi-branch routing based on enum value |

#### 9. Container Management Nodes
| Node | Description |
|---|---|
| `container.start` | Start specified Isaac ROS container |
| `container.stop` | Stop specified Isaac ROS container |
| `container.restart` | Restart container (stop + start) |
| `container.status` | Check container running state, return boolean |
| `container.exec` | Execute a command inside a running container |

### Example Workflow — Training Data Collection

```yaml
# workflow: collect_training_data.yaml
name: Collect Training Data — Robot Arm Take 1
version: 1.0.0
nodes:
  - id: check_container
    type: container.status
    params:
      container: isaac-ros-main

  - id: gate_container
    type: condition.if
    input: check_container.running
    true_edge: start_recording
    false_edge: start_container

  - id: start_container
    type: container.start
    params:
      container: isaac-ros-main
    next: start_recording

  - id: start_recording
    type: bag.start
    params:
      topics: ["/joint_states", "/zed/rgb", "/zed/depth", "/tf"]
      output_path: "${MC_BAG_STORAGE_PATH}/take_001"

  - id: wait_for_shot
    type: notify.operator
    params:
      message: "Recording active. Execute shot. Click Resume when complete."
      pause: true

  - id: stop_recording
    type: bag.stop
    next: validate_bag

  - id: validate_bag
    type: validate.null_check
    params:
      target: bag
    next: version_dataset

  - id: version_dataset
    type: dataset.version
    params:
      source: stop_recording.bag_path
      label: "take_001_raw"
    next: notify_complete

  - id: notify_complete
    type: notify.operator
    params:
      message: "Bag recorded and registered. Dataset version created."
```

---

## 11. Web UI — Custom Full-Stack

### Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | React + TypeScript | Best ecosystem for 3D/viz libraries, component architecture |
| 3D Rendering | Three.js | WebGL renderer for robot model, point clouds, scene viewer |
| State management | Zustand | Lightweight, no Redux boilerplate |
| WebSocket client | roslibjs | Standard ROS2 WebSocket client protocol |
| Graph editor | React Flow | Node-based workflow builder canvas |
| Charts / time series | Recharts or uPlot | High-frequency live data plots |
| Backend | FastAPI (Python) | Async, fast, strong typing, easy ROS2 integration |
| DB ORM | SQLAlchemy + Alembic | Migrations, type safety |
| ROS2 bridge | rosbridge_suite (in container) | WebSocket exposure of all ROS2 primitives |

### UI Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  MISSION CONTROL          [Robot: arm_001] [Session: 2026-03-01] │
├──────────┬───────────────────────────────────────────────────────┤
│          │                                                        │
│  NAV     │  MAIN CONTENT AREA (panel-based, resizable)           │
│          │                                                        │
│ Dashboard│                                                        │
│ ──────── │                                                        │
│ ROS2 ▼   │                                                        │
│  Topics  │                                                        │
│  TF Tree │                                                        │
│  3D View │                                                        │
│  Images  │                                                        │
│  Bags    │                                                        │
│  Nodes   │                                                        │
│  Params  │                                                        │
│  Logs    │                                                        │
│ ──────── │                                                        │
│ Isaac ▼  │                                                        │
│  Sim     │                                                        │
│  Lab     │                                                        │
│  ROS     │                                                        │
│ ──────── │                                                        │
│ Workflows│                                                        │
│ Registry │                                                        │
│ Builds   │                                                        │
│ Agents   │                                                        │
│ Compute  │                                                        │
│ Admin    │                                                        │
│          │                                                        │
└──────────┴───────────────────────────────────────────────────────┘
```

Panels are resizable, dockable, and saveable as layouts. Operators can create custom layouts (e.g. "recording layout", "monitoring layout", "training layout") and switch between them.

---

## 12. ROS2 Visualization Layer

All ROS2 communication flows through rosbridge WebSocket running inside the Isaac ROS container. The Mission Control backend maintains a persistent WebSocket connection to rosbridge and exposes a REST + WebSocket API to the React frontend.

### Tier 1 — Core Visualization (Build First)

| Panel | Description | ROS2 Equivalent |
|---|---|---|
| Topic Monitor | All active topics, type, hz, pub/sub count, live | `ros2 topic list/info/hz` |
| Topic Inspector | Subscribe any topic, live JSON message display | `ros2 topic echo` |
| TF Tree | Live interactive frame tree, quaternion display, 3D arrows | `view_frames` / RViz TF |
| 3D Scene Viewer | URDF robot model rendered from joint states, TF frames, coordinate axes, markers | RViz RobotModel + TF |
| Image Viewer | Multi-topic image display: RGB, depth, rectified, compressed | RViz ImageDisplay |
| Point Cloud Viewer | ZED X / nvblox live point cloud, colormap, density filter | RViz PointCloud2 |
| Node Graph | Live ROS2 node + topic connection graph, clickable | `rqt_graph` |
| Bag Recorder | Topic selection, start/stop recording, file naming, size monitor | `ros2 bag record` |
| Bag Player | Load bag, play/pause/seek, speed control, topic remapping | `ros2 bag play` |
| Bag Inspector | Topic list, message counts, duration, size, start/end time | `ros2 bag info` |

### Tier 2 — Diagnostics & Control

| Panel | Description | ROS2 Equivalent |
|---|---|---|
| Diagnostic Monitor | Node diagnostics, error/warn/ok status, history | `rqt_runtime_monitor` |
| Parameter Editor | View and live-edit ROS2 node parameters | `ros2 param list/get/set` |
| Service Inspector | Browse services, build request, call, show response | `ros2 service call` |
| Action Monitor | Action server/client state, goal status, feedback | `ros2 action list/info` |
| Log Viewer | Live ROS2 log stream, filter by level/node/keyword | `rqt_console` |
| Latency Monitor | Per-topic message latency and jitter over time | Custom |
| Frequency Monitor | Per-topic actual vs. expected publish rate | `ros2 topic hz` |

### Tier 3 — Isaac & Cinema Robot Specific

| Panel | Description |
|---|---|
| nvblox Map Viewer | Live occupancy map and ESDF visualization |
| Digital Twin Sync Monitor | Isaac Sim ↔ real robot joint state comparison |
| cuRobo Trajectory Inspector | Smoothed vs. raw joint trajectory overlay, per-joint jerk display |
| ZED X Status Panel | Camera connection status, calibration status, topic health |
| Joint State Monitor | Per-joint position, velocity, effort — live and historical |
| Isaac Sim Control | Play/pause/reset simulation, timestep display |

### Tier 4 — Mission Control Admin

| Panel | Description |
|---|---|
| Container Manager | Docker status per container, start/stop/restart, log tail |
| Agent Monitor | Claude Code sub-agent task queue, status, error log, retry |
| Build Process Controller | Trigger all 5 build processes, monitor progress, view outputs |
| File Registry Browser | Browse, diff, promote, deprecate URDFs/YAMLs/launch files |
| Workflow Builder | Node-based visual workflow composer, run, history |
| DB Admin Panel | Empirical DB viewer, NULL field browser, registry tables |
| Compute Monitor | GPU/CPU/RAM/disk per machine, live and historical |
| Config Audit Panel | Latest audit report, drift alerts, NULL summary |
| Notification Center | All system alerts, warnings, agent errors, NULL reports |

---

## 13. Isaac Stack Management

### Isaac ROS 4.0 (Docker)
- Containers pre-installed — Mission Control does not install them
- Mission Control manages: start/stop/restart, volume mounts, networking, ROS_DOMAIN_ID, launch file execution inside containers, rosbridge lifecycle
- Communication: all ROS2 data exits containers via rosbridge WebSocket on `MC_ROSBRIDGE_PORT`

### Isaac Sim 5.1
- Runs natively on workstation (not containerized)
- Mission Control manages: launch arguments, USD stage path, world config, Nucleus server connection, play/pause/reset
- Mission Control monitors: process status, topic bridge health, joint state sync

### Isaac Lab 2.3
- **Fully in scope for v1.** Isaac Lab 2.3 runs within Isaac Sim's Python interpreter — it is not a peer service. There is one process to manage, not two.
- Mission Control manages: environment configs, training run params, checkpoint output paths
- All `lab.*` Workflow Builder nodes are v1 deliverables — not stubbed

### cuRobo
- Runs inside Isaac ROS container
- Mission Control manages: per-robot YAML config (per-joint velocity limits, jerk limits from empirical DB)
- Role: **jerk minimization on 6-axis joint-space trajectories exclusively** — not path planning, not collision avoidance, not obstacle detection

### nvblox
- Runs inside Isaac ROS container
- Mission Control manages: occupancy world configuration params, map output paths

---

## 14. File & Config Registry

All generated files are versioned, hashed, and registered before use. No file enters an active pipeline without a registry entry.

### File Lifecycle

```
Agent generates file
       │
       ▼
File Agent: compute SHA256, write to registry as status=draft
       │
       ▼
Automated validation: schema check, NULL scan, critical field check
       │
       ├─► Validation passes → status=validated
       │
       └─► Validation fails → status=failed, operator notified
                   │
                   ▼
          Operator reviews validated file in Registry Browser
                   │
                   ▼
          Operator approves → status=promoted
                   │
                   ▼
          File is now eligible for use in pipelines and workflows
```

### Registry Entry Schema

```sql
CREATE TABLE file_registry (
    file_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_type       VARCHAR NOT NULL,  -- urdf, usd, launch, yaml_sensor, yaml_curob, yaml_scene
    robot_id        INTEGER REFERENCES empirical.robots(id),  -- nullable
    scene_id        UUID REFERENCES scene_registry(scene_id),  -- nullable
    version         VARCHAR NOT NULL,  -- semver
    file_hash       CHAR(64) NOT NULL,  -- SHA256
    file_path       VARCHAR NOT NULL,  -- absolute path using env-var base
    build_id        UUID REFERENCES build_logs(build_id),
    null_fields     JSONB,  -- array of {field, reason, criticality}
    status          VARCHAR NOT NULL DEFAULT 'draft',
                    -- CHECK status IN ('draft','validated','promoted','deprecated')
    created_at      TIMESTAMPTZ DEFAULT now(),
    promoted_at     TIMESTAMPTZ,
    promoted_by     VARCHAR,  -- operator identifier
    notes           TEXT
);
```

---

## 15. Repo Structure

```
mission-control/
│
├── .env.machines.example            # Template — copy to .env.machines, gitignore actual
├── .env.machines                    # Gitignored — machine-specific addresses + paths
├── docker-compose.yml               # Isaac ROS containers + rosbridge
├── README.md
│
├── docs/
│   ├── SPEC.md                      # This document
│   ├── AGENT_PROMPTS.md             # Per-agent system prompts (generated next)
│   ├── CLAUDE.md                    # Claude Code orchestration rules (generated next)
│   ├── DATA_INTEGRITY.md            # NULL policy reference card
│   └── WORKFLOW_NODES.md            # Full node catalog with params
│
├── orchestrator/                    # Claude Code domain
│   ├── CLAUDE.md                    # Symlink to docs/CLAUDE.md
│   ├── plans/                       # Declarative build plan YAMLs (operator-authored)
│   └── mcp/                         # MCP server config files
│       ├── db_agent.json
│       ├── file_agent.json
│       └── container_agent.json
│
├── agents/                          # Autogen agent definitions
│   ├── _base/                       # Shared initialization template
│   ├── urdf_build/
│   │   ├── agent.py
│   │   ├── prompt.md
│   │   └── output_schema.json
│   ├── usd_conversion/
│   ├── scene_build/
│   ├── sensor_config/
│   ├── launch_file/
│   ├── curob_config/
│   └── audit/
│
├── backend/                         # FastAPI application
│   ├── main.py
│   ├── api/                            # All 8 routers live — no stubs
│   │   ├── registry.py              # File registry CRUD, robot registration, scenes
│   │   ├── builds.py                # Build log CRUD, per-build file listing
│   │   ├── agents.py                # Agent logs (paginated), summary (GROUP BY)
│   │   ├── workflows.py             # Graph CRUD, run lifecycle, per-node logs
│   │   ├── compute.py               # Compute snapshots (list, latest/host, create)
│   │   ├── containers.py            # Docker SDK status check, graceful fallback
│   │   ├── ros2.py                  # Topics/nodes via rosbridge, connection status
│   │   └── isaac.py                 # Isaac Sim status (static — requires container)
│   ├── rosbridge/
│   │   ├── client.py                # Persistent rosbridge WebSocket client
│   │   ├── topic_monitor.py
│   │   ├── tf_listener.py
│   │   └── bag_manager.py
│   ├── workflow_engine/
│   │   ├── executor.py              # Graph execution runtime
│   │   ├── node_registry.py         # All node type implementations
│   │   ├── nodes/
│   │   │   ├── bag.py
│   │   │   ├── sim.py
│   │   │   ├── lab.py
│   │   │   ├── dataset.py
│   │   │   ├── config.py
│   │   │   ├── validate.py
│   │   │   ├── notify.py
│   │   │   ├── condition.py
│   │   │   └── container.py
│   │   └── graph_parser.py          # JSON/YAML graph → execution plan
│   ├── db/
│   │   ├── session.py               # Async engine init, get_registry_session, get_empirical_session
│   │   ├── empirical/
│   │   │   └── models.py            # EmpiricalBase + 6 models (Robot, JointSpec, LinkSpec, etc.)
│   │   └── registry/
│   │       └── models.py            # Base + 15 models (FileRegistry, BuildLog, AgentLog, etc.)
│   └── services/
│       ├── isaac_sim.py             # Isaac Sim process management
│       ├── isaac_lab.py             # Isaac Lab run management
│       └── compute_monitor.py       # GPU/CPU polling
│
├── frontend/                        # React + TypeScript application
│   ├── src/
│   │   ├── App.tsx
│   │   ├── layouts/                 # Saveable panel layouts
│   │   ├── pages/
│   │   │   ├── Dashboard/
│   │   │   ├── ROS2/
│   │   │   │   ├── TopicMonitor/
│   │   │   │   ├── TFTree/
│   │   │   │   ├── Viewer3D/        # Three.js robot + scene viewer
│   │   │   │   ├── ImageViewer/
│   │   │   │   ├── PointCloud/
│   │   │   │   ├── NodeGraph/
│   │   │   │   ├── BagManager/
│   │   │   │   ├── Parameters/
│   │   │   │   ├── Services/
│   │   │   │   └── LogViewer/
│   │   │   ├── Isaac/
│   │   │   │   ├── SimControl/
│   │   │   │   └── LabMonitor/
│   │   │   ├── Workflows/
│   │   │   │   ├── Builder/         # React Flow node canvas
│   │   │   │   ├── Library/         # Saved workflow graphs
│   │   │   │   └── Runs/            # Execution history
│   │   │   ├── Registry/
│   │   │   ├── Builds/
│   │   │   ├── Agents/
│   │   │   ├── Compute/
│   │   │   └── Admin/
│   │   ├── components/
│   │   │   ├── WorkflowNodes/       # React Flow custom node components
│   │   │   ├── ThreeViewer/         # Three.js scene wrapper
│   │   │   └── shared/
│   │   ├── hooks/
│   │   │   ├── useRosBridge.ts      # rosbridge WebSocket hook
│   │   │   ├── useTopic.ts
│   │   │   └── useTF.ts
│   │   └── store/                   # Zustand stores
│
├── registry/                        # File storage (managed by File Agent)
│   ├── urdf/
│   ├── usd/
│   ├── launch/
│   ├── sensor_configs/
│   ├── curob_configs/
│   └── scene_configs/
│
├── scripts/                         # Conversion and utility scripts
│   ├── urdf_to_usd.py
│   ├── xacro_to_urdf.py
│   ├── usd_to_urdf.py
│   └── validate_urdf.py
│
├── database/
│   ├── empirical/                   # Empirical DB Alembic migrations
│   │   ├── alembic.ini
│   │   ├── env.py                   # Reads MC_EMPIRICAL_DB_URL, imports EmpiricalBase
│   │   ├── script.py.mako
│   │   ├── seed_cr10.py             # Idempotent CR10 seed (parses URDF + collision YAML)
│   │   └── versions/
│   │       └── 0001_initial_schema.py  # 6 tables
│   └── registry/                    # Registry DB Alembic migrations
│       ├── alembic.ini
│       ├── env.py
│       ├── script.py.mako
│       └── versions/
│           ├── 0001_initial_schema.py  # 10 tables
│           └── 0002_add_remaining_tables.py  # 5 tables
│
├── workflows/                       # Saved workflow YAML exports (Git-versioned)
│   └── examples/
│       └── collect_training_data.yaml
│
└── isaac/
    ├── sim/                         # Isaac Sim launch configs and world YAMLs
    ├── lab/                         # Isaac Lab environment configs
    ├── ros/                         # Isaac ROS container configs and launch files
    └── worlds/                      # USD world stages
```

---

## 16. Resolved Decisions

All three open decisions are resolved. This section is final.

### OD-01 — v1 Automation Loop ✅ RESOLVED

The canonical v1 workflow follows the full 8-step NVIDIA reference architecture:

1. **Robot Build** — URDF + USD + cuRobo config from empirical DB
2. **Scene Build** — USD stage + Isaac Sim world config
3. **Sensor Config** — ZED X YAML + ROS2 param files
4. **Isaac ROS Pipeline Launch** — launch file execution inside Isaac ROS container
5. **Digital Twin Sync** — Isaac Sim ↔ real robot joint state comparison, verified via Mission Control
6. **Training Data Collection** — bag recording of selected topics during real robot operation
7. **Isaac Lab Training** — RL/IL training run using collected data
8. **Evaluation and Promotion** — checkpoint eval, operator approval, config promotion

All Workflow Builder node categories (`bag.*`, `sim.*`, `lab.*`, `config.*`, `validate.*`, `container.*`, `notify.*`, `condition.*`, `dataset.*`) are **v1 deliverables, not stubbed**.

---

### OD-02 — Isaac Sim / Isaac Lab Relationship ✅ RESOLVED

Isaac Sim 5.1 serves as **both** the digital twin visualizer and the environment Isaac Lab runs within.

Per NVIDIA documentation: Isaac Lab 2.3 is built on top of Isaac Sim and runs within Isaac Sim's Python interpreter. Isaac Lab requires Isaac Sim's installation, which packages the core robotics tools it depends on — URDF and MJCF importers, simulation managers, and ROS features. **Isaac Lab is not a peer service.** There is one process to manage, not two.

Architecture impact:
- The architecture diagram (Section 3) reflects this: Isaac Sim and Isaac Lab are shown as one block
- The DB access table reflects this: one entry for Isaac Sim/Lab
- Section 13 reflects this: Isaac Lab management lives within Isaac Sim process context
- `sim.*` and `lab.*` nodes are co-dependent in the workflow engine

---

### OD-03 — Isaac Lab Scope in v1 ✅ RESOLVED

**Isaac Lab 2.3 is fully in scope for v1.** All pipeline software ships in v1:

| Component | v1 Status |
|---|---|
| Isaac Sim 5.1 | ✅ In scope |
| Isaac Lab 2.3 | ✅ In scope — fully implemented |
| Isaac ROS 4.0 | ✅ In scope |
| cuRobo | ✅ In scope |
| nvblox | ✅ In scope |
| ZED X | ✅ In scope |
| Cosmos | ❌ Out of scope — future |
| GR00T | ❌ Out of scope — future |

All `lab.*` Workflow Builder nodes are v1 deliverables. Nothing is stubbed.

---

## 17. Glossary

| Term | Definition |
|---|---|
| Mission Control | The web-based infrastructure and observability platform defined in this spec |
| Empirical DB | PostgreSQL database of physically verified robot properties — 6 tables, CR10 seeded — single source of truth |
| Registry DB | New Mission Control database tracking file versions, builds, workflows, sessions |
| NULL field | A config field with no verified empirical value — left blank, never estimated or filled with placeholder |
| Promoted file | A config file approved by operator for use in active pipelines and workflows |
| Workflow graph | A saved node-based automation workflow composed in the Workflow Builder |
| Workflow Engine | The Mission Control backend service that executes workflow graphs |
| Sub-agent | An MCP or Autogen agent dispatched by Claude Code for infrastructure administration |
| rosbridge | WebSocket bridge node running inside Isaac ROS container — exposes all ROS2 primitives to web clients |
| cuRobo | NVIDIA jerk minimization library — configured by Mission Control for 6-axis joint-space trajectory smoothing only |
| ROS_DOMAIN_ID | ROS2 network isolation identifier — managed per container via environment variable |
| Build process | One of 5 defined repeatable infrastructure build workflows executed via Claude Code agents |
| Workflow | A user-composed node graph in the Workflow Builder — distinct from a build process |

---

*Spec v2.1.0 — 2026-03-01*
*Both databases live (empirical: 6 tables + CR10 seed, registry: 15 tables). All 8 API routers implemented. Next deliverable: frontend pages for new API routes.*
