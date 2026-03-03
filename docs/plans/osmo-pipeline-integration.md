# OSMO Pipeline Integration Plan
**Status:** Draft — pending Isaac Sim OSMO workflow validation
**Depends on:** isaac-sim-test-3 workflow completing successfully

## Goal
Replace docker exec pattern in workflow nodes with OSMO job submission for batch workloads.
Keep Docker/systemd for long-running services (Isaac ROS, backend, postgres).

## OSMO Batch Workloads
| Pipeline | Image | Pool | Notes |
|----------|-------|------|-------|
| Isaac Sim (scene, render, convert) | nvcr.io/nvidia/isaac-sim:5.1.0 | workstation | 22.9GB, GPU required |
| Isaac Lab (RL training, eval) | isaac-lab-curobo:latest | workstation/spark | 61.6GB, GPU required |
| GR00T (model training) | TBD | spark | Needs GR00T N1.6 container |
| Cosmos (world model) | TBD | spark | Needs Cosmos container |

## Docker Long-Running Services (unchanged)
- Isaac ROS (rosbridge, ROS2 nodes, sensor pipelines)
- Mission Control backend (FastAPI)
- PostgreSQL

## Implementation Phases

### Phase 1: OSMO Service Layer
- Create `backend/services/osmo_client.py` — submit, query, cancel, logs
- Wrap OSMO CLI or use OSMO REST API directly (quick-start endpoint)
- Handle async job lifecycle: PENDING → INITIALIZING → RUNNING → COMPLETED/FAILED

### Phase 2: Update sim.* Workflow Nodes
- Replace `docker exec` with OSMO workflow submission
- Each sim node submits a workflow YAML with the appropriate script
- Nodes poll/await completion and parse output
- Workflow templates stored in `deploy/osmo/`

### Phase 3: Implement lab.* Workflow Nodes (currently stubs)
- `lab.set_env` — submit OSMO workflow with Isaac Lab env config
- `lab.set_training_params` — configure RL training params
- `lab.trigger_run` — submit training workflow
- `lab.monitor_run` — poll OSMO workflow status
- `lab.stop_run` — cancel OSMO workflow
- `lab.export_checkpoint` — retrieve artifacts from completed workflow

### Phase 4: OSMO Workflow Templates
- `deploy/osmo/isaac-sim.yaml` — base sim template (exists)
- `deploy/osmo/isaac-lab-train.yaml` — RL training template
- `deploy/osmo/isaac-lab-eval.yaml` — evaluation template
- `deploy/osmo/urdf-to-usd.yaml` — conversion job
- `deploy/osmo/data-gen.yaml` — synthetic data generation

### Phase 5: API + UI
- `backend/api/osmo.py` — already exists, enhance with job submission/status
- Frontend workflow builder — OSMO job status panel
- Pool/resource visibility in Infra page

## Open Questions
- Does OSMO support volume mounts from host for registry files?
- Can OSMO stream logs in realtime (for monitor_run)?
- OSMO env var injection — confirmed via `--set-env` CLI flag
- Image pull policy — can containerd reuse Docker-cached images? (likely no)
- Job timeout handling — what happens on GPU OOM or hang?

## Blockers
- [ ] Isaac Sim OSMO workflow must complete successfully first
- [ ] Isaac Lab image needs to be pushed to a registry OSMO can pull from
- [ ] Determine OSMO REST API vs CLI for programmatic access
