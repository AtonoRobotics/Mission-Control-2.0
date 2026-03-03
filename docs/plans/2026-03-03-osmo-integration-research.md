# NVIDIA OSMO Integration — Research & Architecture Spec
**Date:** 2026-03-03
**Status:** Spike complete — OSMO v6.0.0 deployed on k3s, hello-world workflow verified
**Author:** Samuel + Claude
**OSMO Version:** Open-source (Apache 2.0) — [GitHub](https://github.com/NVIDIA/OSMO)

---

## 1. Executive Summary

NVIDIA OSMO is a cloud-native workflow orchestration platform for Physical AI. It uses
declarative YAML to define multi-stage pipelines (SDG → training → eval → deploy) and
executes them across heterogeneous Kubernetes clusters. It was built internally at NVIDIA
for GR00T and Isaac Lab, now open-sourced.

**Proposal:** Deploy k3s across our 4-machine fleet, install OSMO on top, and integrate it
as the headless compute backend behind Mission Control's UI. Mission Control keeps ownership
of the live operations layer (fleet monitoring, digital twin sync, ROS2 observability).
OSMO takes over the development/training pipeline layer (SDG, RL, model training, evaluation).

---

## 2. Why OSMO

### Problems It Solves For Us

| Problem Today | OSMO Solution |
|---|---|
| Workflow engine node handlers are mostly stubs | OSMO provides a battle-tested executor for compute-heavy pipeline stages |
| Ad-hoc job dispatch via SSH + agents | k8s + OSMO automatically schedules to the right hardware |
| No data lineage or artifact versioning | Content-addressable storage with dedup and audit trails |
| Pipeline templates exist only as Python dicts | YAML-defined, version-controlled, portable workflows |
| No GPU-aware scheduling across fleet | k8s GPU operator + OSMO topology-aware scheduling |
| Manual container management via systemd | k8s manages container lifecycle, restarts, resource limits |
| Autonomous orchestrator daemon doesn't exist yet | OSMO replaces the need for our custom event queue daemon |

### What OSMO Does NOT Replace

| Mission Control Layer | Keep As-Is |
|---|---|
| React UI (Workflow Builder, 3D Viewer, etc.) | MC frontend remains the user interface |
| ROS2 observability (rosbridge, topic viz) | Real-time, not batch — outside OSMO scope |
| Digital twin sync (Isaac Sim ↔ real robot) | Live operations, not pipeline orchestration |
| Fleet health monitoring | MC compute monitor + agent__monitor stay |
| MCP agent dispatch (develop, research, etc.) | Developer tools, not compute pipelines |
| Safety system (safety_enforcer.py) | Never delegated to external orchestrators |
| Empirical DB / file registry | MC's data integrity layer — OSMO storage is additive |
| Build processes (URDF, configs, launch files) | Config generation agents stay; OSMO orchestrates when they run |

---

## 3. Architecture — Proposed

```
┌─────────────────────────────────────────────────────────────┐
│                    MISSION CONTROL UI                        │
│              (React — Workflow Builder page)                 │
│                                                             │
│  Workflow canvas → pipeline template → OSMO YAML → submit  │
└─────────────────────┬───────────────────────────────────────┘
                      │ REST API
┌─────────────────────▼───────────────────────────────────────┐
│               MISSION CONTROL BACKEND                        │
│                    (FastAPI)                                 │
│                                                             │
│  /api/pipelines  ←→  OSMO Client SDK  ←→  OSMO API         │
│  /api/workflows  ←→  (submit, status, cancel, logs)        │
│  /api/compute    ←→  k8s metrics API                        │
└─────────────────────┬───────────────────────────────────────┘
                      │ k8s API / OSMO gRPC
┌─────────────────────▼───────────────────────────────────────┐
│                    OSMO CONTROL PLANE                         │
│              (runs on k3s server node)                       │
│                                                             │
│  Workflow scheduler │ Dataset manager │ Resource pools       │
│  Data lineage       │ Smart storage   │ Credential vault     │
└──────┬──────────────┬─────────────────┬─────────────────────┘
       │              │                 │
  ┌────▼────┐   ┌────▼────┐      ┌────▼────┐
  │workstation│  │DGX Spark│      │AGX Thor │
  │(k3s agent)│  │(k3s agt)│      │(k3s agt)│
  │RTX 4070  │  │128GB    │      │Jetson   │
  │sim, dev  │  │train,inf│      │edge,HIL │
  └──────────┘  └─────────┘      └─────────┘
```

### Layer Responsibilities

| Layer | Owner | Responsibility |
|---|---|---|
| UI | Mission Control React | Visual workflow builder, monitoring dashboards, user interaction |
| API Gateway | Mission Control FastAPI | Auth, routing, translates MC pipeline model → OSMO YAML |
| Orchestration | OSMO | Workflow execution, compute scheduling, data lineage, storage |
| Compute | k3s cluster | Container lifecycle, GPU allocation, networking, volumes |
| Operations | Mission Control | ROS2 viz, fleet monitoring, digital twin, safety — unchanged |

---

## 4. k3s Cluster Design

### Topology

| Machine | k3s Role | GPU | OSMO Pool Role | Notes |
|---|---|---|---|---|
| **workstation** | Server (control plane) + agent | RTX 4070 (12GB) | `sim-pool` | Runs OSMO control plane + simulation workloads |
| **dgx-spark** | Agent | 128GB unified | `train-pool` | Primary training, inference, large model work |
| **agx-thor** | Agent | Jetson 60GB | `edge-pool` | Hardware-in-the-loop testing, edge deployment |
| **orin-nano** | Agent (future) | Jetson 8GB | `edge-pool` | Lightweight edge deployment validation |

### Prerequisites

- **k3s server on workstation:** Single binary install, ~500MB RAM overhead
- **k3s agents on remote machines:** Join token from server, auto-register
- **NVIDIA GPU Operator:** Exposes GPUs as schedulable k8s resources
- **Network:** All machines must reach workstation:6443 (k8s API). Tailscale already connects them.
- **Storage:** Shared S3-compatible storage (MinIO on workstation) or NFS for OSMO datasets

### Installation Sequence

```
Phase 1 — k3s foundation
  1. Install k3s server on workstation (--disable traefik, --disable servicelb)
  2. Install NVIDIA GPU Operator on workstation node
  3. Verify: kubectl get nodes, nvidia-smi inside test pod
  4. Install k3s agent on dgx-spark, join cluster
  5. Install GPU Operator on dgx-spark node
  6. Verify: both nodes visible, GPUs schedulable

Phase 2 — OSMO deployment
  7. Deploy OSMO control plane on k3s (Helm chart or manifests)
  8. Configure OSMO pools: sim-pool (workstation), train-pool (dgx-spark)
  9. Configure OSMO storage backend (MinIO or local PV)
  10. Submit test workflow: hello-world container on each pool
  11. Verify: osmo workflow status shows completion

Phase 3 — Isaac integration
  12. Pull Isaac Sim container to workstation node
  13. Pull Isaac Lab + training containers to dgx-spark node
  14. Create OSMO workflow: simple Isaac Sim SDG task
  15. Submit and verify synthetic data output
  16. Create OSMO workflow: Isaac Lab RL training task
  17. Verify training checkpoint produced

Phase 4 — Mission Control integration
  18. Add OSMO client SDK to MC backend dependencies
  19. Create /api/osmo/ routes (submit, status, cancel, logs)
  20. Wire Workflow Builder UI to submit OSMO workflows
  21. Wire Compute Monitor to show OSMO job status + k8s metrics
  22. Migrate pipeline_templates.py → OSMO YAML files

Phase 5 — AGX Thor + edge
  23. Set up k3s agent on agx-thor (ARM — aarch64)
  24. Add to edge-pool in OSMO
  25. Test hardware-in-the-loop workflow
```

---

## 5. Workflow Mapping — Current → OSMO

### Current Pipeline Templates (pipeline_templates.py)

Our 4 pipeline templates map directly to OSMO workflows:

#### groot_manipulation → `groot_manipulation.yaml`
```yaml
# Conceptual — actual OSMO YAML format TBD after installation
workflow:
  name: groot-manipulation
  tasks:
    - name: scene-compose
      image: nvcr.io/nvidia/isaac-sim:5.1.0
      pool: sim-pool
      outputs: [scene.usd]

    - name: demo-recording
      image: nvcr.io/nvidia/isaac-sim:5.1.0
      pool: sim-pool
      inputs: [{task: scene-compose, artifact: scene.usd}]
      outputs: [demos.hdf5]

    - name: groot-mimic-augment
      image: nvcr.io/nvidia/groot:latest
      pool: train-pool
      resources: {gpu: 1}
      inputs: [{task: demo-recording, artifact: demos.hdf5}]
      outputs: [augmented_demos.hdf5]

    - name: cosmos-transfer
      image: nvcr.io/nvidia/cosmos:latest
      pool: train-pool
      resources: {gpu: 1}
      inputs: [{task: groot-mimic-augment, artifact: augmented_demos.hdf5}]
      outputs: [photorealistic_demos.hdf5]

    - name: fine-tune
      image: nvcr.io/nvidia/pytorch:latest
      pool: train-pool
      resources: {gpu: 1}
      inputs: [{task: cosmos-transfer, artifact: photorealistic_demos.hdf5}]
      outputs: [checkpoint.pt]

    - name: arena-eval
      image: nvcr.io/nvidia/isaac-lab:latest
      pool: sim-pool
      inputs: [{task: fine-tune, artifact: checkpoint.pt}]
      outputs: [eval_report.json]
```

#### rl_locomotion → `rl_locomotion.yaml`
```yaml
workflow:
  name: rl-locomotion
  tasks:
    - name: scene-compose
      image: nvcr.io/nvidia/isaac-sim:5.1.0
      pool: sim-pool
      outputs: [scene.usd]

    - name: isaac-lab-training
      image: isaac-lab-curobo:latest
      pool: train-pool
      resources: {gpu: 1}
      params: {algorithm: PPO, iterations: 1000}
      inputs: [{task: scene-compose, artifact: scene.usd}]
      outputs: [checkpoint.pt]

    - name: evaluation
      image: isaac-lab-curobo:latest
      pool: sim-pool
      inputs: [{task: isaac-lab-training, artifact: checkpoint.pt}]
      outputs: [eval_report.json]
```

#### cinema_motion → `cinema_motion.yaml`
```yaml
workflow:
  name: cinema-motion-validation
  tasks:
    - name: trajectory-import
      image: mission-control-tools:latest
      pool: sim-pool
      params: {robot_id: dobot_cr10}
      outputs: [trajectory.json]

    - name: curobo-validate
      image: isaac-lab-curobo:latest
      pool: sim-pool
      inputs: [{task: trajectory-import, artifact: trajectory.json}]
      outputs: [validation_report.json]

    - name: isaac-sim-replay
      image: nvcr.io/nvidia/isaac-sim:5.1.0
      pool: sim-pool
      inputs:
        - {task: trajectory-import, artifact: trajectory.json}
        - {task: curobo-validate, artifact: validation_report.json}
      outputs: [replay_video.mp4, sim_telemetry.json]
```

---

## 6. Mission Control Backend Integration

### New API Routes — `/api/osmo/`

```
POST   /api/osmo/workflows          → Submit OSMO workflow (from template or custom YAML)
GET    /api/osmo/workflows           → List active/completed workflows
GET    /api/osmo/workflows/{id}      → Workflow status + per-task results
DELETE /api/osmo/workflows/{id}      → Cancel running workflow
GET    /api/osmo/workflows/{id}/logs → Stream task logs

GET    /api/osmo/pools               → List compute pools + available resources
GET    /api/osmo/pools/{name}/nodes  → Nodes in pool + GPU utilization

GET    /api/osmo/datasets            → List OSMO-managed datasets
GET    /api/osmo/datasets/{id}       → Dataset metadata + lineage graph
```

### Backend Service Layer

```python
# backend/services/osmo_service.py (new)
class OsmoService:
    """Bridge between Mission Control and OSMO API."""

    async def submit_workflow(self, template_id: str, params: dict) -> str:
        """Convert MC pipeline template → OSMO YAML, submit to OSMO."""
        ...

    async def get_workflow_status(self, workflow_id: str) -> WorkflowStatus:
        """Poll OSMO for workflow + per-task status."""
        ...

    async def cancel_workflow(self, workflow_id: str) -> bool:
        """Cancel a running OSMO workflow."""
        ...

    async def stream_logs(self, workflow_id: str, task_name: str):
        """Stream logs from a specific OSMO task."""
        ...

    async def list_pools(self) -> list[PoolInfo]:
        """Get compute pool status from OSMO."""
        ...

    async def get_dataset_lineage(self, dataset_id: str) -> LineageGraph:
        """Retrieve dataset provenance from OSMO smart storage."""
        ...
```

### Impact on Existing Code

| File | Change |
|---|---|
| `backend/services/pipeline_templates.py` | Keep as source-of-truth for template definitions; add `to_osmo_yaml()` export method |
| `backend/api/pipelines.py` | `POST /pipelines` now calls `osmo_service.submit_workflow()` instead of `WorkflowExecutor` |
| `backend/api/workflows.py` | Keep for legacy; new runs route through OSMO |
| `backend/workflow_engine/executor.py` | Deprecated for compute-heavy workflows; kept for lightweight local-only workflows |
| `backend/api/compute.py` | Augment with k8s metrics from OSMO pools |
| `docker-compose.yml` | Isaac containers move to k8s; docker-compose keeps only postgres + rosbridge |

---

## 7. Storage Architecture

### Current (PostgreSQL + filesystem)
```
PostgreSQL (empirical DB + registry DB)
    ↓
File Registry (URDF, USD, YAML, launch files)
    ↓
Local filesystem (/home/samuel/mission-control/registry/*)
```

### Proposed (add OSMO layer)
```
PostgreSQL (empirical DB + registry DB)     ← unchanged, MC owns
    ↓
File Registry (config artifacts)             ← unchanged, MC owns
    ↓
OSMO Smart Storage (training data, checkpoints, SDG outputs)  ← NEW
    ↓
MinIO S3 (on workstation) or shared NFS      ← NEW, backing store
```

**Key distinction:** MC's file registry handles configuration artifacts (URDF, YAML, launch files).
OSMO's smart storage handles pipeline artifacts (datasets, checkpoints, eval reports, SDG output).
No overlap — complementary systems.

---

## 8. Impact on Agent Architecture

### Agents That Stay Unchanged
- `agent__develop` — Code generation, still useful for dev tasks
- `agent__research` — Documentation lookup
- `agent__sysadmin` — Now also manages k3s cluster via kubectl
- `agent__monitor` — Augmented with k8s/OSMO status checks

### Agents That Get OSMO Equivalents
- `agent__simulate` → OSMO `sim-pool` workflows replace ad-hoc sim dispatch
- `agent__groot` → OSMO `train-pool` workflows replace manual training dispatch
- `agent__cosmos` → OSMO `train-pool` workflows for Cosmos Transfer

These agents don't disappear — they become **OSMO workflow authors**. Instead of directly
running sim/training tasks, they generate OSMO YAML and submit it. The agent's value shifts
from "execute this task" to "design the right workflow for this task."

### agent__fleet Evolution
Currently: SSH commands across machines.
Future: `kubectl` commands + `osmo` CLI. Fleet management becomes k8s-native.

---

## 9. Network & Security Considerations

| Concern | Approach |
|---|---|
| k8s API access | k3s server on workstation, agents join via Tailscale IPs |
| OSMO credentials | OSMO credential vault for NGC container pulls, S3 access |
| Container registry | Pull from nvcr.io/nvidia (public) + local registry for custom images |
| Inter-node networking | Tailscale mesh already connects all machines; k3s uses Flannel CNI |
| Firewall | workstation:6443 (k8s API), 10250 (kubelet), 8472/UDP (Flannel VXLAN) |
| GPU isolation | k8s resource limits prevent job starvation; NVIDIA GPU Operator handles device plugin |

---

## 10. Migration Strategy

### Phase 1 — Parallel Operation (recommended start)
- k3s + OSMO running alongside existing docker-compose + systemd
- MC backend can dispatch to either: existing workflow engine OR OSMO
- Feature flag: `OSMO_ENABLED=true` in backend config
- No breaking changes to existing functionality

### Phase 2 — OSMO Primary
- New pipeline runs go through OSMO by default
- Existing workflow engine handles only non-compute workflows (notifications, conditions)
- Isaac containers managed by k8s, not docker-compose

### Phase 3 — Full Migration
- docker-compose reduced to postgres + rosbridge only
- All pipeline execution through OSMO
- Autonomous orchestrator replaced by OSMO scheduled workflows
- agent__fleet uses kubectl exclusively

---

## 11. Open Questions

| # | Question | Impact |
|---|---|---|
| OQ-1 | Does OSMO have a REST/gRPC API, or only CLI? | Determines how MC backend integrates |
| OQ-2 | Can OSMO run on k3s specifically, or does it need full k8s? | k3s is our target; need to verify compatibility |
| OQ-3 | OSMO smart storage — does it need S3, or can it use local PV? | Determines whether we need MinIO |
| OQ-4 | How does OSMO handle ARM nodes (Jetson)? | AGX Thor is aarch64 — cross-arch scheduling |
| OQ-5 | OSMO resource requirements — how heavy is the control plane? | Workstation has 32GB RAM, shared with dev work |
| OQ-6 | Can OSMO workflows be submitted programmatically (Python SDK)? | Critical for MC backend integration |
| OQ-7 | How does OSMO handle workflow failures and retries? | Must align with our validation chain model |
| OQ-8 | Does OSMO support real-time streaming of task logs? | Needed for MC UI to show live pipeline progress |
| OQ-9 | License compatibility with our proprietary MC code? | OSMO is Apache 2.0 — should be fine |
| OQ-10 | How does OSMO interact with existing Docker volumes/networks? | Migration from docker-compose needs clear path |

---

## 12. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| k3s adds operational complexity | Medium | k3s is deliberately minimal; single binary, auto-upgrades |
| OSMO is new/early-stage | Medium | Apache 2.0 — we can fork/patch; parallel operation means fallback exists |
| GPU Operator conflicts with existing NVIDIA drivers | High | Test on workstation first; GPU Operator manages driver lifecycle |
| Workstation overloaded (k3s server + dev + sim) | Medium | k3s server is lightweight (~500MB); can offload control plane later |
| Tailscale latency for k8s API | Low | k8s API is lightweight; Tailscale adds ~1-5ms |
| OSMO doesn't support our workflow patterns | Medium | Phase 1 parallel operation means we can back out |
| Team learning curve for k8s concepts | Medium | k3s + OSMO abstracts most k8s complexity behind YAML |

---

## 13. k3s Spike Results (2026-03-03)

### What Was Done
Installed k3s + NVIDIA GPU Operator on workstation as a single-node cluster. Ran a GPU test
pod to verify end-to-end GPU scheduling works inside Kubernetes.

### Installation Summary

| Component | Version | Status |
|---|---|---|
| k3s | v1.34.4+k3s1 | Running (systemd) |
| Helm | v3.20.0 | Installed |
| NVIDIA GPU Operator | latest (Helm chart) | Deployed, device plugin running |
| GPU Feature Discovery | auto-deployed | Node labeled with full GPU metadata |
| NVIDIA driver | 580.126.09 (host) | Pre-existing, GPU Operator uses it |
| NVIDIA Container Toolkit | 1.19.0-rc.3 (host) | Pre-existing, configured as default k3s runtime |
| CUDA (in-pod) | 13.0 | Verified via nvidia-smi in test pod |

### Key Configuration
- **Containerd template:** `/var/lib/rancher/k3s/agent/etc/containerd/config.toml.tmpl`
  - Sets `default_runtime_name = "nvidia"` so all pods get GPU access
- **k3s flags:** `--disable traefik --disable servicelb` (not needed on-prem)
- **GPU Operator flags:** `driver.enabled=false`, `toolkit.enabled=false` (host already has both)
- **kubectl config:** `~/.kube/config` (copied from `/etc/rancher/k3s/k3s.yaml`)
- **Uninstall:** `k3s-uninstall.sh` (installed at `/usr/local/bin/`)

### Resource Overhead
- k3s processes RSS: **~781 MB**
- System pods (coredns, metrics-server, local-path-provisioner): **3 pods**
- GPU Operator pods: **~6 pods** (device plugin, feature discovery, dcgm-exporter, validators)
- Total cluster memory: ~15.7 GB used (49% of 32GB) — includes non-k3s workloads
- Available for user workloads: **~21 GB RAM + 1x RTX 4070 Super (12GB VRAM)**

### GPU Scheduling — Confirmed Working
```
Node resource: nvidia.com/gpu: 1
GPU: NVIDIA GeForce RTX 4070 Super | 12282 MiB VRAM
Family: Ada Lovelace | Compute 8.9
Test: nvidia/cuda:12.8.0-base-ubuntu24.04 pod with nvidia-smi → SUCCESS
```

### GPU Feature Discovery Labels (auto-applied)
- `nvidia.com/gpu.product: NVIDIA-GeForce-RTX-4070-SUPER`
- `nvidia.com/gpu.memory: 12282`
- `nvidia.com/gpu.family: ada-lovelace`
- `nvidia.com/gpu.count: 1`
- `nvidia.com/cuda.runtime-version.full: 13.0`
- `nvidia.com/cuda.driver-version.full: 580.126.09`

These labels enable OSMO's topology-aware scheduling — workflows can target GPUs by
family, memory, or compute capability.

### Known Issue
- `nvidia-cuda-validator` pod fails with "unsupported display driver / cuda driver combination"
  - Root cause: Driver 580 is very new; validator image bundles older CUDA
  - Impact: **None** — device plugin and feature discovery work correctly
  - Fix: Will resolve when GPU Operator updates its validator image

### Open Questions Answered

| # | Question | Answer |
|---|---|---|
| OQ-2 | Can OSMO run on k3s? | k3s v1.34 provides full k8s API — OSMO should work. Needs verification. |
| OQ-5 | How heavy is the control plane? | k3s + GPU Operator = ~781MB RSS + 9 system pods. Manageable on 32GB workstation. |

---

## 14. OSMO Deployment Results (2026-03-03)

### Deployment Summary
- **OSMO v6.0.0** deployed via Helm quick-start chart on k3s single-node cluster
- **13 pods** running in `osmo` namespace (all core services operational)
- **Pool: default** — ONLINE with 1 GPU (RTX 4070 Super)
- **CLI:** v6.0.0.b8ba4ff91 installed at `/usr/local/bin/osmo`
- **hello-world workflow (hello-osmo-6):** COMPLETED successfully

### Issues Resolved During Deployment
1. **nodeSelector labels** — Chart uses `node_group: service/data/ingress` which can't coexist on single node; commented out in base values.yaml
2. **clientInstallUrl arg** — osmo-service crashed on unrecognized `--client_install_url` arg; set to empty string
3. **Ingress host matching** — Removed `host: quick-start.osmo` from all ingress rules so cross-namespace FQDN requests work
4. **Cross-namespace DNS** — `service_base_url` must use FQDN (`quick-start.osmo.svc.cluster.local`) since workflow pods run in `default` namespace
5. **Backend-operator auth chain** — Created service token + k8s secret manually (config-setup job was blocked by UI)
6. **NGC image pull** — Added NGC API key to workflow config `backend_images.credential.auth`

### Open Issue
- **osmo-ui** intermittently restarts (Next.js startup probe timing); self-recovers after a few cycles
- **config-setup job** fails due to `override_url` field unsupported in v6 API; all config applied manually via API

### Verified Architecture
```
CLI / MC UI → OSMO API (osmo-service:80)
                ↓
          Backend-operator (listener + worker)
                ↓
          k3s pod execution (default namespace)
                ↓
          GPU: nvidia.com/gpu: 1 (RTX 4070 Super)
```

### Resource Usage After OSMO Deployment
- CPU: ~1700m (6% of 24 cores)
- Memory: ~18.5 GiB (57% of 32GB)
- 13 OSMO pods + k3s system pods + GPU Operator pods

---

## 15. Next Steps

1. ~~**k3s spike**~~ — **DONE** (2026-03-03)
2. ~~**OSMO hello-world**~~ — **DONE** (2026-03-03, hello-osmo-6 COMPLETED)
3. **Resolve OQ-1, OQ-3, OQ-6** — Test OSMO API surface, storage backend, Python SDK
4. **Isaac Sim on k8s** — Run Isaac Sim container as k8s pod instead of docker-compose
5. **MC integration prototype** — Add `/api/osmo/` routes, wire to OSMO SDK
6. **Expand cluster** — Add dgx-spark as k3s agent, test cross-node GPU scheduling
7. **GPU workflow** — Submit a workflow requesting `nvidia.com/gpu: 1` (CUDA test)

---

## References

- [NVIDIA OSMO — GitHub](https://github.com/NVIDIA/OSMO)
- [NVIDIA OSMO — Developer Portal](https://developer.nvidia.com/osmo)
- [OSMO User Guide](https://nvidia.github.io/OSMO/main/user_guide/index.html)
- [OSMO + Isaac Sim SDG Blog](https://developer.nvidia.com/blog/build-synthetic-data-pipelines-to-train-smarter-robots-with-nvidia-isaac-sim)
- [OSMO Architecture Blog](https://developer.nvidia.com/blog/scale-ai-enabled-robotics-development-workloads-with-nvidia-osmo/)
- [k3s Documentation](https://docs.k3s.io/)
- [NVIDIA GPU Operator on k3s](https://www.atlantic.net/gpu-server-hosting/how-to-install-k3s-with-nvidia-gpu-operator-on-ubuntu-22-04/)
- [OSMO on NGC](https://catalog.ngc.nvidia.com/orgs/nvidia/teams/osmo/collections/osmo)
