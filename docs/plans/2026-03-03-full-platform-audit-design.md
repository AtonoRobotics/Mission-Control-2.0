# Full Platform Audit & Integration — Design Document
**Date:** 2026-03-03
**Version:** 1.0.0
**Status:** Draft

---

## Goal

Get every layer of Mission Control working end-to-end. Audit each pipeline, fix what's broken, build what's missing, and deliver a working system with proper UI workflow.

---

## 8 Phases (each with checkpoint)

### Phase 1: Infrastructure Foundation
- Kill stale uvicorn processes, fix `mission-control.service`
- Start all containers: Postgres, RosBridge (isaac-ros-start.sh), Isaac Sim
- Verify k3s + OSMO (13 pods) healthy
- Verify port assignments: 3000 (UI), 8000 (API), 5432 (DB), 9090 (RosBridge), 30080 (OSMO)
- **Pass:** All services green, no port conflicts, `/health` returns all-connected

### Phase 2: Isaac Pipeline + OSMO
- Verify Isaac Sim container launches and responds
- Isaac ROS bridge: sim → ROS topics → rosbridge WebSocket → frontend
- Submit OSMO workflow with Isaac Sim workload
- Verify OSMO DAG visualization: running/pending/failed node colors
- End-to-end: OSMO triggers Isaac job → results return to MC backend
- **Pass:** Isaac + OSMO pipeline proven, workflow completes

### Phase 3: Database & Backend API
- Verify both DBs (empirical + registry), check all migrations applied
- Test auth flow: register → login → JWT → refresh → protected route
- Hit all 17 routers with basic requests, catalog failures
- Test workflow execution: local mode + OSMO routing
- **Pass:** All routers respond (no 500s), auth works, workflows execute

### Phase 4: Cinema Assets — Build or Locate
Register all production assets for cinema robotics:

| Asset Category | Items | Action |
|----------------|-------|--------|
| Robot | Dobot CR10 (URDF/USD) | Exists — verify in registry |
| Camera | ARRI Alexa Mini body | Locate 3D model or spec for stub |
| Lenses | Zeiss Master Primes, CP.3, Supreme Prime | Specs exist in knowledge base — register |
| Baseplate | Camera mounting plate | Define dimensions, create stub model |
| FIZ | cmotion cPRO / ARRI WCU-4 | Research specs, register |
| Mounts | Tilt head, camera cage | Define geometry, create stub |
| Sensors | Joint encoders (17-bit), IMU | Specs in empirical DB — verify |

- For each: find existing, register in DB, or document as gap
- **Pass:** Asset inventory complete, all found assets registered

### Phase 5: Robot Builder — Web + Desktop
- Test full robot build flow in web UI:
  - Select CR10 → attach Alexa Mini → configure mount → add sensors
  - Generate URDF/config package → validate
- Test same flow in desktop app (Electron build)
- Verify robot-builder API endpoints work end-to-end
- **Pass:** Robot config package generated on both platforms

### Phase 6: Isaac ROS End-to-End
- Isaac Sim scene: CR10 + camera rig in studio environment
- Sim publishes: `/joint_states`, `/tf`, `/camera/image_raw`
- RosBridge forwards to frontend 3D viewer
- Frontend displays: live robot model + sensor overlays
- Stub real robot driver: accepts joint commands, returns fake encoder data
- Pipeline: Isaac Sim → ROS2 → RosBridge → Frontend (and reverse for commands)
- **Pass:** Live sim data visible in frontend, stub driver responds

### Phase 7: UI Overhaul — Foxglove Parity
**Major change: Remove sidebar, adopt Foxglove-style UI.**

#### Navigation Model
- **Top tab bar** — workspace tabs (not page navigation)
- Each tab = a named layout containing panels
- **No sidebar** — all navigation via top tabs + panel catalog
- **Context menus** — right-click on panels for config, topic selection, display options

#### Design System (Dark Theme)
Based on premium software patterns (Foxglove, DaVinci Resolve, Unreal Engine):

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#1a1a1a` | App background |
| `--bg-surface-1` | `#242424` | Panel backgrounds |
| `--bg-surface-2` | `#2d2d2d` | Elevated surfaces |
| `--bg-surface-3` | `#363636` | Hover states, active tabs |
| `--border` | `#404040` | Panel borders, dividers |
| `--text-primary` | `rgba(255,255,255,0.87)` | Primary text |
| `--text-secondary` | `rgba(255,255,255,0.60)` | Secondary text |
| `--text-disabled` | `rgba(255,255,255,0.38)` | Disabled text |
| `--accent` | `#ffaa00` | Primary accent (warm amber) |
| `--accent-hover` | `#ffbb33` | Accent hover |
| `--success` | `#4caf50` | Success states |
| `--warning` | `#ff9800` | Warning states |
| `--danger` | `#f44336` | Error/danger states |
| `--info` | `#2196f3` | Info states |

#### Workspace Modes (Default Tabs)
Each mode ships as a preset layout:

1. **Build** — Robot builder + component palette + 3D preview + properties
2. **Scene** — 3D viewport + asset library + scene hierarchy + properties
3. **Motion** — 3D viewport + timeline + trajectory inspector + constraints
4. **Simulate** — 3D viewport + Isaac controls + live data panels + diagnostics
5. **Deploy** — Fleet manager + real robot control + safety status + logs
6. **Monitor** — Diagnostics + agent status + fleet health + alerts + logs

Users can create custom tabs, rearrange panels, save layouts.

#### Key Panels (Foxglove Parity)
- **3D Panel** — Three.js viewport with all 12 display plugins
- **Diagnostics Panel** — Topic health, message rates, latency (Foxglove `/diagnostics` parity)
- **Plot Panel** — Time series with topic subscription
- **Log Panel** — Filterable log viewer
- **Image Panel** — Camera stream display
- **Raw Messages** — Topic message inspector
- **State Transitions** — State machine visualization
- **Agent Panel** — Live agent status, task queue, logs, success rates
- **Fleet Panel** — Machine health gauges (GPU/RAM/Disk/Temp per machine)
- **Pipeline Panel** — ReactFlow DAG editor for workflows
- **OSMO Panel** — Workflow submission, pool status, job monitoring

#### Panel Catalog
- Accessible via `+` button in tab bar or keyboard shortcut
- Searchable, categorized (Visualization, Data, Control, Monitoring)
- Drag-drop into workspace

#### Context Menu System
- Right-click on any panel → panel-specific options
- Common: topic selection, display settings, split panel, close
- Panel chrome: minimize, maximize, pop-out, settings gear

- **Pass:** Sidebar removed, top tabs working, all workspace modes functional, Foxglove-parity panels operational

### Phase 8: Full Feature Test
- Test every panel in every workspace mode
- Run all workflow node types
- Test agent delegation with real tasks
- Verify desktop app matches web
- Generate comprehensive pass/fail report
- Update `project_state.json` and `decisions_log.md`
- Define next sprint scope
- **Pass:** Full platform status documented

---

## Checkpoints

After EACH phase:
1. Run validation (manual or scripted)
2. Document pass/fail per item
3. Log issues found + fixes applied
4. Review with user before proceeding to next phase

---

## Out of Scope
- Real robot hardware connection (stub only)
- NvBlox perception pipeline (config exists, no ZED-X camera)
- MoveIt / cuMotion (permanently excluded)
- Cloud deployment
- IK solver (handled by cinema software / Isaac Sim / Isaac ROS)

---

## References
- SPEC v2.2.0: `~/mission-control/docs/SPEC.md`
- GUARDRAILS v1.0.0: `~/mission-control/docs/GUARDRAILS.md`
- Foxglove layout docs: https://docs.foxglove.dev/docs/visualization/layouts
- Material Design dark theme: https://m2.material.io/design/color/dark-theme.html
- OSMO workflow patterns: NVIDIA OSMO v6.0.0 (deployed)
