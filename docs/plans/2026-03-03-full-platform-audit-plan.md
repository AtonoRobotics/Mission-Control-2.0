# Full Platform Audit & Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Get every layer of Mission Control working end-to-end, with Foxglove-parity UI.

**Architecture:** 8-phase bottom-up audit. Fix infra → verify DB/API → integrate Isaac+OSMO → build assets → robot builder → Isaac ROS loop → UI overhaul → full test.

**Tech Stack:** FastAPI, PostgreSQL, React 18/TS/Vite 5, Three.js, ReactFlow, react-mosaic, Zustand, k3s, OSMO, Isaac Sim/ROS, Docker

---

## Phase 1: Infrastructure Foundation

### Task 1.1: Clean Stale Processes

**Files:** None (system ops)

**Step 1: Kill stale uvicorn processes**
```bash
pkill -f "uvicorn main:app" || true
```

**Step 2: Verify port 8000 is free**
```bash
ss -tlnp | grep 8000
```
Expected: No output

**Step 3: Fix mission-control.service**
```bash
sudo systemctl stop mission-control.service
sudo systemctl disable mission-control.service
```
We'll run backend manually during dev. Systemd is for production.

### Task 1.2: Start Core Services

**Step 1: Verify Postgres is running**
```bash
docker ps | grep mc-postgres
```
Expected: `mc-postgres` UP

**Step 2: Start backend**
```bash
cd /home/samuel/mission-control/backend
source /home/samuel/anaconda3/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8000 &
```

**Step 3: Verify backend health**
```bash
curl -s http://localhost:8000/health | python3 -m json.tool
```
Expected: `{"status": "ok", "db": "connected", ...}`

**Step 4: Start RosBridge container**
```bash
bash /home/samuel/mission-control/scripts/isaac-ros-start.sh
```

**Step 5: Verify RosBridge**
```bash
curl -s -N --max-time 3 http://localhost:9090 || echo "WebSocket only - expected"
```

**Step 6: Verify k3s + OSMO**
```bash
kubectl get nodes
kubectl get pods -n osmo
```
Expected: Nodes ready, 13 OSMO pods running

**Step 7: Verify frontend dev server**
```bash
cd /home/samuel/mission-control/packages/web && npm run dev &
curl -s http://localhost:3000 | head -5
```

**Checkpoint 1:** All services green. Run:
```bash
curl -s http://localhost:8000/health | python3 -m json.tool
```
Must show: db=connected, rosbridge=connected (or connecting)

---

## Phase 2: Isaac Pipeline + OSMO

### Task 2.1: Verify Isaac Sim Container

**Step 1: Check Isaac Sim image exists**
```bash
docker images | grep isaac-sim
```

**Step 2: Launch Isaac Sim container (headless test)**
```bash
docker run --rm --runtime nvidia --gpus all \
  nvcr.io/nvidia/isaac-sim:5.1.0 \
  bash -c "echo 'Isaac Sim container OK'"
```

**Step 3: Test OSMO API health**
```bash
curl -s http://localhost:30080/api/health
```

### Task 2.2: Submit OSMO Workflow

**Step 1: List OSMO pools**
```bash
curl -s http://localhost:8000/api/osmo/pools | python3 -m json.tool
```

**Step 2: List OSMO templates**
```bash
curl -s http://localhost:8000/api/osmo/templates | python3 -m json.tool
```

**Step 3: Submit hello-world workflow via MC API**
```bash
curl -s -X POST "http://localhost:8000/api/osmo/templates/hello-world/submit?pool=default" \
  -H "Content-Type: application/json" | python3 -m json.tool
```

**Step 4: Poll workflow status**
```bash
curl -s http://localhost:8000/api/osmo/workflows | python3 -m json.tool
```

**Checkpoint 2:** OSMO workflow completes successfully through MC backend.

---

## Phase 3: Database & Backend API

### Task 3.1: Verify Databases

**Step 1: Check empirical DB**
```bash
docker exec mc-postgres psql -U mc -d empirical -c "\dt"
```
Expected: robot, joint_spec, link_spec, collision_sphere, sensor_config tables

**Step 2: Check registry DB**
```bash
docker exec mc-postgres psql -U mc -d registry -c "\dt"
```
Expected: 15+ tables

**Step 3: Query CR10 data**
```bash
docker exec mc-postgres psql -U mc -d empirical -c "SELECT id, name, dof, max_payload_kg, reach_mm FROM robot WHERE id='dobot_cr10'"
```

### Task 3.2: Test All 17 API Routers

**Step 1: Create test script**
- Create: `scripts/test_api_routers.py`

```python
#!/usr/bin/env python3
"""Quick smoke test for all 17 API routers."""
import requests
import json
import sys

BASE = "http://localhost:8000"

# First, login to get token
login = requests.post(f"{BASE}/api/auth/login", json={
    "email": "admin@mc.local",
    "password": "admin"
})
if login.status_code != 200:
    print(f"FAIL: Login returned {login.status_code}: {login.text}")
    print("Try: python scripts/seed_admin.py first")
    sys.exit(1)

token = login.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Test each router with a basic GET
ROUTES = [
    ("auth",        "/api/auth/me"),
    ("users",       "/api/users"),
    ("ros2",        "/api/ros2/status"),
    ("isaac",       "/api/isaac/status"),
    ("containers",  "/api/containers"),
    ("registry",    "/api/registry/robots"),
    ("builds",      "/api/builds"),
    ("workflows",   "/api/workflows/graphs"),
    ("agents",      "/api/agents/logs"),
    ("compute",     "/api/compute/snapshot"),
    ("empirical",   "/api/empirical/robots/dobot_cr10/joints"),
    ("pipelines",   "/api/pipelines"),
    ("recordings",  "/api/recordings"),
    ("cloud",       "/api/cloud/objects"),
    ("layouts",     "/api/layouts"),
    ("robot-builder", "/api/robot-builder/components"),
    ("datasets",    "/api/datasets"),
    ("osmo",        "/api/osmo/pools"),
]

passed = 0
failed = 0
for name, route in ROUTES:
    try:
        r = requests.get(f"{BASE}{route}", headers=headers, timeout=10)
        status = "PASS" if r.status_code < 500 else "FAIL"
        if status == "FAIL":
            failed += 1
        else:
            passed += 1
        print(f"  [{status}] {name:16s} {route:45s} → {r.status_code}")
    except Exception as e:
        failed += 1
        print(f"  [FAIL] {name:16s} {route:45s} → {e}")

print(f"\n{passed}/{passed+failed} routers OK")
sys.exit(1 if failed > 0 else 0)
```

**Step 2: Seed admin user if needed**
```bash
cd /home/samuel/mission-control && python scripts/seed_admin.py
```

**Step 3: Run router tests**
```bash
python scripts/test_api_routers.py
```
Expected: 17/17 pass (or document failures)

**Step 4: Fix any failing routers** (delegate to `agent__develop`)

**Checkpoint 3:** All 17 routers respond without 500 errors.

---

## Phase 4: Cinema Assets

### Task 4.1: Inventory Existing Assets

**Step 1: Catalog what exists**

| Asset | Location | Status |
|-------|----------|--------|
| CR10 URDF | `~/dobot_cr10/cr10_robot.urdf` | ✅ |
| CR10 USD | `~/Documents/Robots/Dobot CR10/Dobot CR10.usd` | ✅ |
| CR10 meshes | `~/dobot_cr10/meshes/*.obj` | ✅ |
| Collision spheres | `~/dobot_cr10/config/cr10_collision_spheres.yaml` | ✅ |
| cuRobo config | `~/dobot_cr10/config/cr10_curobo.yaml` | ✅ |
| Zeiss lens specs | `~/agent-stack/knowledge/hardware/zeiss_master_35mm.md` | ✅ (text) |
| CR10 research | `~/agent-stack/knowledge/hardware/dobot_cr10_research.md` | ✅ (text) |

**Step 2: Research missing assets** (delegate to `agent__research`)
- ARRI Alexa Mini dimensions/weight/mount specs
- Common cinema lens specs (Zeiss CP.3, Supreme Prime, Master Prime sets)
- Camera baseplate dimensions (ARRI standard, 15mm rod)
- FIZ motor specs (cmotion cPRO, ARRI WCU-4)
- Camera cage/mount dimensions for CR10 end-effector

**Step 3: Register found assets in registry DB**
```bash
curl -X POST http://localhost:8000/api/registry/robots \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"robot_id": "dobot_cr10", "name": "Dobot CR10", "description": "6-DOF cinema camera robot"}'
```

**Step 4: Document gaps** — append to `state/decisions_log.md`

**Checkpoint 4:** Asset inventory complete. All found assets registered. Gaps documented.

---

## Phase 5: Robot Builder — Web + Desktop

### Task 5.1: Test Robot Builder Web Flow

**Step 1: Verify robot-builder endpoints**
```bash
# List components
curl -s http://localhost:8000/api/robot-builder/components -H "Authorization: Bearer $TOKEN"
# List packages
curl -s http://localhost:8000/api/robot-builder/packages -H "Authorization: Bearer $TOKEN"
# List configs
curl -s http://localhost:8000/api/robot-builder/configs -H "Authorization: Bearer $TOKEN"
```

**Step 2: Create a component via API**
```bash
curl -X POST http://localhost:8000/api/robot-builder/components \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dobot CR10 Base",
    "component_type": "robot_arm",
    "description": "6-DOF cinema camera robot arm",
    "specs": {"dof": 6, "payload_kg": 10, "reach_mm": 1525}
  }'
```

**Step 3: Test in web UI**
- Open http://localhost:3000
- Login
- Load "Robot Builder" layout from layout selector
- Verify robot list shows CR10
- Verify config panel loads

**Step 4: Fix any issues** (delegate to `agent__develop`)

### Task 5.2: Test Desktop App

**Step 1: Build desktop app**
```bash
cd /home/samuel/mission-control/packages/desktop
npm run build
```

**Step 2: Launch and test**
```bash
npm run start
```

**Step 3: Verify same robot builder flow works**

**Checkpoint 5:** Robot builder works on web. Desktop builds and launches.

---

## Phase 6: Isaac ROS End-to-End

### Task 6.1: Verify ROS Topic Flow

**Step 1: Check RosBridge is receiving topics**
```bash
curl -s http://localhost:8000/api/ros2/status | python3 -m json.tool
```

**Step 2: List available topics**
```bash
curl -s http://localhost:8000/api/ros2/topics | python3 -m json.tool
```

**Step 3: Verify frontend ROS connection**
- Open http://localhost:3000
- Check TopBar data source indicator (should show "Live" or "Connecting")
- Load "3D Monitoring" layout
- Check if 3D viewport renders

### Task 6.2: Create Stub Robot Driver

**Files:**
- Create: `backend/services/stub_robot_driver.py`

```python
"""
Stub robot driver for CR10.
Accepts joint commands, returns fake encoder feedback.
Used for end-to-end testing without real hardware.
"""
import asyncio
import math
import time
from dataclasses import dataclass, field

@dataclass
class StubJointState:
    positions: list[float] = field(default_factory=lambda: [0.0] * 6)
    velocities: list[float] = field(default_factory=lambda: [0.0] * 6)
    timestamp: float = 0.0

class StubRobotDriver:
    """Simulates CR10 robot responses for development/testing."""

    def __init__(self):
        self.state = StubJointState()
        self.connected = False
        self.target_positions: list[float] | None = None
        self._move_rate = 0.5  # rad/s simulated movement speed

    async def connect(self) -> bool:
        """Simulate connection to 192.168.5.1."""
        await asyncio.sleep(0.1)  # Simulate network delay
        self.connected = True
        self.state.timestamp = time.time()
        return True

    async def disconnect(self):
        self.connected = False

    async def get_joint_positions(self) -> list[float]:
        """Return current (simulated) joint positions."""
        if self.target_positions:
            # Simulate gradual movement toward target
            dt = 0.01
            for i in range(6):
                diff = self.target_positions[i] - self.state.positions[i]
                step = min(abs(diff), self._move_rate * dt)
                self.state.positions[i] += math.copysign(step, diff)
            # Check if reached target
            if all(
                abs(self.target_positions[i] - self.state.positions[i]) < 0.001
                for i in range(6)
            ):
                self.target_positions = None
        self.state.timestamp = time.time()
        return list(self.state.positions)

    async def send_joint_command(self, positions: list[float]) -> bool:
        """Accept joint position command."""
        if len(positions) != 6:
            return False
        self.target_positions = list(positions)
        return True

    async def get_status(self) -> dict:
        return {
            "connected": self.connected,
            "mode": "stub",
            "positions": self.state.positions,
            "timestamp": self.state.timestamp,
            "ip": "192.168.5.1 (stubbed)",
        }

# Singleton for backend use
stub_driver = StubRobotDriver()
```

**Step 3: Wire stub into robot-real API** (delegate to `agent__develop`)
- Add endpoints: `GET /api/robot/stub/status`, `POST /api/robot/stub/command`

**Step 4: Verify loop**
- Isaac Sim publishes joint_states → RosBridge → Frontend 3D viewport
- Frontend sends command → stub driver responds

**Checkpoint 6:** Sim data visible in frontend. Stub driver accepting commands.

---

## Phase 7: UI Overhaul — Foxglove Parity

### Task 7.1: Remove Sidebar, Add Workspace Tabs

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/components/TopBar.tsx`
- Delete import: Sidebar from App.tsx (Sidebar.tsx is not imported in App.tsx currently — it's a standalone component)
- Modify: `packages/web/src/stores/navStore.ts` — repurpose or remove
- Modify: `packages/web/src/layouts/defaults.ts` — add workspace mode presets

**Step 1: Update navStore to workspace mode model**

Modify: `packages/web/src/stores/navStore.ts`

```typescript
import { create } from 'zustand';

export type WorkspaceMode =
  | 'build'
  | 'scene'
  | 'motion'
  | 'simulate'
  | 'deploy'
  | 'monitor';

interface NavState {
  activeMode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
}

export const useNavStore = create<NavState>((set) => ({
  activeMode: 'monitor',
  setMode: (mode) => set({ activeMode: mode }),
}));
```

**Step 2: Add workspace mode tabs to TopBar**

The TopBar already has: brand, layout selector, +Panel, data source, user menu.
Add workspace mode tabs between brand and layout selector.

Modify: `packages/web/src/components/TopBar.tsx` — add after brand span (line 61):

```tsx
{/* Workspace Mode Tabs */}
{(['build', 'scene', 'motion', 'simulate', 'deploy', 'monitor'] as const).map((mode) => (
  <button
    key={mode}
    onClick={() => {
      useNavStore.getState().setMode(mode);
      // Load corresponding default layout
      const layoutId = WORKSPACE_LAYOUT_MAP[mode];
      if (layoutId) loadLayout(layoutId);
    }}
    style={{
      padding: '4px 12px',
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      color: activeMode === mode ? 'var(--accent)' : 'var(--text-secondary)',
      background: activeMode === mode ? 'var(--accent-dim)' : 'transparent',
      border: 'none',
      borderBottom: activeMode === mode ? '2px solid var(--accent)' : '2px solid transparent',
      cursor: 'pointer',
      height: '100%',
    }}
  >
    {mode}
  </button>
))}
```

**Step 3: Define workspace layout presets**

Modify: `packages/web/src/layouts/defaults.ts` — replace with 6 workspace presets:

| Mode | Panels |
|------|--------|
| Build | robot-list + robot-config + viewport3d + properties |
| Scene | viewport3d + displays + scene-hierarchy (new) + properties |
| Motion | viewport3d + pipeline-builder + plot + log-viewer |
| Simulate | viewport3d + robot-isaac + diagnostics + raw-messages |
| Deploy | fleet-status + robot-real + agent-monitor + log-viewer |
| Monitor | overview + fleet-status + diagnostics + agent-monitor |

**Step 4: Remove Sidebar references**

Verify App.tsx doesn't import Sidebar (it doesn't currently — good).
The Sidebar component file can remain but won't be used.

**Step 5: Verify TopBar has context menu support**

Add right-click handler to panel chrome in Layout.tsx for context menus.

### Task 7.2: Update Default Layouts

**Files:**
- Modify: `packages/web/src/layouts/defaults.ts`

Replace `DEFAULT_LAYOUTS` array with the 6 workspace mode layouts. Each layout is a MosaicNode tree with appropriate panels. (Delegate full implementation to `agent__develop`.)

### Task 7.3: Add Context Menus to Panels

**Files:**
- Modify: `packages/web/src/components/Layout.tsx`

Add `onContextMenu` handler to each MosaicWindow that shows panel-specific options:
- Topic selection (for ROS panels)
- Display settings
- Split horizontal / Split vertical
- Close panel
- Maximize / Restore

(Delegate to `agent__develop`)

### Task 7.4: Diagnostics Panel — Foxglove Parity

**Files:**
- Modify: `packages/web/src/panels/Diagnostics/DiagnosticsPanel.tsx`

Ensure it covers:
- Topic message rates (Hz)
- Message latency
- Connection health per topic
- Subscriber/publisher counts
- Error/warning aggregation from `/diagnostics` topic

Verify existing implementation, enhance if needed. (Delegate to `agent__develop`)

**Checkpoint 7:** Sidebar gone. Top workspace tabs working. 6 mode layouts load correctly. Context menus on panels. Diagnostics panel has Foxglove parity.

---

## Phase 8: Full Feature Test

### Task 8.1: Comprehensive Test Suite

**Step 1: Test each workspace mode**

For each of the 6 modes, load the layout and verify:
- All panels render without errors
- API calls succeed (check browser Network tab)
- ROS data flows (if applicable)
- Panel interactions work (click, configure, drag)

**Step 2: Test workflow execution**
- Create pipeline in Pipeline Builder
- Execute locally → verify results
- Execute via OSMO → verify results

**Step 3: Test agent delegation**
```bash
# Real tasks for each agent type
agent__develop: "Write a Python function that validates a URDF file"
agent__research: "What are the joint limits for Dobot CR10?"
agent__sysadmin: "Check docker container status on workstation"
agent__monitor: "Report fleet health"
```

**Step 4: Test desktop app**
- Build: `cd packages/desktop && npm run build`
- Launch and verify all workspace modes work

**Step 5: Generate pass/fail report**

Create: `docs/reports/2026-03-03-platform-audit-results.md`

### Task 8.2: Update Project State

**Files:**
- Modify: `state/project_state.json`
- Append: `state/decisions_log.md`

Update with:
- New session number
- All objectives progress updated
- Known issues updated
- Next sprint scope defined

**Checkpoint 8:** Full platform status documented. All known issues cataloged. Next sprint defined.

---

## Execution Notes

- **Delegate to agents:** All code implementation goes to `agent__develop`. Research to `agent__research`. Infra ops to `agent__sysadmin`.
- **Commit after each phase** with descriptive message.
- **Stop at each checkpoint** — verify before proceeding.
- **If a phase fails:** Fix before moving on. Do not skip.
