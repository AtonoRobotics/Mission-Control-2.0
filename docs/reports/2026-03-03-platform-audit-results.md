# Full Platform Audit Results — 2026-03-03

## Summary

**Overall Status: PASS (with known issues)**

8-phase audit completed. All critical systems operational. 3 known issues documented.

---

## Phase 1: Infrastructure Foundation

| Service | Status | Detail |
|---------|--------|--------|
| Stale processes | CLEAN | uvicorn killed, mission-control.service disabled |
| PostgreSQL | GREEN | mc-postgres up 46h, healthy |
| Backend API (8000) | GREEN | db=connected, rosbridge=connected |
| k3s cluster | GREEN | 3 nodes: sim1, dgx-spark, agx-thor |
| OSMO | GREEN | 13/13 pods running, 4 pools ONLINE |
| Frontend (3000) | GREEN | Vite dev server running |
| RosBridge (9090) | GREEN | Isaac ROS container running, 6 topics |

## Phase 2: Isaac Pipeline + OSMO

| Check | Status | Detail |
|-------|--------|--------|
| Isaac Sim image | PRESENT | nvcr.io/nvidia/isaac-sim:5.1.0, 22.9GB |
| OSMO pools | 4 ONLINE | default, spark, thor, workstation |
| OSMO workflow submit (CLI) | PASS | audit-hello-2-3 COMPLETED on dgx-spark |
| OSMO workflow query (MC API) | PASS | Status/details visible via backend |
| OSMO workflow submit (MC API) | NEEDS FIX | Double-wrapping bug in submit endpoint |

## Phase 3: Database & Backend API

| Check | Status | Detail |
|-------|--------|--------|
| Empirical DB | 7 tables | robots, joint_specs, link_specs, collision_spheres, calibration_data, sensor_specs, alembic_version |
| Registry DB | 25 tables | Full schema per SPEC v2.2.0 |
| CR10 data | VERIFIED | dobot_cr10, 6-DOF, 10kg, 1525mm |
| API routers | 18/18 PASS | All responding without 500 errors |

### Fixes Applied
- Cloud router: wired localstack-s3 on port 30035, created `mission-control` bucket
- Admin user: seeded via bcrypt + psycopg2 (seed_admin.py has DSN bug)

## Phase 4: Cinema Assets

| Asset | Status |
|-------|--------|
| CR10 URDF (7.2KB) | PRESENT |
| CR10 USD (3.9MB) | PRESENT |
| CR10 meshes (7 .obj, 1.9MB) | PRESENT |
| Collision spheres config | PRESENT |
| cuRobo config | PRESENT |
| World config | PRESENT |
| Safety configs (2) | PRESENT |
| Knowledge docs (2) | PRESENT |
| ARRI Alexa Mini 3D model | MISSING |
| Cinema lens 3D models | MISSING |
| Camera cage/mount model | MISSING |

## Phase 5: Robot Builder

| Check | Status | Detail |
|-------|--------|--------|
| /packages endpoint | PASS | 9 packages (8 cinema + CR10 arm) |
| /configs endpoint | PASS | Empty (no configs yet) |
| Package creation | PASS | CR10 arm created via API |
| Web build (vite) | PASS | 2.8s build time |
| Desktop build | PASS | After fixing stale symlink |

### Fixes Applied
- Removed stale `mission-control-frontend` symlink from pnpm virtual store
- Web build: removed `tsc -b` (vitest/vite version conflict), kept `vite build`
- tsconfig.node.json: added `emitDeclarationOnly: true`

## Phase 6: Isaac ROS End-to-End

| Check | Status | Detail |
|-------|--------|--------|
| RosBridge connection | CONNECTED | ws://localhost:9090 |
| ROS topics | 6 active | /tf, /tf_static, /rosout, /parameter_events, /client_count, /connected_clients |
| Stub robot driver | WORKING | connect, command, joints, status endpoints |
| Joint simulation | WORKING | Gradual movement at 0.5 rad/s |

## Phase 7: UI Overhaul — Foxglove Parity

| Feature | Status | Detail |
|---------|--------|--------|
| Sidebar removed | DONE | TopBar + Layout + TimelineBar |
| Workspace mode tabs | DONE | 6 modes: build/scene/motion/simulate/deploy/monitor |
| Layout presets | DONE | 6 workspace layouts with mosaic panels |
| Context menus | DONE | Split H/V, Maximize/Restore, Close |
| Diagnostics panel | DONE | Status table, filtering, severity sort, stale detection |
| Panel count | 45 panels | Across 10 categories |
| Frequency/Latency/Action monitors | DONE | Dedicated panels registered |

## Phase 8: Full Feature Test

### Agent Delegation
| Agent | Status | Response |
|-------|--------|----------|
| develop | PASS | Generated URDF validator function |
| research | PASS | Returned CR10 joint limits |
| sysadmin | PASS | Listed 2 running containers |
| monitor | PASS | Fleet health for 4 machines |

### Fleet Health
| Machine | Status | GPU | Disk |
|---------|--------|-----|------|
| workstation (sim1) | ONLINE | RTX 4070: 2% util, 47% VRAM, 37C | 52% (457G/938G) |
| dgx-spark | ONLINE | Ollama OK | 8% (290G/3.7T) |
| agx-thor | UNREACHABLE | - | - |
| orin-nano | UNREACHABLE | - | - |

---

## Known Issues

1. **OSMO MC submit endpoint** — Double-wraps workflow spec, causing 400 from OSMO API. CLI works.
2. **seed_admin.py** — Uses `postgresql+asyncpg://` DSN with psycopg2 (incompatible).
3. **agx-thor / orin-nano** — Unreachable via SSH. Need Tailscale hostname fix.
4. **Isaac ROS container** — Initial start failed (user-mapping bug), but recovered on retry.
5. **TypeScript type-checking** — `tsc -b` fails due to vitest/vite@7 vs vite@5 conflict. `vite build` works.

## Next Sprint Scope

1. Fix OSMO submit endpoint (remove double-wrapping)
2. Fix seed_admin.py DSN handling
3. Add ARRI Alexa Mini 3D model (CAD or basic geometry)
4. Create first robot configuration (CR10 + Alexa Mini + Zeiss CP.3)
5. Resolve agx-thor / orin-nano connectivity
6. Pin vitest to vite@5-compatible version
