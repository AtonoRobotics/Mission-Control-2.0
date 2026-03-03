# Mission Control v2 — Foxglove Parity & Multi-Platform Design
**Version:** 1.0.0
**Date:** 2026-03-02
**Status:** Approved
**Spec Impact:** SPEC.md v2.1.0 → v3.0.0 (major)

---

## Table of Contents

1. [Summary](#1-summary)
2. [UI Architecture — Panel Workspace](#2-ui-architecture--panel-workspace)
3. [Multi-Platform Architecture](#3-multi-platform-architecture)
4. [Network Architecture — Tailscale VPN](#4-network-architecture--tailscale-vpn)
5. [DataSource Abstraction](#5-datasource-abstraction)
6. [Panel Catalog](#6-panel-catalog)
7. [New Panel Specifications](#7-new-panel-specifications)
8. [Message Path Syntax](#8-message-path-syntax)
9. [MCAP Recording & Playback](#9-mcap-recording--playback)
10. [Authentication & User Management](#10-authentication--user-management)
11. [Team Workflows & Collaboration](#11-team-workflows--collaboration)
12. [Cloud Storage](#12-cloud-storage)
13. [Database Schema Changes](#13-database-schema-changes)
14. [Spec Changes Summary](#14-spec-changes-summary)

---

## 1. Summary

Mission Control v2 transforms from a page-based web application into a **multi-platform panel workspace** with full Foxglove Studio feature parity for ROS2 visualization, plus Mission Control's unique capabilities (Pipeline Builder, Robot Builder, Scene Builder, AI agent orchestration).

### Key Changes

- **UI model:** Page-based sidebar → Foxglove-style full-screen panel mosaic
- **Platforms:** Web-only → Web + Desktop (Electron) + iOS
- **Network:** Local-only → Tailscale VPN mesh (all clients always on-LAN)
- **Data model:** Live-only → Unified DataSource (live + MCAP playback)
- **Auth:** None → Local auth + Google/GitHub OAuth, JWT sessions, RBAC
- **Teams:** Single user → Multi-user teams with shared layouts and recordings
- **Cloud:** On-prem only → Hybrid (on-prem compute + S3 cloud storage for MCAP/configs)
- **Panels:** 12 display plugins → 35+ panel types with Foxglove feature parity

### What Is Preserved

All existing Mission Control features are preserved. Robot Builder, Scene Builder, Pipeline Builder, Action Graph Editor, Workflow Builder, Registry Browser, Fleet Manager, Agent Monitor, and all Isaac-specific panels remain — they become panels in the workspace instead of pages in a sidebar.

---

## 2. UI Architecture — Panel Workspace

The entire Mission Control UI becomes a **panel workspace**. No sidebar navigation. The screen is a full-bleed mosaic of panels that users arrange, save, and share.

### Top Bar (always visible)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◆ MISSION CONTROL   [Layout: Recording ▾]  [+ Panel]  [≡ Layouts]      │
│ [⚡ Live: rosbridge:9090]  [Robot: CR10]  [User: Samuel ▾]  [Settings] │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Layout selector** — switch between saved layouts (e.g., "Monitoring", "Recording", "Training", "Debug", "Robot Builder")
- **Add Panel** — opens panel catalog grouped by category
- **Data source indicator** — shows live connection or MCAP file name + playback state
- **Robot selector** — active robot context (affects Robot Builder, 3D Viewport, cuRobo panels)
- **User menu** — profile, team, logout
- **Settings** — app preferences, connection config, cloud storage

### Panel Workspace (full remaining space)

```
┌──────────────────────┬──────────────────────┬──────────────┐
│                      │                      │              │
│   3D Viewport        │   Image              │  Topic       │
│                      │                      │  Monitor     │
│                      │                      │              │
├──────────────────────┤                      ├──────────────┤
│                      │                      │              │
│   Plot               │                      │  Log         │
│   (joint velocities) │                      │  Viewer      │
│                      │                      │              │
└──────────────────────┴──────────────────────┴──────────────┘
```

- **react-mosaic** library for drag-and-drop panel arrangement (already in use for 3D viewer layout — promoted to entire app)
- Split horizontally, vertically, or as tabbed groups
- Every feature in the system is a panel — no pages, no fixed sidebar
- Layouts serialize as JSON: panel arrangement + per-panel configuration + data source bindings

### Layout System

- **Personal layouts** — saved per user, visible only to creator
- **Team layouts** — promoted from personal, visible to all team members
- **Import/Export** — layouts serialized as JSON files, sharable via file
- **Layout variables** — shared state values (e.g., selected joint index, active robot ID) accessible by all panels in a layout
- **Default layouts** — ship with sensible defaults: "Overview", "3D Monitoring", "Recording", "Pipeline Builder", "Robot Builder"

---

## 3. Multi-Platform Architecture

### Platform Matrix

| Capability | Web | Desktop (Electron) | iOS |
|---|---|---|---|
| **Panel workspace** | Full | Full | Subset (monitoring panels) |
| **3D Viewport** | Three.js | Three.js | Three.js (WKWebView) |
| **Robot/Scene/Pipeline Builder** | Full | Full | View-only |
| **Live ROS2 data** | Via rosbridge | Via rosbridge + native ROS2 | Via rosbridge (tailnet) |
| **MCAP playback** | Stream from S3 | Local file + S3 stream | Stream from S3 |
| **MCAP recording** | Via backend | Via backend + local | Trigger remote recording |
| **Local file access** | No | Yes (MCAP, URDF, bag) | Limited (downloads) |
| **Offline mode** | No | Yes (local MCAP files) | Cached recordings |
| **Push notifications** | Browser notifications | System tray | Native APNs |
| **Auth** | JWT + OAuth | JWT + OAuth | JWT + OAuth + biometric |
| **VPN** | User's Tailscale client | Embedded Tailscale | Embedded Tailscale |

### Monorepo Structure

```
mission-control/
├── packages/
│   ├── core/                  # Platform-agnostic shared logic (TypeScript)
│   │   ├── data-source/       # DataSource interface + Live/MCAP implementations
│   │   ├── panels/            # Panel registry, panel state management
│   │   ├── message-path/      # Message path syntax parser
│   │   ├── auth/              # Auth client, token management, RBAC
│   │   ├── stores/            # Zustand stores (shared state)
│   │   └── api/               # API client, S3 storage client
│   │
│   ├── web/                   # React web app (Vite)
│   │   └── src/
│   │       ├── App.tsx
│   │       ├── panels/        # Panel React components
│   │       ├── layout/        # react-mosaic workspace
│   │       └── theme/         # Warm amber theme
│   │
│   ├── desktop/               # Electron wrapper
│   │   ├── main/              # Electron main process (file access, system tray, native ROS2)
│   │   ├── preload/           # IPC bridge
│   │   └── package.json       # Electron builder config
│   │
│   └── ios/                   # iOS app (Swift + embedded WebView for shared panels)
│       ├── MissionControl/    # Swift native code
│       ├── Shared/            # Consumes @mission-control/core
│       └── MissionControl.xcodeproj
│
├── backend/                   # FastAPI (extended, single API for all platforms)
├── docs/
└── package.json               # Workspace root (npm/pnpm workspaces)
```

- **`packages/core`** — shared heart: DataSource, panel registry, stores, auth, API client, message path parser
- **`packages/web`** — imports `core`, renders panel workspace in browser
- **`packages/desktop`** — wraps web app in Electron, adds native file access, system tray, direct ROS2 via `rclnodejs`
- **`packages/ios`** — Swift app with WKWebView for shared panel rendering, native iOS UI for navigation/alerts

### iOS App — Monitoring + Playback Panels

| Panel | Description |
|---|---|
| Fleet Status | All robots, connection state, health |
| Live Camera | Stream camera feeds from active robots |
| 3D Viewport | Robot model + TF visualization (Three.js in WKWebView) |
| Joint Monitor | Per-joint position/velocity gauges |
| MCAP Browser | Browse and stream recordings from S3 |
| Alerts | Push notification history, system alerts |
| Compute | GPU/CPU/memory across fleet |
| Quick Record | Trigger recording start/stop on connected robot |

---

## 4. Network Architecture — Tailscale VPN

All clients (web, desktop, iOS) connect to the on-prem infrastructure via Tailscale mesh VPN. This eliminates the need for a separate cloud API — every client is always on the same virtual LAN.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    ALL CLIENTS ON TAILNET                  │
│   Web (browser)  │  Desktop (Electron)  │  iOS (native)  │
│   + Tailscale    │  + embedded Tailscale │  + Tailscale   │
└────────┬─────────┴──────────┬───────────┴───────┬────────┘
         │                    │                   │
         └────────────────────┼───────────────────┘
                              │  (all via tailnet IPs)
                    ┌─────────▼──────────┐
                    │  ON-PREM API       │
                    │  (FastAPI :8000)   │
                    │  ALL endpoints     │──────► PostgreSQL
                    └─────────┬──────────┘        (empirical + registry
                              │                    + users + teams
                    ┌─────────▼──────────┐         + recordings)
                    │  CLOUD (S3 only)   │
                    │  MCAP storage      │
                    │  Shared configs    │
                    │  Training burst    │
                    └────────────────────┘
```

### Tailscale Integration

- **Workstation / DGX Spark / AGX Thor / Orin Nano** — standard Tailscale client (already on AGX Thor)
- **Desktop (Electron)** — embedded Tailscale via `tsnet` Go library or system Tailscale client
- **iOS** — Tailscale iOS app (user installs separately) or embedded Tailscale SDK
- **Web** — user's machine must be on Tailscale; alternatively, use Tailscale Funnel for external access with auth

### Benefits

- **Single API server** — no cloud API needed, all platforms hit on-prem FastAPI
- **Single database** — everything in on-prem PostgreSQL (no cloud DB sync complexity)
- **iOS works everywhere** — persistent tailnet connection, even off-site
- **Low latency** — WireGuard kernel-level VPN, ~3-5% overhead
- **Secure** — no ports exposed to public internet, all traffic encrypted end-to-end

### Tailscale ACLs

```json
{
  "acls": [
    {"action": "accept", "src": ["tag:mission-control"], "dst": ["tag:mission-control:*"]},
    {"action": "accept", "src": ["tag:operator"], "dst": ["tag:mission-control:8000,9090"]},
    {"action": "accept", "src": ["tag:viewer"], "dst": ["tag:mission-control:8000"]}
  ]
}
```

- `tag:mission-control` — infrastructure machines (workstation, DGX, AGX, Orin)
- `tag:operator` — operator devices (can access API + rosbridge)
- `tag:viewer` — viewer devices (API only, no direct rosbridge)

---

## 5. DataSource Abstraction

The DataSource abstraction is the architectural foundation that enables panels to work identically with live ROS2 data and recorded MCAP data.

### Interface

```typescript
interface DataSource {
  type: 'live' | 'mcap' | 'ros2bag';

  // Connection lifecycle
  connect(): Promise<void>;
  disconnect(): void;
  status: ConnectionStatus; // 'connecting' | 'connected' | 'disconnected' | 'error'

  // Topic discovery
  getTopics(): TopicInfo[];           // {name, type, messageCount?}
  subscribe(topic: string, callback: MessageCallback): Subscription;

  // Parameters (live only — undefined for recorded sources)
  getParameters?(): Parameter[];
  setParameter?(name: string, value: any): void;

  // Services (live only)
  callService?(name: string, request: any): Promise<any>;

  // Publishing (live only)
  publish?(topic: string, message: any): void;

  // Playback controls (recorded only — undefined for live sources)
  seek?(timestamp: number): void;
  play?(): void;
  pause?(): void;
  setSpeed?(multiplier: number): void;  // 0.1x to 10x
  setLoop?(enabled: boolean): void;
  getTimeRange?(): { start: number; end: number };
  currentTime?: number;
  playbackState?: 'playing' | 'paused' | 'buffering';
}
```

### Implementations

**LiveDataSource**
- Wraps existing rosbridge connection (roslib v2)
- `subscribe()` creates ROS Topic subscription via WebSocket
- Parameters, services, publishing all work
- No playback controls — all playback methods are `undefined`
- Auto-reconnect with exponential backoff

**McapDataSource**
- Reads MCAP files (local filesystem on desktop, streamed from S3 on web/iOS)
- `subscribe()` delivers messages at recorded timestamps during playback
- Full playback controls: play/pause, seek, speed (0.1x–10x), loop
- Supports chunked random-access seek via MCAP index (no full-file scan)
- Message latching: on seek, delivers last known message per subscribed topic

**Ros2BagDataSource** (future)
- Reads ROS2 `.db3` bag files directly
- Same playback interface as McapDataSource

### React Context

```typescript
// Wraps entire app — all panels consume data through this context
const DataSourceProvider: React.FC<{ children: React.ReactNode }> = ...

// Hook for panels to subscribe to data
function useDataSource(): DataSource;
function useSubscription(topic: string): Message | undefined;
function usePlaybackControls(): PlaybackControls | undefined;
```

---

## 6. Panel Catalog

All panels grouped by category. Each panel is a self-contained React component registered in the PanelRegistry.

### Panel Registry

```typescript
interface PanelDefinition {
  id: string;                    // unique panel type ID
  title: string;                 // display name
  category: PanelCategory;
  component: React.ComponentType<PanelProps>;
  icon: React.ComponentType;
  platforms: ('web' | 'desktop' | 'ios')[];
  requiresLiveData?: boolean;    // disabled during MCAP playback
  defaultConfig?: Record<string, any>;
}
```

### Complete Panel List (35 panels)

| Category | Panel | ID | Platforms | New? |
|---|---|---|---|---|
| **3D & Spatial** | 3D Viewport | `3d-viewport` | all | Existing (enhanced) |
| | TF Tree | `tf-tree` | all | Existing (enhanced) |
| | Map | `map` | all | New |
| **Sensors** | Image | `image` | all | New |
| | PointCloud2 | `pointcloud2` | web, desktop | New |
| | LaserScan | `laser-scan` | web, desktop | New |
| | Camera Info | `camera-info` | all | New |
| | Depth Cloud | `depth-cloud` | web, desktop | New |
| **Data** | Plot | `plot` | all | New |
| | Gauge | `gauge` | all | New |
| | Indicator | `indicator` | all | New |
| | State Transitions | `state-transitions` | web, desktop | New |
| | Table | `table` | all | New |
| **ROS2 Inspect** | Topic Monitor | `topic-monitor` | all | Existing (enhanced) |
| | Raw Messages | `raw-messages` | all | New |
| | Node Graph | `node-graph` | web, desktop | Existing |
| | Parameters | `parameters` | web, desktop | New |
| | Service Call | `service-call` | web, desktop | New |
| | Action Monitor | `action-monitor` | web, desktop | New |
| | Log Viewer | `log-viewer` | all | New |
| **ROS2 Control** | Publish | `publish` | web, desktop | New |
| | Teleop | `teleop` | all | New |
| **Diagnostics** | Diagnostics | `diagnostics` | all | New |
| | Latency Monitor | `latency-monitor` | web, desktop | New |
| | Frequency Monitor | `frequency-monitor` | all | New |
| **Recording** | Bag Recorder | `bag-recorder` | web, desktop | New |
| | MCAP Browser | `mcap-browser` | all | New |
| **Isaac** | Sim Control | `isaac-sim-control` | web, desktop | Existing |
| | Lab Monitor | `isaac-lab-monitor` | web, desktop | Existing |
| | nvblox Map | `nvblox-map` | web, desktop | Existing (stub) |
| | cuRobo Trajectory | `curobo-trajectory` | web, desktop | Existing (stub) |
| | Digital Twin Sync | `digital-twin-sync` | web, desktop | Existing (stub) |
| | ZED X Status | `zedx-status` | all | Existing (stub) |
| **Infrastructure** | Container Manager | `container-manager` | web, desktop | Existing |
| | Agent Monitor | `agent-monitor` | web, desktop | Existing |
| | Compute Monitor | `compute-monitor` | all | Existing |
| | Fleet Status | `fleet-status` | all | Existing |
| **Project** | Robot Builder | `robot-builder` | web, desktop | Existing |
| | Pipeline Builder | `pipeline-builder` | web, desktop | Existing |
| | Scene Builder | `scene-builder` | web, desktop | Existing |
| | Registry Browser | `registry-browser` | web, desktop | Existing |
| | Workflow Builder | `workflow-builder` | web, desktop | Existing |
| **Utility** | User Script | `user-script` | web, desktop | New |
| | Variable Slider | `variable-slider` | all | New |
| | Data Source Info | `data-source-info` | all | New |
| | Markdown | `markdown` | all | New |

---

## 7. New Panel Specifications

### 7.1 Raw Messages Panel

- Subscribe to any topic, display latest message as collapsible JSON tree
- **Diff mode:** compare consecutive messages — green=added, red=removed, yellow=changed
- Copy message/field to clipboard
- Schema viewer — display message type definition
- **Message path syntax** support for field drill-down
- Expand/collapse state persists across frames

### 7.2 Plot Panel

- Time-series graph of any numeric message field
- Multiple series per plot (different topics/fields on same axes)
- Field selection via **message path syntax**: `/joint_states.position[0]`
- Configurable X axis (time window: 10s, 30s, 60s, 5min, all) and Y axis (auto-scale or manual range)
- Rendering library: **uPlot** (handles 100k+ points at 60fps)
- Works identically with live and MCAP data
- Cursor sync: hovering shows value tooltip, syncs with timeline in MCAP mode

### 7.3 Table Panel

- Tabular display for array-type messages (joint states, TF lists, diagnostics)
- Sortable columns, configurable visible fields
- Column selection via message path
- Export to CSV

### 7.4 Log Viewer Panel

- Subscribes to `/rosout` topic
- Filter by severity: DEBUG, INFO, WARN, ERROR, FATAL
- Filter by node name (dropdown from active nodes)
- Keyword search across message text
- Color-coded rows by severity
- Auto-scroll with pause-on-hover
- Timestamp display (absolute or relative)

### 7.5 Diagnostics Panel

- Subscribes to `/diagnostics` (`diagnostic_msgs/DiagnosticArray`)
- Per-component status display: OK (green), WARN (yellow), ERROR (red), STALE (gray)
- Expandable detail view per component showing key-value pairs
- History timeline per component (status changes over time)
- Filter by hardware_id or component name

### 7.6 State Transitions Panel

- Tracks enum/string message fields over time as horizontal swim lanes
- Each distinct value gets a color
- Hovering shows timestamp and transition detail
- Good for: robot state machines, action server goal states, mode switches
- Field selection via message path syntax

### 7.7 Gauge Panel

- Single numeric value displayed as arc gauge
- Configurable: min, max, warning threshold, critical threshold
- Current value + label
- Binds to any numeric field via message path
- Color changes at thresholds (green → yellow → red)

### 7.8 Indicator Panel

- Boolean status light: green (true/ok), red (false/error), yellow (warning), gray (stale)
- Binds to boolean field or threshold expression
- Configurable labels and colors per state
- Compact — designed for status bar or small panel slots

### 7.9 Publish Panel

- Select topic from dropdown (or type custom name)
- Select message type from ROS2 type list
- Auto-generated form from message schema (recursive for nested types)
- Publish: single shot or at configurable rate (1-100 Hz)
- Save/load message presets for frequently used messages
- **Requires operator or admin role**

### 7.10 Service Call Panel

- Browse available services (auto-discovered via rosbridge)
- Select service → auto-generated request form from service type
- Call button → display response in JSON tree
- History of recent calls (service name, request, response, timestamp)
- **Requires operator or admin role**

### 7.11 Parameter Panel

- List all ROS2 node parameters (via rosbridge parameter API)
- Filter/search by parameter name
- Grouped by node name (expandable tree)
- Inline edit with type-appropriate input:
  - bool → toggle switch
  - int/float → number spinner with step
  - string → text field
  - array → JSON editor
- Changes sent via rosbridge parameter service
- **Requires operator or admin role**

### 7.12 Teleop Panel

- Virtual joystick (touch-friendly for iOS) + keyboard bindings (WASD + arrows)
- Publishes `geometry_msgs/Twist` to configurable topic (default: `/cmd_vel`)
- Configurable linear velocity limit (m/s) and angular velocity limit (rad/s)
- Gamepad support via browser Gamepad API
- Dead-man switch: publishes zero velocity on release
- **Requires operator or admin role**

### 7.13 Image Panel

- Subscribes to `sensor_msgs/Image` or `sensor_msgs/CompressedImage`
- Hardware-accelerated decode for JPEG/PNG compressed images
- **Overlay support:** bounding boxes, labels, segmentation masks (from companion annotation topics)
- Multi-topic: configure multiple camera feeds in a grid within one panel
- Click-to-zoom on any feed
- Display frame rate and resolution in panel header

### 7.14 PointCloud2 Panel (renders in 3D Viewport)

- WebGL instanced point rendering for `sensor_msgs/PointCloud2`
- Color modes: intensity, height (Z), RGB (if available), flat color
- Configurable point size (1-10 px) and opacity
- Point budget / decimation for performance (default: 500k points max)
- Depth-based attenuation (farther points smaller)

### 7.15 LaserScan Panel (renders in 3D Viewport)

- 2D fan visualization for `sensor_msgs/LaserScan`
- Color modes: intensity, range, flat color
- Configurable range min/max filter
- Ray rendering or filled polygon rendering option

### 7.16 Camera Info Panel

- Displays `sensor_msgs/CameraInfo` data
- Frustum visualization in 3D Viewport (wireframe cone showing FOV)
- Intrinsics matrix display
- Distortion model and coefficients
- Resolution and frame_id

### 7.17 Map Panel

- Geographic display for `sensor_msgs/NavSatFix` messages
- Tile-based map rendering via **Leaflet** (OpenStreetMap tiles — no vendor dependency)
- GPS trail overlay with configurable trail length
- Current position marker with heading indicator
- Coordinate display (lat/lon/alt)
- Useful for outdoor robot operations or GPS-equipped cinema setups

### 7.18 User Script Panel

- **Monaco editor** with TypeScript support
- Subscribe to any topics, transform data, publish to virtual topics
- Autocomplete for ROS message type fields
- Virtual topics appear in topic list — other panels can subscribe to them
- Example use: compute custom metrics, reformat messages, combine topics
- Script state persists in layout config

### 7.19 Variable Slider Panel

- Interactive slider bound to a **layout variable**
- Configurable: variable name, min, max, step, default value
- Other panels reference layout variables in their config
- Example: slider controls which joint index the Plot panel displays (`/joint_states.position[$jointIndex]`)

### 7.20 Data Source Info Panel

- Shows active data source type (Live / MCAP)
- Live: rosbridge URL, connection uptime, reconnect count
- MCAP: file name, duration, total size, topic count
- Bandwidth: messages/sec, bytes/sec across all subscriptions
- Topic count with type breakdown

### 7.21 Markdown Panel

- Render Markdown text in a panel
- Supports layout variable interpolation in template strings
- Use cases: instructions, checklists, setup guides, shift notes
- Editable by operators, read-only for viewers

### 7.22 Action Monitor Panel

- Lists all ROS2 action servers (auto-discovered)
- Per-action: goal status (PENDING, ACTIVE, SUCCEEDED, CANCELED, ABORTED)
- Live feedback display for active goals
- Result display for completed goals
- Cancel button for active goals (**operator/admin only**)

### 7.23 Latency Monitor Panel

- Per-topic: measures time between message header stamp and receive time
- Line chart of latency over time
- Statistics: min, max, mean, p95, p99
- Alert threshold: highlight topics exceeding configurable latency

### 7.24 Frequency Monitor Panel

- Per-topic: measures actual publish rate vs. expected rate
- Expected rate configurable per topic or auto-detected
- Bar chart or table view
- Highlight: topics below expected rate (potential drops)

### 7.25 Bag Recorder Panel

- Topic selection checklist (multi-select from available topics)
- Output format: MCAP (default) or ROS2 bag (.db3)
- Recording controls: Start / Stop / Pause
- Live display: duration, file size, message count
- Auto-upload to S3 toggle (on/off, configurable default)
- Naming: auto-generated (device_YYYY-MM-DD_HH-MM-SS) or custom
- **Requires operator or admin role**

### 7.26 MCAP Browser Panel

- Browse recordings by: device name, date range, topics, tags, user who recorded
- List view with: name, device, duration, size, topic count, cloud/local status
- Preview: topic list, first frame thumbnail (if Image topic present)
- Actions:
  - **Open** — switches app DataSource from Live to MCAP, loads timeline
  - **Download** — download from S3 to local (desktop only)
  - **Delete** — remove recording (**admin only**)
  - **Share** — make visible to team
  - **Tag** — add/remove labels
- Search and filter bar

---

## 8. Message Path Syntax

A unified query language for referencing fields inside ROS messages. Used by Plot, Gauge, Indicator, State Transitions, Raw Messages, Variable Slider, and User Script panels.

### Syntax

```
/topic.field.subfield                    → nested field access
/topic.array[0]                          → array index (0-based)
/topic.array[-1]                         → last element
/topic.array[1:3]                        → array slice
/topic{field==value}                     → message filter (skip non-matching)
/topic{id==$selectedId}                  → filter using layout variable
/topic.orientation.@rpy                  → transform: quaternion → roll/pitch/yaw
/topic.value.@abs                        → transform: absolute value
/topic.angle.@degrees                    → transform: radians → degrees
/topic.value.@abs.@degrees               → chained transforms (left to right)
```

### Examples

```
/joint_states.position[0]               → first joint position
/joint_states.velocity[-1]              → last joint velocity
/joint_states.position[$jointIndex]     → joint selected by layout variable
/tf.transforms[0].transform.translation.x
/diagnostics{name=="motor_driver"}.status
/scan.ranges[0:10]                      → first 10 range values
/imu.orientation.@rpy                   → quaternion → [roll, pitch, yaw]
/camera/image_raw.header.stamp.sec      → message timestamp
```

### Implementation

- Shared parser in `packages/core/message-path/`
- Parser outputs an AST consumed by panel data binding logic
- Layout variable references resolved at runtime from layout store
- Transform functions are extensible (register new transforms via plugin)

### Built-in Transforms

| Transform | Input | Output |
|---|---|---|
| `@rpy` | Quaternion (x,y,z,w) | [roll, pitch, yaw] in radians |
| `@degrees` | Number (radians) | Number (degrees) |
| `@abs` | Number | Absolute value |
| `@length` | Array | Array length |
| `@sqrt` | Number | Square root |

---

## 9. MCAP Recording & Playback

### Recording Flow

```
User clicks Record in Bag Recorder panel
        │
        ▼
Backend: start MCAP writer, subscribe to selected topics via rosbridge
        │
        ▼
Messages written to local MCAP file (chunked, LZ4 compressed)
        │
        ▼
User clicks Stop
        │
        ▼
Backend: finalize MCAP file, build topic/time index, register in recordings table
        │
        ▼
Auto-upload to S3 (if enabled) — background upload, non-blocking
        │
        ▼
Recording appears in MCAP Browser panel (local and/or cloud)
```

### Playback Flow

```
User opens recording in MCAP Browser (clicks "Open")
        │
        ▼
App switches DataSource from LiveDataSource to McapDataSource
        │
        ▼
McapDataSource loads MCAP file (local or streams from S3)
        │
        ▼
Timeline bar appears at bottom of workspace
        │
        ▼
All panels receive data from McapDataSource via same subscribe() API
(panels do not know they are reading recorded data)
        │
        ▼
User controls: play/pause, seek, speed, loop, trim handles
        │
        ▼
User clicks "Go Live" to switch back to LiveDataSource
```

### Timeline Bar (visible during MCAP playback, anchored to bottom of workspace)

```
┌────────────────────────────────────────────────────────────────┐
│ ◄◄  ▶  ►►  │  00:01:23.456 / 00:15:00.000  │  1.0x ▾  │ Loop │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ [━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━] │
│ ◄ trim ────────────────────────────────────────── trim ►       │
└────────────────────────────────────────────────────────────────┘
```

- Play / Pause (Space bar)
- Seek: click timeline, arrow keys (100ms), Shift+arrow (10ms), Home/End
- Speed: 0.1x, 0.25x, 0.5x, 1x, 2x, 5x, 10x
- Loop: toggle on/off
- Trim handles: narrow playback window without re-loading file
- Buffer indicator: dark region = buffered, light = not yet loaded
- Message latching: on seek, last known message per topic delivered immediately

### MCAP Format Details

- Open-source container format (mcap.dev)
- Serialization-agnostic: stores ROS2 messages, Protobuf, JSON, FlatBuffers
- Built-in topic/time indexes for random-access seek
- Chunked compression (LZ4 default, Zstandard optional)
- Self-describing: schemas stored alongside data
- Library: `@mcap/core` (TypeScript) for reading in browser/Electron

---

## 10. Authentication & User Management

### Auth Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Web         │     │  Desktop     │     │  iOS         │
│  (Browser)   │     │  (Electron)  │     │  (Native)    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │  (via Tailscale)
                    ┌───────▼───────┐
                    │  Auth Service │
                    │  /api/auth/*  │  (FastAPI, on-prem)
                    └───────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
      ┌───────▼──────┐ ┌───▼────┐ ┌──────▼──────┐
      │ Local Auth   │ │ Google │ │ GitHub      │
      │ (bcrypt +    │ │ OAuth  │ │ OAuth       │
      │  PostgreSQL) │ │ 2.0    │ │ 2.0         │
      └──────────────┘ └────────┘ └─────────────┘
```

### JWT Flow

- Login returns short-lived access token (15 min) + long-lived refresh token (7 days)
- Access token: in-memory (web), secure storage (desktop/iOS)
- Refresh token: httpOnly cookie (web), OS keychain via Electron safeStorage (desktop), iOS Keychain (iOS)
- iOS: optional biometric unlock (Face ID / Touch ID) to access stored refresh token

### Role-Based Access Control (3 roles)

| Permission | Admin | Operator | Viewer |
|---|---|---|---|
| View all panels & data | Yes | Yes | Yes |
| Control playback/recording | Yes | Yes | Yes |
| Browse MCAP recordings | Yes | Yes | Yes |
| Edit ROS parameters | Yes | Yes | No |
| Publish ROS messages | Yes | Yes | No |
| Run workflows/pipelines | Yes | Yes | No |
| Robot/Scene/Pipeline Builder | Yes | Yes | No |
| Trigger MCAP recording | Yes | Yes | No |
| Promote configs (draft→validated→promoted) | Yes | Yes | No |
| Call ROS services | Yes | Yes | No |
| Teleop | Yes | Yes | No |
| Manage users & teams | Yes | No | No |
| Manage cloud storage & retention | Yes | No | No |
| Delete recordings/configs | Yes | No | No |
| System settings | Yes | No | No |

---

## 11. Team Workflows & Collaboration

### Team Layouts

- Any user can create **personal layouts** (saved to their account)
- Operators/admins can **promote** a personal layout to a **team layout** (visible to all team members)
- Team layouts are read-only for viewers, editable by operators/admins
- Layout sync: when a team layout is updated, all connected clients receive the update in real-time via WebSocket push
- Conflict resolution: last-write-wins for team layouts (with "layout was updated" notification)

### Shared Recordings

- Recordings are private by default (visible only to creator)
- Operators can **share** a recording with the team
- Shared recordings appear in all team members' MCAP Browser
- Admins can set default sharing policy (all recordings shared, or opt-in)

### Shared Configs

- Promoted configs can be shared with the team for multi-site deployments
- Shared configs uploaded to S3 with metadata in local DB
- Other team members can import shared configs into their local registry

### Activity Feed (future)

- Real-time feed of team activity: recordings started, configs promoted, workflows run
- Visible in a dedicated panel or notification area

---

## 12. Cloud Storage

Cloud storage is S3-compatible object storage used for MCAP recordings, shared configs, and training artifacts. The on-prem backend mediates all cloud access.

### Architecture

```
┌──────────────────────────────────────────────────┐
│                 S3 CLOUD STORAGE                  │
│                                                    │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ MCAP         │  │ Shared Configs            │  │
│  │ Recordings   │  │ (promoted URDF, YAML, USD)│  │
│  │ /recordings/ │  │ /configs/                 │  │
│  └──────────────┘  └──────────────────────────┘  │
│                                                    │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Training     │  │ Backups                   │  │
│  │ Artifacts    │  │ (DB snapshots)            │  │
│  │ /training/   │  │ /backups/                 │  │
│  └──────────────┘  └──────────────────────────┘  │
│                                                    │
│  S3-compatible: AWS S3 or MinIO (on-prem option)  │
└──────────────────────┬───────────────────────────┘
                       │
              ┌────────▼────────┐
              │  ON-PREM API    │
              │  /api/storage/* │  (presigned URLs for upload/download)
              └─────────────────┘
```

### What goes to cloud

| Data | Path | Auto-upload | Retention |
|---|---|---|---|
| MCAP recordings | `/recordings/{device}/{date}/` | Configurable (on/off per device) | Configurable (30d, 90d, 1yr, forever) |
| Shared configs | `/configs/{team}/{type}/` | Manual (operator shares) | Permanent |
| Training checkpoints | `/training/{run_id}/` | On training completion | Configurable |
| DB backups | `/backups/{date}/` | Scheduled (daily) | 30 days rolling |

### What stays on-prem only

- **Empirical DB** — physics ground truth never leaves the network
- **Live ROS2 data** — real-time streams stay local
- **Docker containers** — all compute on-prem
- **Safety system configs** — never cloud-synced
- **Draft/unvalidated configs** — only promoted configs eligible for cloud sharing

### Access Pattern

- Backend generates **presigned S3 URLs** for upload/download
- Clients upload/download directly to/from S3 (backend doesn't proxy large files)
- Metadata (recording info, tags, sharing state) stored in on-prem PostgreSQL
- S3 lifecycle rules handle retention/archival automatically

---

## 13. Database Schema Changes

New tables added to the existing on-prem Registry PostgreSQL database.

### New Tables

```sql
-- ============================================================
-- Authentication & Users
-- ============================================================

CREATE TABLE users (
    user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR UNIQUE NOT NULL,
    display_name    VARCHAR NOT NULL,
    password_hash   VARCHAR,              -- NULL for OAuth-only users
    avatar_url      VARCHAR,
    auth_provider   VARCHAR NOT NULL,     -- 'local', 'google', 'github'
    role            VARCHAR NOT NULL DEFAULT 'viewer',
                    CHECK (role IN ('admin', 'operator', 'viewer')),
    team_id         UUID REFERENCES teams(team_id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    last_login      TIMESTAMPTZ
);

CREATE TABLE teams (
    team_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR UNIQUE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sessions (
    session_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash      CHAR(64) NOT NULL,   -- SHA256 of refresh token
    device          VARCHAR,              -- 'web', 'desktop', 'ios'
    ip_address      VARCHAR,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Recordings (MCAP)
-- ============================================================

CREATE TABLE recordings (
    recording_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_name     VARCHAR NOT NULL,
    user_id         UUID REFERENCES users(user_id),
    team_id         UUID REFERENCES teams(team_id),
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ,
    duration_sec    FLOAT,
    topics          JSONB NOT NULL,       -- [{name, type, message_count}]
    size_bytes      BIGINT,
    local_path      VARCHAR,              -- local filesystem path (NULL if deleted locally)
    storage_url     VARCHAR,              -- S3 URL (NULL if not uploaded)
    storage_type    VARCHAR NOT NULL DEFAULT 'local',
                    CHECK (storage_type IN ('local', 's3', 'minio')),
    status          VARCHAR NOT NULL DEFAULT 'recording',
                    CHECK (status IN ('recording', 'complete', 'uploading', 'cloud', 'archived')),
    shared          BOOLEAN DEFAULT false,
    tags            JSONB DEFAULT '[]',
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Layouts (shared)
-- ============================================================

CREATE TABLE layouts (
    layout_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR NOT NULL,
    owner_id        UUID REFERENCES users(user_id),
    team_id         UUID REFERENCES teams(team_id),   -- NULL = personal
    layout_json     JSONB NOT NULL,       -- react-mosaic tree + panel configs
    is_default      BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Cloud Storage Tracking
-- ============================================================

CREATE TABLE cloud_objects (
    object_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket          VARCHAR NOT NULL,
    key             VARCHAR NOT NULL,     -- S3 object key
    size_bytes      BIGINT,
    content_type    VARCHAR,
    upload_status   VARCHAR NOT NULL DEFAULT 'pending',
                    CHECK (upload_status IN ('pending', 'uploading', 'complete', 'failed')),
    uploaded_by     UUID REFERENCES users(user_id),
    expires_at      TIMESTAMPTZ,          -- retention policy
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (bucket, key)
);
```

### Modified Tables

- **file_registry** — add `shared BOOLEAN DEFAULT false`, `shared_by UUID REFERENCES users(user_id)`
- **workflow_graphs** — add `owner_id UUID REFERENCES users(user_id)`, `team_id UUID`
- **build_logs** — add `user_id UUID REFERENCES users(user_id)`
- **agent_logs** — add `user_id UUID REFERENCES users(user_id)`

### Updated Registry DB Table Count

Previous: 15 tables → New: 20 tables (+users, +teams, +sessions, +recordings, +layouts, +cloud_objects, -0)

---

## 14. Spec Changes Summary

These changes transform SPEC.md from v2.1.0 to v3.0.0 (major version bump).

| Current Section | Change |
|---|---|
| **§1 Purpose & Scope** | Add Function 3: Multi-platform collaboration & data management. Update In Scope table with auth, teams, MCAP, cloud. Remove "Cloud compute" from Out of Scope. |
| **§2 What MC Is Not** | Remove "Not a cloud service." Replace with "Hybrid: on-prem compute, cloud data storage and collaboration." |
| **§3 Architecture** | Replace diagram with unified Tailscale architecture. Add iOS and Desktop as platform targets. |
| **§4 Core Principles** | Add P6: Platform Parity — shared core library, consistent UX across web/desktop/iOS. Add P7: Data Source Agnosticism — all panels work identically with live and recorded data. |
| **§5 Compute Layout** | Add cloud infrastructure row (S3 bucket). Add Tailscale mesh VPN as network layer. |
| **§6 Database** | Add new tables (users, teams, sessions, recordings, layouts, cloud_objects). Update total table count. Add RBAC access matrix. |
| **§11 Web UI** | **Complete rewrite.** Page-based sidebar → Foxglove-style panel workspace. react-mosaic for entire app. Panel registry with 35+ panel types. Layout system with personal/team layouts. Top bar replaces sidebar. |
| **§12 ROS2 Viz** | Expand tier list into full panel specifications. Add message path syntax. Add DataSource abstraction. Remove tier organization — all panels are first-class. |
| **§15 Repo Structure** | Rewrite as monorepo: `packages/core`, `packages/web`, `packages/desktop`, `packages/ios`. |
| **New §18** | Authentication & User Management — local auth + OAuth, JWT, RBAC |
| **New §19** | Team Workflows & Collaboration — shared layouts, shared recordings, team configs |
| **New §20** | Cloud Storage — S3 architecture, retention, upload/download via presigned URLs |
| **New §21** | MCAP Recording & Playback — full pipeline, timeline bar, McapDataSource |
| **New §22** | Multi-Platform Architecture — Web + Desktop (Electron) + iOS |
| **New §23** | Network Architecture — Tailscale VPN mesh, ACLs |
| **New §24** | Message Path Syntax — specification with examples and built-in transforms |
| **New §25** | Panel Catalog — complete registry of 35+ panels with platform availability |

---

*This design document was approved through interactive brainstorming on 2026-03-02.*
*Next step: Implementation planning via writing-plans skill.*
