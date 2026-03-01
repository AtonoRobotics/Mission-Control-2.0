# Mission Control
**Cinema Robot Digital Twin — Infrastructure & Observability Platform**

Single web-based operations center for the Isaac robotics stack.
Manages Isaac Sim, Isaac Lab, Isaac ROS, nvblox, cuRobo, ZED X sensors,
robot builds, scene construction, training workflows, and ROS2 observability.

## Stack
- **Backend:** FastAPI + Python 3.11 + uv
- **Frontend:** React + TypeScript + pnpm
- **Database:** PostgreSQL 16
- **ROS2:** Inside Isaac ROS Docker containers only (never local)
- **Orchestration:** Claude Code + MCP/Autogen agents

## Quick Start
1. Copy `.env.machines.example` to `.env.machines` and fill in your values
2. `docker compose up postgres` — start the database
3. `cd backend && uv sync && uv run alembic upgrade head` — run migrations
4. `uv run uvicorn main:app --reload` — start backend
5. `cd frontend && pnpm install && pnpm dev` — start frontend

## Documentation
- [Full Specification](docs/SPEC.md)
- [Claude Code Orchestration Rules](docs/CLAUDE.md)
- [Agent System Prompts](docs/AGENT_PROMPTS.md)

## Data Integrity Rule
All configs, scripts, URDFs, and database records contain only empirically verified values.
Missing values are NULL with a warning. No placeholders. No estimates. No defaults.
