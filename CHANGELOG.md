# Changelog
All notable changes to Mission Control are documented here.
Format: [version] - date, then ### Added / ### Changed / ### Fixed sections.

## [3.1.0] - 2026-03-03
### Fixed
- Migrated all frontend API calls (~60+) from raw `fetch()` to authenticated `api` axios client
  - Affected: robotStore, pipelineStore, sceneStore, componentStore, layoutStore, builderStore
  - Affected: RobotConfigPanel, RobotIsaacPanel, TeamSettings, ProfileSettings, CloudSettings
  - Affected: McapBrowser, BagRecorder, SceneGenerateModal
  - Affected: RegistryPage, InfraPage, WorkflowsPage, RobotsPage, AgentsPage, OverviewPage, FleetPage
  - Root cause: raw `fetch()` bypassed JWT interceptor in `services/api.ts`, causing HTTP 401 on all protected endpoints

### Added
- ARRI Alexa Mini 3D model (parametric OBJ) in `dobot_cr10/meshes/`
  - `alexa_mini.obj` — visual mesh (body, PL mount, top rail, rear connector)
  - `alexa_mini_collision.obj` — bounding box collision mesh
- URDF integration: `alexa_mini` link, `camera_mount` joint, `camera_optical_frame` at sensor plane
- Cinema asset registry updated with Alexa Mini dimensions and mesh paths

## [3.0.0] - 2026-03-01
### Added
- Complete Anthropic best practices enforcement across all layers
- Full CLAUDE.md hierarchy (root + backend/ + prompts/ + evals/ + tests/ + agents/)
- 6 slash commands: build-urdf, run-evals, validate-output, update-hashes, integrity-check, audit-drift
- `.mcp.json` checked in for team-wide MCP server config
- `.claude/settings.json` with pre-approved tool allowlist
- `backend/core/enforcement.py` — runtime best-practice enforcement
- `backend/core/context_budget.py` — per-agent token budget tracking
- `backend/core/compaction.py` — long-horizon context compaction
- `scripts/enforce_practices.py` — comprehensive practice audit script
- `scripts/ci/claude_review.sh` — headless Claude CI review
- `.github/workflows/ci.yml` — full GitHub Actions CI pipeline
- 20 golden eval cases across 5 categories
- Anthropic Skills format for domain skills (cinema_robot_domain, curob_jerk, isaac_pipeline)
- Tool interface modules for all 3 infrastructure agents
- All missing agent prompt files (launch_file, scene_build, sensor_config, usd_conversion)
- `docs/BEST_PRACTICES.md` — authoritative source-cited practice reference
- Sub-agent compaction: summaries ≤ 2000 tokens enforced in output schema

### Changed
- `prompts/modules/core/never_do.md` v2.0.0 — declarative intent, not numbered procedure
- `prompts/agents/validator/checklist.md` v2.0.0 — intent + thinking instruction, not checklist
- `prompts/modules/core/output_schema.md` v2.0.0 — XML tags, confidence scoring rules
- All prompts use XML tag structure per Anthropic prompt engineering docs
- Orchestrator prompt includes task complexity scaling and parallel dispatch rules
- Removed duplicate/malformed directory artifacts from earlier sessions

### Fixed
- `docs/CLAUDE.md` removed (superseded by root CLAUDE.md)
- `orchestrator/CLAUDE.md` removed (superseded by root CLAUDE.md)
- Malformed brace-expansion directory names cleaned up
