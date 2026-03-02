# Scene Builder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Multi-modal scene composition tool (2D/3D viewports + asset browser + AI generation) integrated as a third tab in the pipeline editor.

**Architecture:** Scene mode is added alongside Visual/YAML in PipelinesPage. The left panel swaps to AssetBrowser, center panel shows SceneCanvas (split 2D/3D), and DetailDrawer gains placement property forms. Scene data is stored as config on a `scene_usd` pipeline node. AI generation dispatches to the `simulate` MCP agent.

**Tech Stack:** React 18 + TypeScript, Three.js (3D), HTML Canvas (2D), Zustand 5 (state), FastAPI + SQLAlchemy (backend), MCP agents (AI generation).

---

## Dependency Graph

```
Task 1 (Backend Scene CRUD) ─────────────┐
Task 2 (Backend File Upload) ────────────┤
Task 3 (NVIDIA Asset Catalog) ───────────┼─→ Task 8 (Asset Browser)
Task 4 (Scene Store) ───────────────────┤
                                         │
Task 5 (SceneCanvas2D) ─────────────────┼─→ Task 7 (SceneCanvas Container)
Task 6 (SceneCanvas3D) ─────────────────┘
                                              │
Task 7 (SceneCanvas Container) ──────────────┤
Task 8 (Asset Browser) ──────────────────────┼─→ Task 10 (Wire into PipelinesPage)
Task 9 (Scene Placement Properties) ─────────┘
                                              │
Task 10 (Wire into PipelinesPage) ───────────→ Task 11 (AI Scene Generation)
                                              → Task 12 (Integration Verification)
```

---

## Task 1: Backend — Scene CRUD Endpoints

**Files:**
- Modify: `backend/api/registry.py` (after line 533)

**Step 1: Add SceneCreate schema**

Add after the existing `SceneOut` schema (line 105):

```python
class SceneCreate(BaseModel):
    name: str
    description: Optional[str] = None
    robot_ids: list = Field(default_factory=list)


class SceneUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    robot_ids: Optional[list] = None
    usd_stage_file_id: Optional[UUID] = None
    world_config_file_id: Optional[UUID] = None
```

**Step 2: Add CRUD endpoints**

Add after the existing `list_scenes` endpoint (line 533):

```python
@router.get("/scenes/{scene_id}", response_model=SceneOut)
async def get_scene(
    scene_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(SceneRegistry).where(SceneRegistry.scene_id == scene_id)
    )
    scene = result.scalar_one_or_none()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    return scene


@router.post("/scenes", response_model=SceneOut, status_code=201)
async def create_scene(
    body: SceneCreate,
    session: AsyncSession = Depends(get_registry_session),
):
    scene = SceneRegistry(
        name=body.name,
        description=body.description,
        robot_ids=body.robot_ids,
    )
    session.add(scene)
    await session.flush()
    await session.refresh(scene)
    logger.info("scene_created", scene_id=str(scene.scene_id), name=body.name)
    return scene


@router.put("/scenes/{scene_id}", response_model=SceneOut)
async def update_scene(
    scene_id: UUID,
    body: SceneUpdate,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(SceneRegistry).where(SceneRegistry.scene_id == scene_id)
    )
    scene = result.scalar_one_or_none()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    if body.name is not None:
        scene.name = body.name
    if body.description is not None:
        scene.description = body.description
    if body.robot_ids is not None:
        scene.robot_ids = body.robot_ids
    if body.usd_stage_file_id is not None:
        scene.usd_stage_file_id = body.usd_stage_file_id
    if body.world_config_file_id is not None:
        scene.world_config_file_id = body.world_config_file_id
    scene.updated_at = func.now()

    await session.flush()
    await session.refresh(scene)
    logger.info("scene_updated", scene_id=str(scene_id))
    return scene


@router.delete("/scenes/{scene_id}", status_code=204)
async def delete_scene(
    scene_id: UUID,
    session: AsyncSession = Depends(get_registry_session),
):
    result = await session.execute(
        select(SceneRegistry).where(SceneRegistry.scene_id == scene_id)
    )
    scene = result.scalar_one_or_none()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    await session.delete(scene)
    await session.flush()
    logger.info("scene_deleted", scene_id=str(scene_id))
```

**Step 3: Verify**

```bash
cd backend && python -c "from api.registry import router; print('OK')"
```

**Step 4: Commit**

```bash
git add backend/api/registry.py
git commit -m "feat: add scene CRUD endpoints (create, get, update, delete)"
```

---

## Task 2: Backend — File Upload Endpoint

**Files:**
- Modify: `backend/api/registry.py`

**Step 1: Add file upload endpoint**

Add a multipart file upload endpoint. This goes in the File Registry section (after line 200):

```python
import os
from fastapi import UploadFile, File as FastAPIFile


@router.post("/files/upload", response_model=FileOut, status_code=201)
async def upload_file(
    file: UploadFile = FastAPIFile(...),
    file_type: str = Query("usd"),
    robot_id: Optional[str] = Query(None),
    scene_id: Optional[UUID] = Query(None),
    session: AsyncSession = Depends(get_registry_session),
):
    """Upload a file (USD, OBJ, STL, URDF) and register it."""
    content_bytes = await file.read()
    content_str = content_bytes.decode("utf-8", errors="replace")
    file_hash = hashlib.sha256(content_bytes).hexdigest()

    # Determine file path from upload name
    safe_name = file.filename or "uploaded_file"
    file_path = f"uploads/{safe_name}"

    entry = FileRegistry(
        file_type=file_type,
        robot_id=robot_id,
        scene_id=scene_id,
        version="0.1.0",
        file_hash=file_hash,
        file_path=file_path,
        content=content_str,
        status="draft",
        notes=f"Uploaded: {safe_name}",
    )
    session.add(entry)
    await session.flush()
    await session.refresh(entry)
    logger.info("file_uploaded", file_id=str(entry.file_id), filename=safe_name)
    return entry
```

**Step 2: Verify**

```bash
cd backend && python -c "from api.registry import router; print('OK')"
```

**Step 3: Commit**

```bash
git add backend/api/registry.py
git commit -m "feat: add file upload endpoint for USD/OBJ/STL/URDF assets"
```

---

## Task 3: NVIDIA Built-in Asset Catalog

**Files:**
- Create: `frontend/public/nvidia-assets.json`

**Step 1: Create the NVIDIA asset catalog**

A curated JSON catalog of Isaac Sim built-in assets. These are Nucleus paths that Isaac Sim resolves at runtime.

```json
{
  "version": "1.0",
  "source": "Isaac Sim 5.1 Built-in Assets",
  "categories": {
    "environments": [
      {
        "id": "nvidia_warehouse",
        "label": "Simple Warehouse",
        "path": "/Isaac/Environments/Simple_Warehouse/full_warehouse.usd",
        "description": "Open warehouse environment with shelving",
        "thumbnail": null
      },
      {
        "id": "nvidia_grid",
        "label": "Grid Default",
        "path": "/Isaac/Environments/Grid/default_environment.usd",
        "description": "Minimal grid environment",
        "thumbnail": null
      },
      {
        "id": "nvidia_simple_room",
        "label": "Simple Room",
        "path": "/Isaac/Environments/Simple_Room/simple_room.usd",
        "description": "Basic room with walls and floor",
        "thumbnail": null
      },
      {
        "id": "nvidia_hospital",
        "label": "Hospital",
        "path": "/Isaac/Environments/Hospital/hospital.usd",
        "description": "Hospital corridor environment",
        "thumbnail": null
      },
      {
        "id": "nvidia_office",
        "label": "Office",
        "path": "/Isaac/Environments/Office/office.usd",
        "description": "Office space with desks and chairs",
        "thumbnail": null
      }
    ],
    "robots": [
      {
        "id": "nvidia_franka",
        "label": "Franka Emika Panda",
        "path": "/Isaac/Robots/Franka/franka_alt_fingers.usd",
        "description": "7-DOF collaborative robot arm",
        "thumbnail": null
      },
      {
        "id": "nvidia_ur10",
        "label": "Universal Robots UR10",
        "path": "/Isaac/Robots/UniversalRobots/ur10/ur10.usd",
        "description": "6-DOF industrial robot arm",
        "thumbnail": null
      },
      {
        "id": "nvidia_carter",
        "label": "Carter v2",
        "path": "/Isaac/Robots/Carter/carter_v2.usd",
        "description": "Mobile robot base for navigation",
        "thumbnail": null
      }
    ],
    "objects": [
      {
        "id": "nvidia_cardbox_a",
        "label": "Cardboard Box A",
        "path": "/Isaac/Props/YCB/Axis_Aligned/003_cracker_box.usd",
        "description": "YCB cracker box (manipulation benchmark)",
        "thumbnail": null
      },
      {
        "id": "nvidia_mug",
        "label": "Mug",
        "path": "/Isaac/Props/YCB/Axis_Aligned/025_mug.usd",
        "description": "YCB mug (manipulation benchmark)",
        "thumbnail": null
      },
      {
        "id": "nvidia_banana",
        "label": "Banana",
        "path": "/Isaac/Props/YCB/Axis_Aligned/011_banana.usd",
        "description": "YCB banana (manipulation benchmark)",
        "thumbnail": null
      },
      {
        "id": "nvidia_pallet",
        "label": "Pallet",
        "path": "/Isaac/Props/Warehouse/Pallets/pallet.usd",
        "description": "Warehouse pallet",
        "thumbnail": null
      },
      {
        "id": "nvidia_table",
        "label": "Table",
        "path": "/Isaac/Props/Furniture/Table/table.usd",
        "description": "Simple table surface",
        "thumbnail": null
      }
    ],
    "sensors": [
      {
        "id": "nvidia_camera",
        "label": "Pinhole Camera",
        "path": "__builtin__/camera/pinhole",
        "description": "Standard pinhole camera sensor",
        "thumbnail": null
      },
      {
        "id": "nvidia_lidar",
        "label": "Rotating Lidar",
        "path": "__builtin__/sensor/lidar_rotating",
        "description": "360° rotating lidar sensor",
        "thumbnail": null
      }
    ],
    "lighting": [
      {
        "id": "nvidia_dome_light",
        "label": "Dome Light",
        "path": "__builtin__/light/dome",
        "description": "Environment dome light (IBL)",
        "thumbnail": null
      },
      {
        "id": "nvidia_distant_light",
        "label": "Distant Light",
        "path": "__builtin__/light/distant",
        "description": "Directional sunlight",
        "thumbnail": null
      },
      {
        "id": "nvidia_sphere_light",
        "label": "Sphere Light",
        "path": "__builtin__/light/sphere",
        "description": "Point/area light source",
        "thumbnail": null
      }
    ]
  }
}
```

**Step 2: Commit**

```bash
git add frontend/public/nvidia-assets.json
git commit -m "feat: add curated NVIDIA Isaac Sim built-in asset catalog"
```

---

## Task 4: Frontend — Scene Store

**Files:**
- Create: `frontend/src/stores/sceneStore.ts`

**Step 1: Create the scene store**

Follow the exact Zustand pattern from `pipelineStore.ts`. The store manages scene placements (the 2D/3D canvas state), the asset catalog, and AI generation state.

```typescript
import { create } from 'zustand';

// --- Types ---

export interface ScenePlacement {
  id: string;
  asset_id: string;
  asset_source: 'registry' | 'nvidia' | 'upload';
  asset_type: 'robot' | 'environment' | 'object' | 'sensor' | 'light';
  label: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  physics_enabled: boolean;
  is_global: boolean;
  properties: Record<string, unknown>;
}

export interface SceneConfig {
  name: string;
  description?: string;
  physics_dt: number;
  render_dt: number;
  gravity: [number, number, number];
  num_envs?: number;
  env_spacing?: number;
  placements: ScenePlacement[];
}

export interface NvidiaAsset {
  id: string;
  label: string;
  path: string;
  description: string;
  thumbnail: string | null;
}

export interface NvidiaAssetCatalog {
  version: string;
  source: string;
  categories: Record<string, NvidiaAsset[]>;
}

export interface RegistryAsset {
  file_id: string;
  file_type: string;
  file_path: string;
  status: string;
  version: string;
}

// --- Store ---

interface SceneState {
  // Scene config (synced with pipeline node config)
  sceneConfig: SceneConfig;
  selectedPlacementId: string | null;

  // Asset catalog
  nvidiaAssets: NvidiaAssetCatalog | null;
  nvidiaAssetsLoading: boolean;
  registryAssets: RegistryAsset[];
  registryAssetsLoading: boolean;

  // View mode
  sceneViewMode: '2d' | '3d' | 'split';

  // AI generation
  generating: boolean;
  generateError: string | null;

  // Actions
  setSceneConfig: (config: SceneConfig) => void;
  addPlacement: (placement: ScenePlacement) => void;
  updatePlacement: (id: string, updates: Partial<ScenePlacement>) => void;
  removePlacement: (id: string) => void;
  selectPlacement: (id: string | null) => void;
  setSceneViewMode: (mode: '2d' | '3d' | 'split') => void;
  fetchNvidiaAssets: () => Promise<void>;
  fetchRegistryAssets: () => Promise<void>;
  uploadAsset: (file: File, fileType: string) => Promise<RegistryAsset | null>;
  generateScene: (prompt: string, taskType: string, robotId: string) => Promise<void>;
  resetScene: () => void;
}

const DEFAULT_SCENE_CONFIG: SceneConfig = {
  name: 'Untitled Scene',
  physics_dt: 1 / 60,
  render_dt: 1 / 60,
  gravity: [0, 0, -9.81],
  placements: [],
};

export const useSceneStore = create<SceneState>((set, get) => ({
  sceneConfig: { ...DEFAULT_SCENE_CONFIG },
  selectedPlacementId: null,
  nvidiaAssets: null,
  nvidiaAssetsLoading: false,
  registryAssets: [],
  registryAssetsLoading: false,
  sceneViewMode: 'split',
  generating: false,
  generateError: null,

  setSceneConfig: (config) => set({ sceneConfig: config }),

  addPlacement: (placement) =>
    set((s) => ({
      sceneConfig: {
        ...s.sceneConfig,
        placements: [...s.sceneConfig.placements, placement],
      },
    })),

  updatePlacement: (id, updates) =>
    set((s) => ({
      sceneConfig: {
        ...s.sceneConfig,
        placements: s.sceneConfig.placements.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        ),
      },
    })),

  removePlacement: (id) =>
    set((s) => ({
      sceneConfig: {
        ...s.sceneConfig,
        placements: s.sceneConfig.placements.filter((p) => p.id !== id),
      },
      selectedPlacementId: s.selectedPlacementId === id ? null : s.selectedPlacementId,
    })),

  selectPlacement: (id) => set({ selectedPlacementId: id }),

  setSceneViewMode: (mode) => set({ sceneViewMode: mode }),

  fetchNvidiaAssets: async () => {
    set({ nvidiaAssetsLoading: true });
    try {
      const res = await fetch('/nvidia-assets.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ nvidiaAssets: data, nvidiaAssetsLoading: false });
    } catch {
      set({ nvidiaAssets: null, nvidiaAssetsLoading: false });
    }
  },

  fetchRegistryAssets: async () => {
    set({ registryAssetsLoading: true });
    try {
      const res = await fetch('/mc/api/registry/files?limit=500');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ registryAssets: Array.isArray(data) ? data : [], registryAssetsLoading: false });
    } catch {
      set({ registryAssets: [], registryAssetsLoading: false });
    }
  },

  uploadAsset: async (file, fileType) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/mc/api/registry/files/upload?file_type=${fileType}`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const entry = await res.json();
      // Refresh registry assets
      await get().fetchRegistryAssets();
      return entry;
    } catch {
      return null;
    }
  },

  generateScene: async (prompt, taskType, robotId) => {
    set({ generating: true, generateError: null });
    try {
      const res = await fetch('/mc/api/pipelines/scenes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, task_type: taskType, robot_id: robotId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const config: SceneConfig = await res.json();
      set({ sceneConfig: config, generating: false });
    } catch (e) {
      set({ generating: false, generateError: String(e) });
    }
  },

  resetScene: () => set({
    sceneConfig: { ...DEFAULT_SCENE_CONFIG },
    selectedPlacementId: null,
    generating: false,
    generateError: null,
  }),
}));
```

**Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add frontend/src/stores/sceneStore.ts
git commit -m "feat: add scene Zustand store with placements, assets, and AI generation"
```

---

## Task 5: Frontend — SceneCanvas2D (Top-Down Floorplan)

**Files:**
- Create: `frontend/src/components/pipeline/SceneCanvas2D.tsx`

**Step 1: Create the 2D floorplan component**

HTML Canvas-based top-down view:
- Props: `placements: ScenePlacement[]`, `selectedId: string | null`, `onSelectPlacement: (id: string | null) => void`, `onUpdatePlacement: (id: string, updates: Partial<ScenePlacement>) => void`, `onDropAsset: (assetData: any, canvasX: number, canvasY: number) => void`
- Grid overlay with 0.1m spacing (configurable)
- Each placement rendered as a labeled rectangle color-coded by asset_type:
  - robot: `#ffaa00` (amber)
  - environment: `#4488ff` (blue)
  - object: `#44cc88` (green)
  - sensor: `#cc44ff` (purple)
  - light: `#ffcc44` (yellow)
- Click to select (shows selection highlight ring)
- Drag to reposition (updates position.x and position.y, z stays fixed)
- Accept drops from AssetBrowser (DragEvent with MIME `application/scene-asset`)
- Canvas auto-scales to fit all placements with padding
- Show coordinates on hover tooltip
- Axis labels: X (right), Y (up/forward)

Use inline styles (warm amber theme). The canvas element should fill its container.

**Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add frontend/src/components/pipeline/SceneCanvas2D.tsx
git commit -m "feat: add 2D floorplan canvas for scene composition"
```

---

## Task 6: Frontend — SceneCanvas3D (Three.js Viewport)

**Files:**
- Create: `frontend/src/components/pipeline/SceneCanvas3D.tsx`

**Step 1: Create the 3D viewport component**

Reuse the existing `SceneManager` class from `frontend/src/panels/Viewport3D/SceneManager.ts`:
- Props: same as SceneCanvas2D (`placements`, `selectedId`, `onSelectPlacement`, `onUpdatePlacement`, `onDropAsset`)
- On mount: instantiate `new SceneManager(containerRef.current)`
- For each placement: add a Three.js mesh to `sceneManager.scene`
  - Robot: orange box (0.3 × 0.3 × 0.5)
  - Environment: blue wireframe ground plane
  - Object: green box (0.1 × 0.1 × 0.1)
  - Sensor: purple small sphere
  - Light: yellow cone
- Selected placement: add `THREE.TransformControls` gizmo for translate/rotate
- Raycaster click detection: `onPointerDown` → raycast → find intersected mesh → `onSelectPlacement(id)`
- Sync with 2D: when placements prop changes, update mesh positions
- On unmount: call `sceneManager.dispose()`
- Accept drops from AssetBrowser (convert screen drop coords to world coords via raycaster)
- Orbit controls for camera (already in SceneManager setup)

Import `SceneManager` from `@/panels/Viewport3D/SceneManager`.

Install `three` TransformControls if not already available — check if Three.js addons are importable:
```typescript
import { TransformControls } from 'three/addons/controls/TransformControls.js';
```

**Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add frontend/src/components/pipeline/SceneCanvas3D.tsx
git commit -m "feat: add 3D Three.js viewport for scene composition"
```

---

## Task 7: Frontend — SceneCanvas Container

**Files:**
- Create: `frontend/src/components/pipeline/SceneCanvas.tsx`

**Step 1: Create the container component**

Manages the 2D/3D split view and syncs state between viewports:
- Props: `sceneConfig: SceneConfig`, `selectedPlacementId: string | null`, `onSelectPlacement: (id: string | null) => void`, `onUpdatePlacement: (id: string, updates: Partial<ScenePlacement>) => void`, `onAddPlacement: (placement: ScenePlacement) => void`
- Uses `sceneViewMode` from `useSceneStore`
- Top bar with view mode toggle: [2D] [3D] [Split] buttons (styled like Visual/YAML toggle)
- Renders:
  - `'2d'` → only SceneCanvas2D (full width)
  - `'3d'` → only SceneCanvas3D (full width)
  - `'split'` → both side-by-side (50/50 flex)
- `onDropAsset` handler: creates a new `ScenePlacement` with unique ID (crypto.randomUUID), default position at drop location, and calls `onAddPlacement`
- Status bar at bottom: "N assets placed | Scene: {name}"

**Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add frontend/src/components/pipeline/SceneCanvas.tsx
git commit -m "feat: add scene canvas container with 2D/3D/split view modes"
```

---

## Task 8: Frontend — Asset Browser

**Files:**
- Create: `frontend/src/components/pipeline/AssetBrowser.tsx`

**Step 1: Create the asset browser**

Left panel component (replaces NodePalette in Scene mode):
- Uses `useSceneStore` for `nvidiaAssets`, `registryAssets`, `fetchNvidiaAssets`, `fetchRegistryAssets`, `uploadAsset`
- Three tabs at top: [Registry] [NVIDIA] [Upload]
- Search input filters by label
- Categories are collapsible sections (same pattern as NodePalette)

**Registry tab:**
- Lists assets from `registryAssets` grouped by `file_type`
- Type-to-category mapping: `robot_usd`/`urdf` → Robots, `usd` → Objects, `curobo_yaml` → Configs
- Each entry: draggable, shows name + version + status badge

**NVIDIA tab:**
- Loads `nvidiaAssets` catalog on mount (calls `fetchNvidiaAssets`)
- Groups by catalog category (environments, robots, objects, sensors, lighting)
- Each entry: draggable, shows label + description

**Upload tab:**
- Drop zone (dashed border, "Drop files here or click to browse")
- File input (hidden, triggered by click on drop zone)
- Accepts: `.usd`, `.usda`, `.usdc`, `.obj`, `.stl`, `.urdf`
- On drop/select: calls `uploadAsset(file, inferredType)`
- Shows upload progress/success

**Drag interaction:**
- Same HTML5 drag pattern as NodePalette
- MIME type: `'application/scene-asset'`
- Data: `JSON.stringify({ id, source, asset_type, label, path })`
- `effectAllowed = 'copy'`

Width: 240px (same as NodePalette).

**Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add frontend/src/components/pipeline/AssetBrowser.tsx
git commit -m "feat: add asset browser with Registry/NVIDIA/Upload tabs"
```

---

## Task 9: Frontend — Scene Placement Properties in DetailDrawer

**Files:**
- Modify: `frontend/src/components/pipeline/DetailDrawer.tsx`

**Step 1: Add placement property form**

The DetailDrawer currently shows config for pipeline nodes. When in Scene mode, it should also show properties for the selected scene placement.

Add new props to `DetailDrawer`:
```typescript
// Add to DetailDrawer props interface:
scenePlacement?: ScenePlacement | null;
onUpdateScenePlacement?: (id: string, updates: Partial<ScenePlacement>) => void;
onRemoveScenePlacement?: (id: string) => void;
```

Add a new section that renders when `scenePlacement` is set (at the top of the drawer, before the node config). This section shows:

- **Header:** Asset label + type badge + delete button
- **Transform section:**
  - Position X/Y/Z (NumberField, step=0.01)
  - Rotation X/Y/Z (NumberField, step=1, range 0-360)
  - Scale X/Y/Z (NumberField, step=0.1, default 1)
- **Physics section:**
  - Physics Enabled (CheckboxField)
  - Is Global (CheckboxField) — tooltip: "Global assets are shared, not cloned per environment"
- **Info section:**
  - Asset source (read-only text)
  - Asset ID (read-only text, monospace)

Use the existing `NumberField` and `CheckboxField` components already in DetailDrawer.

**Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add frontend/src/components/pipeline/DetailDrawer.tsx
git commit -m "feat: add scene placement property forms to detail drawer"
```

---

## Task 10: Frontend — Wire Scene Mode into PipelinesPage

**Files:**
- Modify: `frontend/src/pages/PipelinesPage.tsx`

**Step 1: Add Scene mode**

This is the integration task. Modify the existing `PipelineEditor` component in PipelinesPage:

1. **Change viewMode state** (line 379):
   ```typescript
   const [viewMode, setViewMode] = useState<'visual' | 'yaml' | 'scene'>('visual');
   ```

2. **Add Scene toggle button** in `EditorTopBar` (after YAML button, ~line 344):
   - Third button "Scene" with same styling pattern
   - Active when `viewMode === 'scene'`

3. **Add "Generate" and "Cosmos Preview" buttons** in top bar — visible only in Scene mode:
   - "Generate" opens `SceneGenerateModal` (Task 11)
   - "Cosmos" button (placeholder — logs to console for now)

4. **Import scene components:**
   ```typescript
   import { SceneCanvas } from '@/components/pipeline/SceneCanvas';
   import { AssetBrowser } from '@/components/pipeline/AssetBrowser';
   import { useSceneStore } from '@/stores/sceneStore';
   ```

5. **Left panel conditional** (modify ~line 453):
   ```tsx
   {viewMode === 'visual' && <NodePalette />}
   {viewMode === 'scene' && <AssetBrowser />}
   ```

6. **Center panel conditional** (modify ~line 464):
   ```tsx
   {viewMode === 'visual' ? (
     <PipelineCanvas ... />
   ) : viewMode === 'scene' ? (
     <SceneCanvas
       sceneConfig={sceneConfig}
       selectedPlacementId={selectedPlacementId}
       onSelectPlacement={selectPlacement}
       onUpdatePlacement={updatePlacement}
       onAddPlacement={addPlacement}
     />
   ) : (
     <YamlEditor ... />
   )}
   ```

7. **Wire scene state:** When switching to Scene mode, load the `config` from the pipeline's `scene_usd` asset node into the scene store. When switching away, save the scene store state back to the pipeline node config via `updatePipeline`.

8. **DetailDrawer integration:** Pass `scenePlacement` and handlers when in scene mode.

**Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add frontend/src/pages/PipelinesPage.tsx
git commit -m "feat: wire scene mode into pipeline editor with 3-way toggle"
```

---

## Task 11: Frontend — AI Scene Generation Modal + Backend Endpoint

**Files:**
- Create: `frontend/src/components/pipeline/SceneGenerateModal.tsx`
- Modify: `backend/api/pipelines.py`

**Step 1: Create the generation modal**

Modal component:
- Props: `open: boolean`, `onClose: () => void`, `robots: { robot_id: string; name: string }[]`
- Textarea for prompt description
- Select dropdown for task type: Manipulation, Navigation, Inspection, Data Collection
- Select dropdown for robot (populated from props)
- Select dropdown for environment style: Warehouse, Grid, Room, Outdoor
- Generate button → calls `useSceneStore.generateScene(prompt, taskType, robotId)`
- Loading spinner while generating
- Error display if generation fails
- On success: closes modal (scene store already has the new config)

Style: same modal pattern as `TemplateGallery` in PipelinesPage (fixed overlay, centered card).

**Step 2: Add backend endpoint**

Add to `backend/api/pipelines.py` (after the template endpoints):

```python
class SceneGenerateRequest(BaseModel):
    prompt: str
    task_type: str  # manipulation, navigation, inspection, data_collection
    robot_id: str
    environment_style: Optional[str] = "grid"


class SceneGenerateResponse(BaseModel):
    name: str
    description: Optional[str] = None
    physics_dt: float = 1 / 60
    render_dt: float = 1 / 60
    gravity: list[float] = Field(default_factory=lambda: [0, 0, -9.81])
    num_envs: Optional[int] = None
    env_spacing: Optional[float] = None
    placements: list[dict]


@router.post("/scenes/generate", response_model=SceneGenerateResponse)
async def generate_scene(
    body: SceneGenerateRequest,
    session: AsyncSession = Depends(get_registry_session),
):
    """AI scene generation — dispatches to simulate agent.
    For now, returns a template-based scene layout.
    """
    # Look up robot for reach info
    from db.registry.models import Robot
    result = await session.execute(
        select(Robot).where(Robot.robot_id == body.robot_id)
    )
    robot = result.scalar_one_or_none()
    reach_m = (robot.reach_mm / 1000) if robot and robot.reach_mm else 1.0

    # Generate a task-appropriate default layout
    placements = []

    # Always add the robot at origin
    placements.append({
        "id": str(uuid.uuid4()),
        "asset_id": body.robot_id,
        "asset_source": "registry",
        "asset_type": "robot",
        "label": robot.name if robot else body.robot_id,
        "position": {"x": 0, "y": 0, "z": 0},
        "rotation": {"x": 0, "y": 0, "z": 0},
        "scale": {"x": 1, "y": 1, "z": 1},
        "physics_enabled": True,
        "is_global": False,
        "properties": {},
    })

    if body.task_type == "manipulation":
        # Table in front of robot within reach
        placements.append({
            "id": str(uuid.uuid4()),
            "asset_id": "nvidia_table",
            "asset_source": "nvidia",
            "asset_type": "object",
            "label": "Table",
            "position": {"x": reach_m * 0.5, "y": 0, "z": 0},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "scale": {"x": 1, "y": 1, "z": 1},
            "physics_enabled": False,
            "is_global": False,
            "properties": {},
        })
        # Objects on table
        import random
        obj_names = ["Box", "Mug", "Banana", "Cylinder", "Sphere"]
        for i, name in enumerate(obj_names[:3]):
            angle = (i / 3) * 3.14159 * 0.5
            placements.append({
                "id": str(uuid.uuid4()),
                "asset_id": f"nvidia_{name.lower()}",
                "asset_source": "nvidia",
                "asset_type": "object",
                "label": name,
                "position": {
                    "x": reach_m * 0.4 + 0.1 * (i - 1),
                    "y": 0.15 * (i - 1),
                    "z": 0.75,
                },
                "rotation": {"x": 0, "y": 0, "z": 0},
                "scale": {"x": 1, "y": 1, "z": 1},
                "physics_enabled": True,
                "is_global": False,
                "properties": {},
            })

    elif body.task_type == "navigation":
        # Obstacles scattered around
        for i in range(5):
            placements.append({
                "id": str(uuid.uuid4()),
                "asset_id": "nvidia_cardbox_a",
                "asset_source": "nvidia",
                "asset_type": "object",
                "label": f"Obstacle {i+1}",
                "position": {
                    "x": (i % 3 - 1) * 2.0,
                    "y": (i // 3 - 1) * 2.0,
                    "z": 0,
                },
                "rotation": {"x": 0, "y": 0, "z": 0},
                "scale": {"x": 1, "y": 1, "z": 1},
                "physics_enabled": False,
                "is_global": False,
                "properties": {},
            })

    # Add overhead camera
    placements.append({
        "id": str(uuid.uuid4()),
        "asset_id": "nvidia_camera",
        "asset_source": "nvidia",
        "asset_type": "sensor",
        "label": "Overhead Camera",
        "position": {"x": 0, "y": 0, "z": 2.0},
        "rotation": {"x": -90, "y": 0, "z": 0},
        "scale": {"x": 1, "y": 1, "z": 1},
        "physics_enabled": False,
        "is_global": True,
        "properties": {"resolution": [640, 480], "fov": 60},
    })

    # Add dome light
    placements.append({
        "id": str(uuid.uuid4()),
        "asset_id": "nvidia_dome_light",
        "asset_source": "nvidia",
        "asset_type": "light",
        "label": "Dome Light",
        "position": {"x": 0, "y": 0, "z": 3.0},
        "rotation": {"x": 0, "y": 0, "z": 0},
        "scale": {"x": 1, "y": 1, "z": 1},
        "physics_enabled": False,
        "is_global": True,
        "properties": {"intensity": 3000},
    })

    scene_name = f"{body.task_type.replace('_', ' ').title()} Scene"
    return SceneGenerateResponse(
        name=scene_name,
        description=f"Auto-generated {body.task_type} scene for {body.robot_id}. {body.prompt}",
        placements=placements,
        num_envs=32 if body.task_type in ("manipulation", "navigation") else None,
        env_spacing=2.5 if body.task_type in ("manipulation", "navigation") else None,
    )
```

Note: Add `import uuid` to the top of pipelines.py if not already imported.

**Important:** This endpoint must be registered BEFORE the `/{graph_id}` routes to avoid the same route conflict we fixed earlier. Place it after the template endpoints (which are already before `/{graph_id}`).

**Step 3: Verify**

```bash
cd backend && python -c "from api.pipelines import router; print('OK')"
cd frontend && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add frontend/src/components/pipeline/SceneGenerateModal.tsx backend/api/pipelines.py
git commit -m "feat: add AI scene generation modal and backend endpoint"
```

---

## Task 12: Integration — End-to-End Verification

**Step 1: Restart backend**

```bash
kill $(pgrep -f 'uvicorn main:app.*8000') 2>/dev/null
sleep 2
cd backend && nohup uvicorn main:app --host 127.0.0.1 --port 8000 > /tmp/mc-backend.log 2>&1 &
sleep 3
tail -5 /tmp/mc-backend.log
```

**Step 2: Verify new endpoints**

```bash
# Scene CRUD
curl -sL -X POST http://127.0.0.1:8000/api/registry/scenes \
  -H 'Content-Type: application/json' \
  -d '{"name": "Test Scene", "robot_ids": ["dobot_cr10"]}' | python3 -m json.tool

# List scenes
curl -sL http://127.0.0.1:8000/api/registry/scenes/ | python3 -m json.tool

# AI scene generation
curl -sL -X POST http://127.0.0.1:8000/api/pipelines/scenes/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "tabletop pick and place", "task_type": "manipulation", "robot_id": "dobot_cr10"}' \
  | python3 -m json.tool
```

**Step 3: Verify frontend compiles**

```bash
cd frontend && npx tsc --noEmit
```

**Step 4: Commit if any fixes needed**

```bash
git add -A && git commit -m "fix: integration fixes for scene builder"
```
