# Physical AI Pipeline Interface — Design Document

**Date:** 2026-03-02
**Version:** 1.0.0
**Status:** Approved
**Author:** Samuel + Claude

---

## 1. Overview

Replace the existing Workflows page with a **Physical AI Pipeline editor** — a visual DAG interface for building, configuring, running, and monitoring end-to-end robotics AI pipelines using the NVIDIA Isaac stack.

Pipelines are first-class entities, independent of any single robot, and can involve multiple robot embodiments. The interface provides a React Flow canvas where users construct pipelines by connecting **asset nodes** (data) and **operation nodes** (transforms) in a bipartite DAG pattern.

### Goals

- Visual pipeline construction with drag-and-drop node palette
- Pre-built templates for common NVIDIA workflows (GR00T, RL, Sim2Real, Cinema)
- Per-stage configuration forms, live log streaming, and metrics visualization
- OSMO-compatible pipeline schema (agent execution now, OSMO swap later)
- Bidirectional YAML ↔ visual DAG editing
- Full provenance: trace any checkpoint back through the assets and operations that produced it

### Non-Goals (V1)

- Multi-user concurrent editing
- Pipeline scheduling/cron
- Cost estimation for compute
- Automated hyperparameter search

---

## 2. Architecture

### Bipartite DAG Model

The pipeline DAG uses two alternating node categories:

**Asset Nodes (data/nouns)** — represent things that exist:
- Files, datasets, checkpoints, configs, models
- Rendered as rounded rectangles with amber left-border accent
- Link to existing registry tables (FileRegistry, DatasetRegistry)

**Operation Nodes (transforms/verbs)** — represent things that happen:
- Compose, train, evaluate, deploy
- Rendered as hexagons with white border
- Each maps to an MCP agent for execution
- Status-colored indicator (pending/running/complete/failed)

Edges always flow Asset → Operation → Asset, creating a bipartite graph. Edges carry typed data references (file paths, dataset IDs, checkpoint paths).

```
[CR10 URDF] ──┐
[CR10 USD]  ──┼──→ [Scene Compose] ──→ [Scene USD] ──→ [Isaac Lab Setup] ──→ [Training Env]
[Kitchen USD]─┘                                                                    │
[Camera USD]──┘                                                                    ▼
                                                                            [Data Collect]
                   [Demo Dataset] ──→ [GR00T-Mimic] ──→ [Aug Dataset] ──┐       │
                                                                         ├──→ [GR00T Fine-tune] ──→ [Checkpoint]
                   [GR00T N1.6 Base]────────────────────────────────────┘            │
                                                                                     ▼
                                                                              [Arena Eval] ──→ [Report]
                                                                                     │
                                                                                     ▼
                                                                               [Deploy] ──→ [Deployment]
```

### Execution Model

V1 uses MCP agents (simulate, groot, cosmos, develop, sysadmin) for stage execution. The pipeline schema is designed to be OSMO-compatible so the executor can be swapped to NVIDIA OSMO in the future without UI changes.

When a user clicks "Run" on a pipeline:
1. Backend resolves the execution order from the DAG topology (topological sort)
2. Stages execute via MCP agent dispatch, respecting dependencies
3. Each stage's output artifacts are registered in the database
4. Frontend polls for status updates (or receives WebSocket push)

---

## 3. Node Taxonomy

### Asset Node Types (13)

| Type | Description | Registry Source |
|------|-------------|-----------------|
| `robot_urdf` | Robot URDF description | FileRegistry |
| `robot_usd` | Robot USD model | FileRegistry |
| `curobo_config` | cuRobo YAML config | FileRegistry |
| `environment_usd` | Environment/set USD stage | FileRegistry / Omniverse |
| `object_usd` | Prop/object USD asset | FileRegistry / Omniverse |
| `sensor_config` | Sensor definitions | SensorConfig table |
| `scene_usd` | Composed scene (output) | Generated |
| `demo_dataset` | Recorded demos (LeRobot format) | DatasetRegistry |
| `synth_dataset` | Augmented/synthetic data | DatasetRegistry |
| `checkpoint` | Trained policy weights | Model path |
| `eval_report` | Evaluation metrics & results | Generated |
| `deployment_pkg` | Deployed policy + ROS launch | Generated |
| `pretrained_model` | Foundation model (GR00T N1.6, etc.) | External / HuggingFace |

### Operation Node Types (11)

| Type | Inputs | Outputs | MCP Agent |
|------|--------|---------|-----------|
| `usd_compose` | robot_usd + env_usd + object_usd(s) | scene_usd | simulate |
| `isaac_lab_setup` | scene_usd + sensor_config | training env config | simulate |
| `demo_record` | scene_usd + robot config | demo_dataset | simulate |
| `groot_mimic` | demo_dataset | synth_dataset | groot |
| `cosmos_transfer` | synth_dataset (sim renders) | synth_dataset (photorealistic) | cosmos |
| `cosmos_predict` | scene_usd + checkpoint | eval scenarios | cosmos |
| `isaac_lab_rl` | training_env + reward config | checkpoint | groot |
| `groot_finetune` | dataset(s) + pretrained_model | checkpoint | groot |
| `arena_eval` | checkpoint + eval environments | eval_report | simulate |
| `curobo_validate` | trajectory + curobo_config | validation report | develop |
| `deploy` | checkpoint + robot config | deployment_pkg | sysadmin |

---

## 4. Data Model

Reuses existing tables with structured JSON for DAG storage.

### Pipeline Definition → `workflow_graphs` table

```sql
-- Existing table, no schema changes needed
workflow_graphs (
  graph_id        UUID PK,
  name            VARCHAR(256),
  version         VARCHAR(32),
  description     TEXT,
  graph_json      JSONB,       -- ← DAG definition
  created_at      TIMESTAMP,
  updated_at      TIMESTAMP,
  created_by      VARCHAR(256)
)
```

#### `graph_json` Schema

```json
{
  "schema_version": "1.0.0",
  "template": "groot_manipulation",
  "osmo_compatible": true,
  "nodes": [
    {
      "id": "n1",
      "category": "asset",
      "type": "robot_usd",
      "label": "CR10 USD",
      "config": {
        "file_id": "615d43b5-...",
        "version": "0.1.0"
      },
      "position": { "x": 100, "y": 200 }
    },
    {
      "id": "n2",
      "category": "operation",
      "type": "usd_compose",
      "label": "Compose Scene",
      "config": {
        "physics_dt": 0.0083,
        "render_dt": 0.0166
      },
      "position": { "x": 400, "y": 200 }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "n1",
      "target": "n2",
      "data_type": "usd"
    }
  ]
}
```

### Pipeline Run → `workflow_runs` table

```sql
-- Existing table, no schema changes needed
workflow_runs (
  run_id          UUID PK,
  graph_id        UUID FK,
  graph_name      VARCHAR(256),
  status          VARCHAR(32),   -- running|completed|failed|paused
  node_results    JSONB,         -- ← per-node execution state
  started_at      TIMESTAMP,
  completed_at    TIMESTAMP
)
```

#### `node_results` Schema

```json
{
  "n2": {
    "status": "complete",
    "started_at": "2026-03-02T10:00:00Z",
    "completed_at": "2026-03-02T10:05:00Z",
    "output_artifact_id": "abc-123",
    "agent_log_id": "def-456",
    "logs": ["Composing scene...", "3 assets merged", "Scene USD written"]
  },
  "n5": {
    "status": "running",
    "started_at": "2026-03-02T10:06:00Z",
    "progress": 0.42,
    "metrics": {
      "loss": 0.023,
      "epoch": 12,
      "learning_rate": 0.0001
    }
  }
}
```

### Related Tables (existing, no changes)

- `file_registry` — asset nodes link here via `file_id`
- `build_logs` — operation execution history
- `agent_logs` — MCP agent call records
- `dataset_registry` — dataset asset references
- `scene_registry` — composed scene metadata

---

## 5. Pipeline Templates

### Template: GR00T Manipulation

Stages: Asset → Demo → GR00T-Mimic → Cosmos Transfer → GR00T Fine-tune → Arena Eval → Deploy

Use case: Train a manipulation policy for any robot arm using NVIDIA's recommended VLA pipeline.

### Template: RL Locomotion

Stages: Asset → Isaac Lab RL (massively parallel) → Eval → Deploy

Use case: Train locomotion for legged robots using reinforcement learning in Isaac Lab.

### Template: Sim2Real Transfer

Stages: Asset → Sim Data Collection → Cosmos Transfer (photorealism) → Train → Eval → Deploy

Use case: Bridge the sim-to-real gap using Cosmos world models.

### Template: Cinema Motion (CR10-specific)

Stages: Asset → Trajectory Input → cuRobo Validate → Deploy

Use case: Validate cinema camera trajectories through cuRobo for joint limits, singularity, and jerk.

### Template: Custom

Blank canvas with full node palette. User builds from scratch.

---

## 6. UI Layout

### Page Structure

The Workflows sidebar entry becomes **Pipelines**. Three views:

#### 6.1 Pipeline List (default)

Grid of pipeline cards:
- Pipeline name, template badge, status indicator
- Robot(s) involved (avatar chips)
- Last run timestamp, run count
- "New Pipeline" button → opens template gallery

#### 6.2 Template Gallery

Modal/overlay when creating a new pipeline:
- Cards for each template with preview DAG thumbnail
- Description of stages and use case
- "Use Template" clones the DAG into a new pipeline

#### 6.3 Pipeline Editor (main interface)

Three-panel layout:

```
┌──────────────────────────────────────────────────────────────────────┐
│ ◄ Pipelines   Pipeline Name v1.2              [YAML] [▶ Run]       │
├───────────┬──────────────────────────────────────┬───────────────────┤
│           │                                      │                   │
│  NODE     │       REACT FLOW CANVAS              │   DETAIL DRAWER   │
│  PALETTE  │                                      │                   │
│  (180px)  │   Asset & operation nodes            │   Config form     │
│           │   connected by typed edges           │   Live logs       │
│  Assets   │                                      │   Metrics charts  │
│  ─────    │   Minimap (bottom-right)             │   Output artifacts│
│  Ops      │                                      │                   │
│  ─────    │                                      │   (~320px)        │
│           │                                      │                   │
├───────────┴──────────────────────────────────────┴───────────────────┤
│  ▶ Run Log   [████████████░░░░] 7/11 complete   2h 14m elapsed      │
└──────────────────────────────────────────────────────────────────────┘
```

**Left — Node Palette (collapsible, ~180px)**
- Drag-and-drop node creation
- Two sections: Assets (rounded, amber icon) and Operations (hexagonal, white icon)
- Search/filter at top

**Center — React Flow Canvas**
- Pan/zoom, grid snap, minimap
- Asset nodes: rounded rectangles, amber left border, file name + version badge
- Operation nodes: hexagons, white border, status-colored dot
- Edges: solid grey default, amber animated when data flowing, dotted when pending
- Status overlay during run: green check (done), spinner (running), red X (failed)

**Right — Detail Drawer (collapsible, ~320px)**
- Asset nodes: file content preview (read-only Monaco), version selector, registry link
- Operation nodes: typed config form, live streaming logs, metrics charts, output artifacts, "Run This Stage" button

**Bottom — Run Bar (fixed, 40px)**
- Pipeline run progress bar (X/Y nodes complete)
- Elapsed time
- Expandable run log

### Visual Theme

Consistent with Mission Control amber theme:
- Asset nodes: `#0a0a0a` bg, `#ffaa00` left border, version badge
- Operation nodes: `#0a0a0a` bg, `#888` border, status dot (green/amber/red)
- Edges: `#333` default, `#ffaa00` animated active
- Selected: `#ffaa00` glow border
- Running: pulsing amber border animation

### YAML Toggle

Top-bar button toggles between visual DAG and raw YAML editor (Monaco, YAML mode). Bidirectional sync — edits in either view update the other. Enables OSMO export and power-user editing.

---

## 7. API Endpoints (New)

### Pipeline CRUD

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/pipelines` | List all pipelines |
| POST | `/api/pipelines` | Create pipeline (from template or blank) |
| GET | `/api/pipelines/{id}` | Get pipeline definition (graph_json) |
| PUT | `/api/pipelines/{id}` | Update pipeline DAG |
| DELETE | `/api/pipelines/{id}` | Delete pipeline |

### Pipeline Runs

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/pipelines/{id}/run` | Start a pipeline run |
| GET | `/api/pipelines/{id}/runs` | List runs for a pipeline |
| GET | `/api/pipeline-runs/{run_id}` | Get run status + node_results |
| PATCH | `/api/pipeline-runs/{run_id}` | Pause/resume/cancel a run |
| GET | `/api/pipeline-runs/{run_id}/logs/{node_id}` | Stream logs for a node |

### Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/pipeline-templates` | List available templates |
| POST | `/api/pipeline-templates/{name}/instantiate` | Clone template into new pipeline |

---

## 8. Execution Flow

### Pipeline Run Lifecycle

1. User clicks **Run** on a pipeline
2. Backend creates a `workflow_runs` row (status: `running`)
3. Backend performs topological sort on the DAG
4. For each ready node (all upstream dependencies complete):
   a. Set node status to `running` in `node_results`
   b. Dispatch to the appropriate MCP agent
   c. Agent executes (container start, training launch, etc.)
   d. On completion: register output artifacts, set node status to `complete`
   e. Trigger downstream nodes that are now unblocked
5. When all nodes complete: set run status to `completed`
6. On any failure: set node to `failed`, optionally halt or continue other branches

### Agent Dispatch Mapping

```
usd_compose      → agent: simulate  (Isaac Sim USD composition)
isaac_lab_setup  → agent: simulate  (Isaac Lab environment config)
demo_record      → agent: simulate  (teleop data recording)
groot_mimic      → agent: groot     (GR00T-Mimic augmentation)
cosmos_transfer  → agent: cosmos    (Cosmos Transfer 2.5)
cosmos_predict   → agent: cosmos    (Cosmos Predict 2.5)
isaac_lab_rl     → agent: groot     (Isaac Lab RL training)
groot_finetune   → agent: groot     (GR00T N1.6 fine-tuning)
arena_eval       → agent: simulate  (Isaac Lab-Arena evaluation)
curobo_validate  → agent: develop   (cuRobo trajectory validation)
deploy           → agent: sysadmin  (deployment to target device)
```

### OSMO Future Migration

The `graph_json` schema is designed to map to OSMO's YAML workflow format:
- Nodes → OSMO tasks
- Edges → OSMO task dependencies
- Node configs → OSMO task parameters
- Agent mapping → OSMO compute target mapping

Migration path: implement an `OsmoExecutor` class that translates graph_json to OSMO YAML and submits to OSMO's API, replacing the current `AgentExecutor`.

---

## 9. File Manifest

### New Files

| File | Purpose |
|------|---------|
| `frontend/src/pages/PipelinesPage.tsx` | Main page component (replaces WorkflowsPage) |
| `frontend/src/components/pipeline/PipelineCanvas.tsx` | React Flow canvas with custom nodes |
| `frontend/src/components/pipeline/NodePalette.tsx` | Drag-and-drop node palette |
| `frontend/src/components/pipeline/DetailDrawer.tsx` | Right-side config/logs/metrics panel |
| `frontend/src/components/pipeline/nodes/AssetNode.tsx` | Custom React Flow node for assets |
| `frontend/src/components/pipeline/nodes/OperationNode.tsx` | Custom React Flow node for operations |
| `frontend/src/components/pipeline/RunBar.tsx` | Bottom run progress bar |
| `frontend/src/components/pipeline/YamlEditor.tsx` | YAML toggle editor |
| `frontend/src/components/pipeline/TemplateGallery.tsx` | Template selection modal |
| `frontend/src/stores/pipelineStore.ts` | Zustand store for pipeline state |
| `backend/api/pipelines.py` | Pipeline CRUD + run management endpoints |
| `backend/services/pipeline_executor.py` | DAG execution engine (topological sort + agent dispatch) |
| `backend/services/pipeline_templates.py` | Template definitions |

### Modified Files

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Replace Workflows route with Pipelines |
| `backend/main.py` | Register pipeline router |

---

## 10. NVIDIA Stack Mapping

| Pipeline Stage | NVIDIA Component | Container | Notes |
|----------------|-----------------|-----------|-------|
| Asset Creation | Omniverse / USD | isaac-sim | URDF→USD import, scene composition |
| Demo Collection | Isaac Lab-Teleop | isaac-lab | SpaceMouse / XR input |
| Data Augmentation | GR00T-Mimic, GR00T-Gen | groot | Synthetic motion trajectories |
| Visual Augmentation | Cosmos Transfer 2.5 | cosmos | Sim→photorealistic bridge |
| RL Training | Isaac Lab (RSL-RL, RL-Games) | isaac-lab | Massively parallel envs |
| VLA Training | GR00T N1.6 fine-tuning | groot | LeRobot format datasets |
| Policy Evaluation | Isaac Lab-Arena | isaac-lab | Standardized benchmarks |
| Future Prediction | Cosmos Predict 2.5 | cosmos | "What-if" scenario generation |
| Trajectory Validation | cuRobo | isaac-lab | Joint limits, singularity, jerk |
| Deployment | Isaac ROS | isaac-ros | cuVSLAM, nvblox, FoundationStereo |

---

*Design approved 2026-03-02. Next step: implementation plan.*
