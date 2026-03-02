# Mission Control — 3D Visualization Platform Design
**Date:** 2026-03-01
**Status:** Implemented (Phase 1 complete)
**Spec:** SPEC.md v2.1.0 | **GUARDRAILS:** v1.0.0

---

## 1. Vision

Mission Control is a **Foxglove / RViz2 competitor** purpose-built for Isaac ROS. Its core
is a browser-based 3D visualization viewport that renders all standard ROS2 message types
at higher quality than RViz2, with an integrated node-based action graph editor for building
ROS2 pipelines visually.

**Three primary panels:**
1. **3D Viewport** — Full RViz2 display type coverage (URDF, PointCloud2, Markers, LaserScan, etc.)
2. **RQT Graph** — Live read-only visualization of the ROS2 computation graph
3. **Action Graph Editor** — Visual node-based ROS2 pipeline builder (Isaac Sim OmniGraph-style)

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│  MC Frontend  (~/mission-control/frontend/)               │
│  TypeScript  |  Vite  |  React 18  |  Three.js 0.170     │
│  React Flow 11  |  Zustand 5  |  react-mosaic  |  roslib │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Panel Layout (react-mosaic)                          │ │
│  │                                                       │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │ │
│  │  │ 3D Viewport│  │ RQT Graph  │  │ Action Graph   │  │ │
│  │  │ (Three.js) │  │ (React Flow│  │ (React Flow    │  │ │
│  │  │            │  │  read-only)│  │  read-write)   │  │ │
│  │  └────────────┘  └────────────┘  └────────────────┘  │ │
│  │                                                       │ │
│  │  ┌──────────┐ ┌────────────┐ ┌─────────────────────┐ │ │
│  │  │ Display  │ │ Topic      │ │ Properties /        │ │ │
│  │  │ Sidebar  │ │ Browser    │ │ Node Config         │ │ │
│  │  └──────────┘ └────────────┘ └─────────────────────┘ │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Zustand Stores                                       │ │
│  │  rosBridge | displays | tf | layout | graph | theme   │ │
│  └────────────────────────┬─────────────────────────────┘ │
│                           │                               │
│  ┌────────────────────────┴─────────────────────────────┐ │
│  │  ROS Connection (roslib singleton, auto-reconnect)    │ │
│  │  Direct WebSocket to rosbridge:9090                   │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
                          │ ws://
                          ▼
               ┌──────────────────────┐
               │  rosbridge (Docker)  │
               │  Isaac ROS container │
               │  port 9090           │
               └──────────────────────┘
```

**Key decisions:**
- **Direct rosbridge from frontend** — no backend proxy for real-time viz. Lowest latency.
- **MC backend** handles server-side operations: API endpoints, launch file generation,
  workflow execution, action graph deployment.
- **Built in `~/mission-control/frontend/`** — TypeScript, clean separation from ops dashboard.
- **Ops dashboard** (`~/agent-stack/dashboard/`) remains for fleet/agent monitoring. MC frontend
  is the visualization platform. Dashboard can link to it or embed it via iframe.

---

## 3. Theme — Warm Amber / Engineering Cockpit

### 3.1 Surface Hierarchy

| Token              | Value       | Usage                              |
|--------------------|-------------|-------------------------------------|
| `--bg-base`        | `#0a0a0a`   | App background, viewport bg         |
| `--bg-surface-1`   | `#111111`   | Panel backgrounds                   |
| `--bg-surface-2`   | `#1a1a1a`   | Cards, inputs, dropdowns            |
| `--bg-surface-3`   | `#222222`   | Hover states, elevated elements     |
| `--border-default` | `#2a2a2a`   | Default borders                     |
| `--border-active`  | `#ffaa00`   | Focus/active borders                |

### 3.2 Accent & Semantic Colors

| Token              | Value                    | Usage                        |
|--------------------|--------------------------|-------------------------------|
| `--accent`         | `#ffaa00`                | Primary accent, buttons, active |
| `--accent-hover`   | `#ffbb33`                | Hover state                   |
| `--accent-glow`    | `rgba(255,170,0,0.15)`   | Subtle glow on active elements|
| `--accent-dim`     | `rgba(255,170,0,0.08)`   | Background highlight          |
| `--success`        | `#00cc66`                | Connected, healthy, pass      |
| `--danger`         | `#ff4444`                | Error, disconnected, fail     |
| `--warning`        | `#ff8800`                | Warning, degraded             |
| `--info`           | `#4499ff`                | Data readouts, status, links  |

### 3.3 Typography

| Token              | Value                    | Usage                        |
|--------------------|--------------------------|-------------------------------|
| `--text-primary`   | `#e0e0e0`                | Body text (never pure white)  |
| `--text-secondary` | `#888888`                | Descriptions, hints           |
| `--text-muted`     | `#666666`                | Labels, captions              |
| `--text-accent`    | `#ffaa00`                | Highlighted text              |
| `--font-sans`      | `Inter, system-ui, sans` | All UI text, 13px base        |
| `--font-mono`      | `JetBrains Mono, mono`   | Data readouts, topic names    |
| `--font-size-xs`   | `10px`                   | Badges, micro labels          |
| `--font-size-sm`   | `12px`                   | Sidebar items, properties     |
| `--font-size-base` | `13px`                   | Body text                     |
| `--font-size-lg`   | `16px`                   | Panel titles                  |
| `--font-size-xl`   | `20px`                   | Page headers                  |

### 3.4 Visual Effects

- **Active panel:** 1px `#ffaa00` border + `box-shadow: 0 0 12px rgba(255,170,0,0.1)`
- **Primary buttons:** `#ffaa00` fill, `#0a0a0a` text, subtle glow on hover
- **Secondary buttons:** `#1a1a1a` fill, `#ffaa00` border
- **Scrollbars:** 6px width, `#222` track, `#444` thumb, `#ffaa00` thumb on hover
- **Status dots:** semantic colors with subtle pulse animation on live data
- **3D viewport background:** linear gradient `#0a0a0a` → `#0f0f12` (cool shift for depth)
- **React Flow wires:** `#ffaa00` for connected, `#444` for unconnected, animated dashes on data flow
- **Inputs on focus:** `#ffaa00` border + `--accent-glow` box-shadow

---

## 4. 3D Viewport — Display Plugin System

### 4.1 Display Interface

```typescript
interface DisplayPlugin {
  readonly type: string;
  readonly supportedMessageTypes: string[];

  topic: string;
  frameId: string;
  visible: boolean;
  properties: Record<string, any>;

  onAdd(scene: THREE.Scene, tfTree: TFTree): void;
  onRemove(scene: THREE.Scene): void;
  onMessage(msg: RosMessage): void;
  onFrame(deltaTime: number): void;
  getPropertySchema(): PropertyDefinition[];
  dispose(): void;
}
```

### 4.2 Display Registry

New displays are registered by type name. The system auto-discovers supported message types
and generates UI controls from the property schema.

```typescript
const displayRegistry = new Map<string, DisplayPluginConstructor>();
displayRegistry.set('RobotModel', RobotModelDisplay);
displayRegistry.set('PointCloud2', PointCloud2Display);
// ... etc
```

### 4.3 Full Display Type List

**Tier 1 — Core 3D (Phase 1):**

| Display         | ROS Message Type                    | Properties                                    |
|-----------------|-------------------------------------|------------------------------------------------|
| RobotModel      | `sensor_msgs/JointState`            | URDF source, alpha, visual/collision toggle    |
| TF Frames       | `tf2_msgs/TFMessage`                | Show names, axes length, update rate           |
| Grid            | (built-in)                          | Cell size, cell count, color, line width       |
| Axes            | (built-in)                          | Length, radius, reference frame                |
| Marker          | `visualization_msgs/Marker`         | All 11 marker subtypes auto-rendered           |
| MarkerArray     | `visualization_msgs/MarkerArray`    | Namespace filter                               |

**Tier 2 — Sensors (Phase 2):**

| Display         | ROS Message Type                    | Properties                                    |
|-----------------|-------------------------------------|------------------------------------------------|
| PointCloud2     | `sensor_msgs/PointCloud2`           | Point size, color field, min/max range, decay  |
| LaserScan       | `sensor_msgs/LaserScan`             | Style (points/lines), color, size, range       |
| Image           | `sensor_msgs/Image`                 | Encoding, transport                            |
| CompressedImage | `sensor_msgs/CompressedImage`       | Format (jpeg/png)                              |
| Camera          | `sensor_msgs/CameraInfo`            | Show frustum, image overlay, FOV              |
| DepthCloud      | `sensor_msgs/Image` (depth)         | Color map, min/max depth, point size           |
| Range           | `sensor_msgs/Range`                 | Cone color, alpha                              |

**Tier 3 — Pose & Navigation (Phase 2):**

| Display         | ROS Message Type                    | Properties                                    |
|-----------------|-------------------------------------|------------------------------------------------|
| Pose            | `geometry_msgs/PoseStamped`         | Style (arrow/axes), color, shaft length        |
| PoseArray       | `geometry_msgs/PoseArray`           | Arrow color, shaft length                      |
| Path            | `nav_msgs/Path`                     | Line color, width, pose style                  |
| Odometry        | `nav_msgs/Odometry`                 | Show arrow, covariance ellipse, keep history   |
| OccupancyGrid   | `nav_msgs/OccupancyGrid`           | Color scheme, alpha, show unknowns             |
| Costmap         | `nav_msgs/OccupancyGrid`           | Color spectrum, alpha                          |
| PointStamped    | `geometry_msgs/PointStamped`        | Marker size, color, history                    |
| GoalPose        | `geometry_msgs/PoseStamped`         | Interactive placement tool                     |

**Tier 4 — Physics & Advanced (Phase 3):**

| Display         | ROS Message Type                    | Properties                                    |
|-----------------|-------------------------------------|------------------------------------------------|
| WrenchStamped   | `geometry_msgs/WrenchStamped`       | Force arrow scale, torque arrow scale, color   |
| Effort          | `sensor_msgs/JointState` (effort)   | Color gradient, scale factor                   |
| InteractiveMarker | `visualization_msgs/InteractiveMarker` | Full 6DOF controls                        |
| Polygon         | `geometry_msgs/PolygonStamped`      | Line color, fill alpha                         |

**Tier 5 — Isaac ROS Specific (Phase 4):**

| Display         | Data Source                         | Properties                                    |
|-----------------|-------------------------------------|------------------------------------------------|
| nvblox Voxels   | nvblox occupancy topic              | Voxel color, alpha, layer filter               |
| cuRobo Trajectory | cuRobo output topic               | Joint ghost trail, color by velocity           |
| Digital Twin Sync | Sim + real joint states           | Side-by-side overlay, drift heatmap            |

### 4.4 Rendering Quality

| Feature         | RViz2              | Mission Control                              |
|-----------------|--------------------|-----------------------------------------------|
| Materials       | Flat Ogre shading  | PBR (MeshStandardMaterial)                    |
| Shadows         | None               | Soft shadow maps (PCFSoftShadowMap)           |
| Anti-aliasing   | None               | MSAA (4x) + optional FXAA post-process        |
| Lighting        | Single directional | HDR environment map + warm key light          |
| Point clouds    | Fixed size         | Size attenuation, color-by-field, LOD         |
| Ground grid     | Flat lines         | Subtle gradient, axis-colored (X=red, Z=blue) |
| Transforms      | Instant snap       | Interpolated (smooth 60fps updates)           |
| Background      | Flat gray          | Dark gradient (#0a0a0a → #0f0f12)            |

### 4.5 Viewport Controls

**Toolbar (top of viewport):**
- Fixed Frame dropdown (populated from TF tree)
- Camera mode: Orbit / First-person / Top / Front / Side
- Reset View button
- Tools: Select, 2D Nav Goal, 2D Pose Estimate, Publish Point, Measure

**Status bar (bottom of viewport):**
- FPS counter
- ROS connection status (green dot / red dot)
- Active display count
- Mouse world coordinates

---

## 5. RQT Graph Panel

**Purpose:** Live read-only visualization of the ROS2 computation graph.

### 5.1 Data Source

Queries rosbridge every 2 seconds:
- `rosapi/get_nodes` → list of active nodes
- `rosapi/get_node_details` per node → publishers, subscribers, services
- Assembled into a directed graph: nodes → topics → nodes

### 5.2 Rendering (React Flow)

- **Node shapes:**
  - ROS2 Node: rounded rectangle, amber border
  - Topic: diamond/pill shape, blue fill
  - Service: hexagon, green fill
- **Edges:** curved lines from publisher → topic → subscriber
- **Layout:** dagre algorithm (hierarchical left-to-right)
- **Interaction:**
  - Hover node → highlight all connected edges and neighbors
  - Click node → sidebar shows parameters, publications, subscriptions, services
  - Search/filter by namespace or node name
  - Zoom/pan, fit-to-view button
  - Toggle: show/hide inactive topics, group by namespace

### 5.3 Styling

- Matches warm amber theme
- Active data flow shown with animated dashed lines (#ffaa00)
- Node Hz badges (message rate) shown on topic nodes
- Dead nodes (no recent data) shown dimmed with dashed border

---

## 6. Action Graph Editor

**Purpose:** Visual node-based ROS2 pipeline builder. Build, save, and deploy ROS2 node
graphs without writing code. Like Isaac Sim Action Graph / OmniGraph for ROS2.

### 6.1 Node Library

Categorized drawer on the left side. Drag nodes onto canvas.

**Categories:**
- **Perception:** Isaac ROS stereo, depth, nvblox, AprilTag, object detection
- **Navigation:** Nav2 nodes (planner, controller, costmap, recoveries)
- **Manipulation:** MoveIt2 servo, cuRobo planner (if applicable)
- **Drivers:** robot_state_publisher, joint_state_publisher, camera drivers
- **Transforms:** static_transform_publisher, tf2 nodes
- **Recording:** bag recorder, topic relay, throttle
- **Custom:** user-defined node specs (YAML-configured)

Each node in the library declares:
```yaml
name: "stereo_image_proc"
package: "isaac_ros_stereo_image_proc"
plugin: "isaac_ros::stereo_image_proc::DisparityNode"
inputs:
  - name: "left/image_rect"
    type: "sensor_msgs/Image"
  - name: "right/image_rect"
    type: "sensor_msgs/Image"
outputs:
  - name: "disparity"
    type: "stereo_msgs/DisparityImage"
parameters:
  - name: "max_disparity"
    type: float
    default: 64.0
  - name: "backends"
    type: string
    default: "CUDA"
```

### 6.2 Canvas (React Flow)

- **Nodes:** Rendered as styled cards showing:
  - Node name and package
  - Input ports (left side) — typed, colored by message type
  - Output ports (right side) — typed, colored by message type
  - Status indicator (not deployed / running / error)
- **Wires:** Dragged from output port to input port.
  - Type checking: wire is only created if message types match
  - Wire = topic name (auto-generated or user-specified)
  - Animated amber dashes when data is flowing
- **Groups:** Select multiple nodes → "Group as ComposableNodeContainer"
  - Grouped nodes run in a single process (multi-threaded executor)
  - Visual: dashed bounding box around group
- **Minimap:** Bottom-right corner for large graphs

### 6.3 Node Properties (Right Sidebar)

Click a node on the canvas → right sidebar shows:
- **Parameters:** auto-generated form inputs (text, number, dropdown, checkbox)
- **Remappings:** override input/output topic names
- **Namespace:** set node namespace
- **Composable:** toggle component vs standalone node
- **Container:** which ComposableNodeContainer this node belongs to

### 6.4 Deployment Pipeline

```
Canvas graph → Validate (type checks, connectivity) → Generate launch file (Python)
→ POST /api/action-graph/deploy → MC Backend → Container Agent
→ Docker exec: ros2 launch <generated.launch.py> inside Isaac ROS container
```

**Deploy states:** Draft → Validating → Deploying → Running → Stopped → Error

### 6.5 Persistence

- Graphs saved to `action_graphs` table in registry DB (JSON serialization)
- Version history per graph
- Export as YAML or Python launch file
- Import from existing launch files (stretch goal — parse Python launch → graph)

---

## 7. Panel Layout System

### 7.1 Library: react-mosaic

Tiling window manager for panels. Each panel is resizable and rearrangeable.

### 7.2 Default Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Toolbar (Fixed Frame | Camera Mode | Tools | ROS Status)   │
├──────────┬──────────────────────────────────┬───────────────┤
│          │                                  │               │
│ Display  │         3D Viewport              │  Properties   │
│ Sidebar  │         (main panel)             │  Panel        │
│          │                                  │               │
│ - Add    │                                  │  (selected    │
│ - List   │                                  │   display or  │
│ - Toggle │                                  │   node props) │
│          │                                  │               │
├──────────┼──────────────────────────────────┤               │
│          │     RQT Graph / Action Graph     │               │
│ Topic    │     (tabbed, bottom split)       │               │
│ Browser  │                                  │               │
│          │                                  │               │
└──────────┴──────────────────────────────────┴───────────────┘
│  Status Bar (FPS | Connection | Displays | Coordinates)     │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 Saved Layouts

- Layouts serialize to JSON (mosaic tree + panel configs)
- Save/load from browser localStorage
- Preset layouts: "Visualization", "Graph Editor", "Monitoring", "Full"
- Panel types registered dynamically — new panel types can be added without layout changes

---

## 8. Zustand Store Architecture

```
stores/
  rosBridgeStore.ts     — connection state, URL, status, reconnect logic
  displayStore.ts       — active displays, their configs, add/remove/update
  tfStore.ts            — transform tree, frame list, lookupTransform()
  layoutStore.ts        — react-mosaic tree, saved layouts, active panels
  rqtGraphStore.ts      — live ROS2 graph data (nodes, topics, edges)
  actionGraphStore.ts   — action graph canvas state (nodes, edges, deploy status)
  topicStore.ts         — available topics with types and Hz
  settingsStore.ts      — user preferences (theme, units, etc.)
```

---

## 9. Backend Requirements

### 9.1 New API Endpoints

```
POST /api/action-graph/graphs          — save action graph
GET  /api/action-graph/graphs          — list saved graphs
GET  /api/action-graph/graphs/{id}     — get graph by ID
PUT  /api/action-graph/graphs/{id}     — update graph
POST /api/action-graph/deploy/{id}     — deploy graph (generate + launch)
POST /api/action-graph/stop/{id}       — stop deployed graph
GET  /api/action-graph/status/{id}     — deployment status
GET  /api/action-graph/node-library    — available ROS2 node types

GET  /api/ros2/graph                   — live computation graph (nodes + topics + edges)
GET  /api/ros2/node/{name}/details     — node publishers, subscribers, services, params
WS   /ws/ros2/graph                    — WebSocket stream of graph updates (optional, Phase 2)
```

### 9.2 New Backend Modules

- `backend/api/action_graph.py` — Action graph CRUD + deploy endpoints
- `backend/services/launch_generator.py` — Convert action graph JSON → Python ROS2 launch file
- `backend/api/ros2.py` — extend with `/graph` and `/node/{name}/details` endpoints
- `backend/rosbridge/client.py` — add auto-reconnect logic

### 9.3 New DB Tables

```sql
CREATE TABLE action_graphs (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    graph_json JSONB NOT NULL,      -- React Flow serialized state
    version INT DEFAULT 1,
    status TEXT DEFAULT 'draft',    -- draft | deployed | stopped | error
    container_name TEXT,            -- which Docker container it's running in
    launch_file_path TEXT,          -- generated launch file path
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE action_graph_node_library (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    package TEXT NOT NULL,
    plugin TEXT,
    category TEXT NOT NULL,
    inputs JSONB,                   -- [{name, type}]
    outputs JSONB,                  -- [{name, type}]
    parameters JSONB,               -- [{name, type, default, description}]
    created_at TIMESTAMPTZ
);
```

---

## 10. Implementation Phases

### Phase 1 — Foundation + Core 3D (Sprint scope)

**Frontend bootstrap:**
- Vite + TypeScript project setup
- Warm amber CSS theme (custom properties)
- react-mosaic panel layout with default arrangement
- roslib singleton with auto-reconnect
- Zustand stores (rosBridge, displays, tf, layout, topics)

**3D Viewport:**
- Three.js scene manager (PBR renderer, orbit controls, MSAA)
- TF tree manager (/tf, /tf_static subscription)
- Display plugin architecture (base class, registry, property system)
- First displays: Grid, Axes, TF Frames, RobotModel, Marker, MarkerArray

**UI Controls:**
- Display sidebar (add/remove/toggle/configure)
- Topic browser (list with type and Hz)
- Properties panel (auto-generated from display schema)
- Toolbar (fixed frame, camera mode, reset view)

### Phase 2 — Sensors + Navigation + RQT Graph

**More displays:** PointCloud2, LaserScan, Image, Camera, Pose, PoseArray,
Path, OccupancyGrid, Odometry, Range, DepthCloud

**RQT Graph panel:** React Flow live graph, dagre layout, node details sidebar

**Image panel:** Standalone 2D image viewer panel

### Phase 3 — Action Graph Editor

**Node library:** Categorized drawer, ROS2 node type specs (YAML)
**Canvas:** React Flow with typed ports, wire validation, groups
**Properties:** Per-node parameter editor
**Deploy:** Launch file generation + Container Agent execution
**Persistence:** action_graphs DB table, save/load

### Phase 4 — Isaac ROS Specific + Tools

**Isaac displays:** nvblox voxels, cuRobo trajectory, digital twin sync
**Tools:** 2D Nav Goal, Pose Estimate, Publish Point, Measure
**Advanced:** InteractiveMarkers, WrenchStamped, Effort, Polygon

---

## 11. File Structure

```
~/mission-control/frontend/
├── index.html
├── package.json              (existing — deps already declared)
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── public/
│   └── meshes/               (symlink to ~/dobot-cr10-stack/meshes/)
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── theme/
│   │   └── index.css         (warm amber theme, CSS custom properties)
│   ├── stores/
│   │   ├── rosBridgeStore.ts
│   │   ├── displayStore.ts
│   │   ├── tfStore.ts
│   │   ├── layoutStore.ts
│   │   ├── rqtGraphStore.ts
│   │   ├── actionGraphStore.ts
│   │   ├── topicStore.ts
│   │   └── settingsStore.ts
│   ├── ros/
│   │   ├── connection.ts     (roslib singleton, auto-reconnect)
│   │   ├── tfTree.ts         (transform tree manager)
│   │   └── messageTypes.ts   (ROS2 message type constants)
│   ├── panels/
│   │   ├── Viewport3D/
│   │   │   ├── Viewport3D.tsx
│   │   │   ├── SceneManager.ts
│   │   │   └── controls.ts
│   │   ├── RqtGraph/
│   │   │   ├── RqtGraph.tsx
│   │   │   └── graphLayout.ts
│   │   ├── ActionGraph/
│   │   │   ├── ActionGraph.tsx
│   │   │   ├── NodeLibrary.tsx
│   │   │   ├── ActionNode.tsx
│   │   │   └── deployService.ts
│   │   ├── ImageViewer/
│   │   │   └── ImageViewer.tsx
│   │   └── panelRegistry.ts
│   ├── displays/
│   │   ├── DisplayPlugin.ts      (base interface + abstract class)
│   │   ├── displayRegistry.ts
│   │   ├── GridDisplay.ts
│   │   ├── AxesDisplay.ts
│   │   ├── TFDisplay.ts
│   │   ├── RobotModelDisplay.ts
│   │   ├── MarkerDisplay.ts
│   │   ├── MarkerArrayDisplay.ts
│   │   ├── PointCloud2Display.ts
│   │   ├── LaserScanDisplay.ts
│   │   ├── ImageDisplay.ts
│   │   ├── CameraDisplay.ts
│   │   ├── PoseDisplay.ts
│   │   ├── PoseArrayDisplay.ts
│   │   ├── PathDisplay.ts
│   │   ├── OdometryDisplay.ts
│   │   ├── OccupancyGridDisplay.ts
│   │   ├── PointStampedDisplay.ts
│   │   ├── RangeDisplay.ts
│   │   ├── WrenchDisplay.ts
│   │   ├── PolygonDisplay.ts
│   │   └── InteractiveMarkerDisplay.ts
│   ├── components/
│   │   ├── Layout.tsx            (react-mosaic wrapper)
│   │   ├── Toolbar.tsx
│   │   ├── StatusBar.tsx
│   │   ├── DisplaySidebar.tsx
│   │   ├── TopicBrowser.tsx
│   │   ├── PropertyEditor.tsx
│   │   └── ui/                   (reusable primitives)
│   │       ├── Button.tsx
│   │       ├── Select.tsx
│   │       ├── Slider.tsx
│   │       ├── ColorPicker.tsx
│   │       ├── Toggle.tsx
│   │       ├── Badge.tsx
│   │       └── StatusDot.tsx
│   ├── hooks/
│   │   ├── useRosBridge.ts       (existing — needs singleton fix)
│   │   ├── useTopic.ts
│   │   ├── useServiceCall.ts
│   │   └── useAnimationFrame.ts
│   ├── types/
│   │   ├── index.ts              (existing — domain types)
│   │   ├── ros.ts                (ROS message types)
│   │   ├── displays.ts           (display plugin types)
│   │   └── actionGraph.ts        (action graph types)
│   └── utils/
│       ├── roslib-browser.ts     (CJS→ESM wrapper for roslib)
│       ├── quaternion.ts         (quaternion↔euler helpers)
│       └── colorMap.ts           (point cloud color mapping)
```

---

## 12. Non-Goals (Explicitly Out of Scope)

- Mobile-responsive layout (desktop-first, assumes wide screen)
- User authentication (handled by nginx/dashboard proxy layer)
- MCAP file playback (Phase 5+ — requires MCAP JS library)
- Custom extension/plugin API (Phase 5+ — after core is stable)
- Multi-robot fleet visualization (single robot focus first)
- Sound/audio panels
