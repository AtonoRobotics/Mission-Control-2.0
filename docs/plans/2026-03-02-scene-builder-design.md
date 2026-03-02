# Scene Builder Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Multi-modal scene composition tool integrated as a tab in the pipeline editor, enabling users to compose training scenes for Isaac Lab RL and Isaac Sim data collection — with AI-powered auto-population.

**Architecture:** Scene builder is a third mode (Visual / Scene / YAML) in the pipeline editor page. The Scene tab replaces the left NodePalette with an AssetBrowser and the center canvas with a split 2D/3D SceneCanvas. Scene data is stored as config on a `scene_usd` asset node in the pipeline graph. AI scene generation dispatches to an MCP agent that returns a SceneConfig the user can refine.

**Tech Stack:** React 18 + TypeScript, Three.js (3D viewport), HTML Canvas (2D floorplan), Zustand (state), FastAPI (backend), MCP agents (AI generation).

---

## 1. Page Layout & Navigation

The pipeline editor top bar gains a third toggle mode:

```
┌─────────────────────────────────────────────────────────┐
│ ← Pipelines │ Pipeline Name │ [Visual] [Scene] [YAML] │ ▶ Run │
├────────────────┬────────────────────────────────────────┤
│                │                                        │
│  Left Panel    │   Center Panel (mode-dependent):       │
│  (swappable):  │   • Visual → React Flow canvas         │
│  • Visual mode │   • Scene  → SceneCanvas (2D/3D)       │
│    → NodePalette│   • YAML   → YamlEditor               │
│  • Scene mode  │                                        │
│    → AssetBrowser                                       │
│                │                                        │
├────────────────┴────────────────────────────────────────┤
│ RunBar (when active run)                                │
└─────────────────────────────────────────────────────────┘
```

- Switching to Scene mode automatically finds or creates a `scene_usd` asset node in the pipeline graph.
- The DetailDrawer (right panel) shows properties for the selected scene asset (transform, physics, material).
- A "Generate Scene" button appears in the top bar when in Scene mode.
- A "Preview with Cosmos" button sends current 3D viewport to Cosmos Transfer for photorealistic preview.

## 2. Scene Canvas

Center panel in Scene mode. Three sub-modes: 2D only, 3D only, or split.

```
┌───────────────────────────────────────┐
│  [2D] [3D] [Split]    🤖 Generate  🔍 Cosmos │
├──────────────────┬────────────────────┤
│                  │                    │
│   2D Floorplan   │   3D Three.js      │
│   (HTML Canvas)  │   Viewport          │
│                  │                    │
│   Grid overlay   │   Orbit camera     │
│   Drag to place  │   Ground plane     │
│   Rotate handles │   Loaded meshes    │
│   Snap-to-grid   │   Translate gizmo  │
│                  │                    │
├──────────────────┴────────────────────┤
│ 3 assets placed │ Scene: Tabletop Manip │
└───────────────────────────────────────┘
```

### 2D View (SceneCanvas2D)
- HTML Canvas with configurable grid overlay (default 0.1m spacing)
- Assets rendered as labeled rectangles/icons with color-coded borders by type
- Drag to reposition, corner handles to rotate
- Optional snap-to-grid
- Click to select → shows properties in DetailDrawer

### 3D View (SceneCanvas3D)
- Reuses existing Three.js SceneManager infrastructure
- Orbit camera, ground plane grid, ambient + directional lighting
- Assets rendered as simple geometry (box placeholders for unknown, loaded meshes for known formats)
- Click to select, Three.js TransformControls gizmo for translate/rotate/scale
- Synced with 2D view — changes in one update the other in real time

### Split Mode
- Side-by-side 2D (left) and 3D (right)
- Synchronized selection and transforms

### Cosmos Preview
- Button sends a screenshot of the 3D viewport to `POST /api/pipelines/scenes/cosmos-preview`
- Backend dispatches to Cosmos Transfer agent
- Returns photorealistic render displayed as a temporary overlay on the 3D viewport
- Non-blocking — user continues editing while Cosmos processes

## 3. Data Model

### ScenePlacement

```typescript
interface ScenePlacement {
  id: string;                    // Unique placement ID
  asset_id: string;              // FileRegistry file_id or NVIDIA asset path
  asset_source: 'registry' | 'nvidia' | 'upload';
  asset_type: 'robot' | 'environment' | 'object' | 'sensor' | 'light';
  label: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };  // Euler degrees
  scale: { x: number; y: number; z: number };
  physics_enabled: boolean;
  is_global: boolean;            // true = shared (lights, ground), false = cloned per env
  properties: Record<string, unknown>;  // Type-specific config
}
```

### SceneConfig

```typescript
interface SceneConfig {
  name: string;
  description?: string;
  // Physics
  physics_dt: number;           // Default 1/60
  render_dt: number;            // Default 1/60
  gravity: [number, number, number];  // Default [0, 0, -9.81]
  // Isaac Lab RL settings
  num_envs?: number;            // Number of parallel environments
  env_spacing?: number;         // Distance between env origins
  // Content
  placements: ScenePlacement[];
}
```

### Storage

The `SceneConfig` is stored as the `config` field of the `scene_usd` asset node in the pipeline's `graph_json`. No separate table needed for the scene composition data — it lives within the pipeline.

When the pipeline executes:
1. `usd_compose` operation reads `SceneConfig` from its input `scene_usd` node
2. Generates actual USD stage file via the `simulate` agent
3. Registers output in `FileRegistry` (as `scene_usd` file type)
4. Creates/updates `SceneRegistry` entry with robot_ids and file references

## 4. Asset Browser

Left panel in Scene mode, replacing the NodePalette.

```
┌─────────────────────┐
│ 🔍 Search assets... │
├─────────────────────┤
│ [Registry] [NVIDIA] │
│          [Upload ↑] │
├─────────────────────┤
│ ▼ Robots            │
│   Dobot CR10        │
│   Franka Panda      │
│                     │
│ ▼ Environments      │
│   Simple Warehouse  │
│   Grid Default      │
│   Simple Room       │
│                     │
│ ▼ Objects / Props   │
│   Cardboard Box     │
│   Table             │
│   YCB Objects       │
│                     │
│ ▼ Sensors           │
│   Pinhole Camera    │
│   Lidar             │
│                     │
│ ▼ Lighting          │
│   Dome Light        │
│   Distant Light     │
│   Sphere Light      │
└─────────────────────┘
```

### Three Asset Sources

**Registry tab** — queries `GET /api/registry/files` filtered by file_type. Groups assets by category. Shows name, version, status badge.

**NVIDIA tab** — curated catalog of Isaac Sim built-in assets. Stored as a static JSON file shipped with the frontend (`nvidia-assets.json`). Categories: Environments, Robots, Props, Sensors. Each entry has a Nucleus-style path (e.g., `/Isaac/Environments/Simple_Warehouse/full_warehouse.usd`) that Isaac Sim resolves at runtime.

**Upload** — drag-and-drop zone or file picker accepting USD, USDA, USDC, OBJ, STL, URDF files. Upload flow:
1. Frontend sends multipart POST to `/api/registry/files/upload`
2. Backend stores file, computes SHA256, creates FileRegistry entry with `status: draft`
3. Asset appears in Registry tab immediately

### Drag Interaction

Assets are draggable (HTML5 drag API, same pattern as NodePalette). Drop onto 2D or 3D canvas creates a new `ScenePlacement` at the drop position with default transform.

## 5. AI Scene Generation

### Generate Scene Modal

Triggered by "Generate Scene" button in top bar. Modal with:

```
┌──────────────────────────────────────────┐
│ 🤖 Generate Scene                        │
│                                          │
│ Describe the scene:                      │
│ ┌──────────────────────────────────────┐ │
│ │ Tabletop manipulation with CR10,     │ │
│ │ 5 YCB objects within reach, overhead │ │
│ │ camera, warehouse environment...     │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ Task type: [Manipulation ▼]              │
│ Robot:     [Dobot CR10    ▼]             │
│ Env style: [Warehouse     ▼]            │
│                                          │
│           [Cancel]  [Generate ▶]         │
└──────────────────────────────────────────┘
```

### Agent Architecture

A new `scene_compose` skill on the existing `simulate` MCP agent. The agent needs:

**Knowledge:**
- Robot kinematic specs (reach, DOF, workspace envelope) — from registry DB
- Task-specific placement patterns (manipulation: objects in reach on surface; navigation: traversable paths with obstacles; inspection: objects in sensor FOV)
- Physics constraints (no intersections, stable placements, surface support)
- USD scene composition best practices (NVIDIA OpenUSD principles)
- Isaac Lab InteractiveSceneCfg conventions (`{ENV_REGEX_NS}` for per-env assets)

**Input:** Task type, robot_id, environment style, text description, available assets
**Output:** `SceneConfig` JSON (placements array with positions, rotations, scales)

**Flow:**
1. User fills modal, clicks Generate
2. Frontend sends `POST /api/pipelines/scenes/generate` with prompt + constraints
3. Backend dispatches to `simulate` agent with scene generation skill
4. Agent generates `SceneConfig` using LLM reasoning + constraint solving
5. Frontend receives `SceneConfig`, populates the scene canvas
6. User refines manually (drag/reposition/delete/add)

### Constraint Solver (Post-LLM Refinement)

After the LLM generates coarse placement, a lightweight constraint solver in the backend validates:
- No object-object intersections (AABB overlap check)
- Objects within robot reach envelope (sphere test with reach_mm)
- Objects on valid surfaces (z > 0 unless floor-level)
- Camera has line-of-sight to workspace

Violations are flagged in the UI with warning indicators on affected placements.

## 6. New Stack Additions

Tools referenced by this design that should be added to the platform stack:

| Tool | Purpose | Integration Point | Priority |
|------|---------|-------------------|----------|
| **Replicator** | Domain randomization + synthetic data capture | Pipeline operation node | High |
| **GR00T Mimic** | Trajectory multiplication from human demos | Pipeline operation node | High |
| **GR00T Gen** | Visual augmentation of training data | Pipeline operation node | Medium |
| **GR00T Teleop** | Human demo capture via Apple Vision Pro | External tool, feeds pipeline | Medium |
| **Genie Sim 3.0** | Open-source LLM scene generator (built on Isaac Sim) | Scene generation agent backend | Medium |
| **Chat IRO** | NVIDIA LLM scene generator (Isaac Sim 6.0) | Scene generation agent backend | Medium |
| **Nucleus** | USD asset server for collaborative scenes | Asset browser source | Low |
| **USD Search** | Semantic search across USD assets | Asset browser search | Low |

## 7. API Endpoints

### New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/registry/scenes` | Create scene entry |
| `GET` | `/api/registry/scenes/{scene_id}` | Get single scene |
| `PUT` | `/api/registry/scenes/{scene_id}` | Update scene metadata |
| `DELETE` | `/api/registry/scenes/{scene_id}` | Delete scene |
| `POST` | `/api/registry/files/upload` | Multipart file upload → FileRegistry |
| `GET` | `/api/assets/nvidia` | Return curated NVIDIA built-in asset catalog |
| `POST` | `/api/pipelines/scenes/generate` | AI scene generation (dispatches to agent) |
| `POST` | `/api/pipelines/scenes/cosmos-preview` | Send render to Cosmos Transfer |

### Existing Endpoints Used

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/registry/files` | List assets (filtered by file_type) |
| `GET` | `/api/registry/robots` | List registered robots |
| `GET` | `/api/registry/scenes` | List scenes (already implemented) |

## 8. Frontend Components

### New Components

| Component | File | Purpose |
|-----------|------|---------|
| `SceneCanvas.tsx` | `components/pipeline/` | Container — manages 2D/3D split, mode toggle, sync |
| `SceneCanvas2D.tsx` | `components/pipeline/` | HTML Canvas top-down floorplan editor |
| `SceneCanvas3D.tsx` | `components/pipeline/` | Three.js 3D viewport with gizmos |
| `AssetBrowser.tsx` | `components/pipeline/` | Left panel — Registry/NVIDIA/Upload tabs |
| `SceneGenerateModal.tsx` | `components/pipeline/` | AI generation prompt modal |
| `SceneToolbar.tsx` | `components/pipeline/` | Scene-specific top bar (Generate, Cosmos, view toggles) |

### Modified Components

| Component | Change |
|-----------|--------|
| `PipelinesPage.tsx` | Add Scene mode alongside Visual/YAML |
| `DetailDrawer.tsx` | Add scene placement property forms (transform, physics, material) |

### New Store

| Store | File | Purpose |
|-------|------|---------|
| `sceneStore.ts` | `stores/` | Scene placements, asset catalog, NVIDIA assets, generation state, view mode |

## 9. 3D Viewer Roadmap

**Phase 1 (now):** Three.js browser-native preview
- Box/sphere placeholders for unknown assets
- Load glTF/OBJ meshes when available
- TransformControls gizmo
- Synchronized with 2D view

**Phase 2 (future):** Isaac Sim streaming
- WebRTC stream from Isaac Sim running on workstation/DGX Spark
- Pixel-perfect physics-accurate preview
- Live simulation preview (gravity, collisions)
- Requires Isaac Sim 5.1+ with Omniverse Kit streaming

## 10. File Manifest

| File | Action |
|------|--------|
| `backend/api/registry.py` | Edit — add scene CRUD + file upload endpoints |
| `backend/api/pipelines.py` | Edit — add scene generation + cosmos preview endpoints |
| `backend/services/nvidia_assets.py` | Create — NVIDIA built-in asset catalog |
| `backend/services/scene_generator.py` | Create — AI scene generation + constraint solver |
| `frontend/src/stores/sceneStore.ts` | Create — scene state management |
| `frontend/src/components/pipeline/SceneCanvas.tsx` | Create — split 2D/3D container |
| `frontend/src/components/pipeline/SceneCanvas2D.tsx` | Create — HTML Canvas floorplan |
| `frontend/src/components/pipeline/SceneCanvas3D.tsx` | Create — Three.js viewport |
| `frontend/src/components/pipeline/AssetBrowser.tsx` | Create — asset browser panel |
| `frontend/src/components/pipeline/SceneGenerateModal.tsx` | Create — AI generation modal |
| `frontend/src/components/pipeline/SceneToolbar.tsx` | Create — scene top bar |
| `frontend/src/pages/PipelinesPage.tsx` | Edit — add Scene mode |
| `frontend/src/components/pipeline/DetailDrawer.tsx` | Edit — add placement property forms |
| `frontend/public/nvidia-assets.json` | Create — curated NVIDIA asset catalog |
