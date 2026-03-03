# Foxglove Parity & Multi-Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Mission Control from a page-based web app into a multi-platform panel workspace with Foxglove feature parity, MCAP recording/playback, auth, teams, and cloud storage.

**Architecture:** Phased delivery — each phase is independently deployable. Auth and panel workspace come first (unlock everything else). New panels are added incrementally. MCAP, cloud, and multi-platform follow. Monorepo restructure happens after core features stabilize.

**Tech Stack:** React 18 + TypeScript + Vite 5 + Three.js 0.170 + react-mosaic 6.1 + Zustand 5 + uPlot + @mcap/core + Leaflet | FastAPI + SQLAlchemy + asyncpg + python-jose + passlib + boto3 | Electron 33 | Swift + WKWebView

**Design Doc:** `docs/plans/2026-03-02-foxglove-parity-design.md`

---

## Phase Overview

| Phase | Name | Tasks | Dependencies | Deliverable |
|---|---|---|---|---|
| 1 | Auth & User Management | 1–8 | None | Login, users, teams, RBAC |
| 2 | Panel Workspace | 9–18 | None (parallel with Phase 1) | Full panel-based UI replaces pages |
| 3 | DataSource Abstraction | 19–24 | Phase 2 | Live + recorded data through unified API |
| 4 | Core Panels (Foxglove Parity) | 25–41 | Phase 2 | 17 new panel types |
| 5 | Message Path Syntax | 42–46 | Phase 4 (Plot, Gauge, etc.) | Shared field query language |
| 6 | MCAP Recording & Playback | 47–55 | Phase 3 | Full record/play pipeline |
| 7 | Cloud Storage (S3) | 56–61 | Phase 1, Phase 6 | MCAP upload, config sharing |
| 8 | Team Features | 62–67 | Phase 1, Phase 7 | Shared layouts, recordings, configs |
| 9 | Monorepo Restructure | 68–73 | Phase 2 | packages/core, web, desktop, ios |
| 10 | Desktop App (Electron) | 74–80 | Phase 9 | Native desktop with local file access |
| 11 | iOS App | 81–87 | Phase 9 | Monitoring companion app |
| 12 | Tailscale Integration | 88–92 | Phase 10, Phase 11 | Always-on VPN mesh |

---

## Phase 1: Auth & User Management (Tasks 1–8)

### Task 1: Auth DB tables + Alembic migration

**Files:**
- Modify: `/home/samuel/mission-control/backend/db/registry/models.py`
- Create: `/home/samuel/mission-control/backend/db/registry/migrations/versions/0003_auth_tables.py`
- Test: `/home/samuel/mission-control/backend/tests/db/test_auth_models.py`

**Step 1: Write the failing test**

```python
# tests/db/test_auth_models.py
import pytest
from sqlalchemy import inspect
from backend.db.session import get_registry_engine

@pytest.mark.asyncio
async def test_auth_tables_exist():
    engine = get_registry_engine()
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    assert "users" in tables
    assert "teams" in tables
    assert "sessions" in tables
```

**Step 2: Run test to verify it fails**

Run: `cd /home/samuel/mission-control && python -m pytest backend/tests/db/test_auth_models.py -v`
Expected: FAIL — tables don't exist

**Step 3: Add models to registry/models.py**

Add to `/home/samuel/mission-control/backend/db/registry/models.py`:

```python
class Team(Base):
    __tablename__ = "teams"
    team_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class User(Base):
    __tablename__ = "users"
    user_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    email = Column(String, unique=True, nullable=False)
    display_name = Column(String, nullable=False)
    password_hash = Column(String, nullable=True)  # NULL for OAuth-only
    avatar_url = Column(String, nullable=True)
    auth_provider = Column(String, nullable=False, default="local")
    role = Column(String, nullable=False, default="viewer")
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.team_id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)

class Session(Base):
    __tablename__ = "sessions"
    session_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"))
    token_hash = Column(String(64), nullable=False)
    device = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

**Step 4: Generate and run Alembic migration**

Run: `cd /home/samuel/mission-control/backend && alembic revision --autogenerate -m "add auth tables" && alembic upgrade head`

**Step 5: Run test to verify it passes**

Run: `python -m pytest backend/tests/db/test_auth_models.py -v`
Expected: PASS

**Step 6: Commit**

```bash
git add backend/db/registry/models.py backend/tests/db/test_auth_models.py backend/db/registry/migrations/
git commit -m "feat(auth): add users, teams, sessions tables"
```

---

### Task 2: Auth service — password hashing + JWT

**Files:**
- Create: `/home/samuel/mission-control/backend/services/auth.py`
- Test: `/home/samuel/mission-control/backend/tests/services/test_auth.py`

**Dependencies:** `passlib[bcrypt]`, `python-jose[cryptography]`

**Step 1: Install dependencies**

Run: `cd /home/samuel/mission-control/backend && pip install passlib[bcrypt] python-jose[cryptography]`
Add to `pyproject.toml` dependencies.

**Step 2: Write the failing test**

```python
# tests/services/test_auth.py
import pytest
from backend.services.auth import AuthService

def test_password_hash_and_verify():
    svc = AuthService(secret_key="test-secret")
    hashed = svc.hash_password("mypassword")
    assert svc.verify_password("mypassword", hashed) is True
    assert svc.verify_password("wrongpassword", hashed) is False

def test_create_access_token():
    svc = AuthService(secret_key="test-secret")
    token = svc.create_access_token(user_id="abc-123", role="operator")
    payload = svc.decode_token(token)
    assert payload["sub"] == "abc-123"
    assert payload["role"] == "operator"

def test_create_refresh_token():
    svc = AuthService(secret_key="test-secret")
    token = svc.create_refresh_token(user_id="abc-123")
    payload = svc.decode_token(token)
    assert payload["sub"] == "abc-123"
    assert payload["type"] == "refresh"
```

**Step 3: Run test to verify it fails**

Run: `python -m pytest backend/tests/services/test_auth.py -v`
Expected: FAIL — module not found

**Step 4: Implement AuthService**

```python
# backend/services/auth.py
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import jwt, JWTError

class AuthService:
    def __init__(self, secret_key: str, algorithm: str = "HS256"):
        self.secret_key = secret_key
        self.algorithm = algorithm
        self.pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        self.access_token_expire = timedelta(minutes=15)
        self.refresh_token_expire = timedelta(days=7)

    def hash_password(self, password: str) -> str:
        return self.pwd_context.hash(password)

    def verify_password(self, password: str, hashed: str) -> bool:
        return self.pwd_context.verify(password, hashed)

    def create_access_token(self, user_id: str, role: str) -> str:
        expire = datetime.now(timezone.utc) + self.access_token_expire
        payload = {"sub": user_id, "role": role, "type": "access", "exp": expire}
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

    def create_refresh_token(self, user_id: str) -> str:
        expire = datetime.now(timezone.utc) + self.refresh_token_expire
        payload = {"sub": user_id, "type": "refresh", "exp": expire}
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

    def decode_token(self, token: str) -> dict:
        return jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
```

**Step 5: Run test to verify it passes**

Run: `python -m pytest backend/tests/services/test_auth.py -v`
Expected: PASS

**Step 6: Commit**

```bash
git add backend/services/auth.py backend/tests/services/test_auth.py backend/pyproject.toml
git commit -m "feat(auth): password hashing + JWT token service"
```

---

### Task 3: Auth API router — register, login, refresh, me

**Files:**
- Create: `/home/samuel/mission-control/backend/api/auth.py`
- Modify: `/home/samuel/mission-control/backend/main.py` (add router)
- Test: `/home/samuel/mission-control/backend/tests/api/test_auth.py`

**Step 1: Write the failing test**

```python
# tests/api/test_auth.py
import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app

@pytest.mark.asyncio
async def test_register_user():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/auth/register", json={
            "email": "test@example.com",
            "display_name": "Test User",
            "password": "securepass123"
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "test@example.com"
        assert data["role"] == "viewer"
        assert "password" not in data

@pytest.mark.asyncio
async def test_login():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Register first
        await client.post("/api/auth/register", json={
            "email": "login@example.com",
            "display_name": "Login User",
            "password": "securepass123"
        })
        # Login
        resp = await client.post("/api/auth/login", json={
            "email": "login@example.com",
            "password": "securepass123"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data

@pytest.mark.asyncio
async def test_me_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Register + login
        await client.post("/api/auth/register", json={
            "email": "me@example.com",
            "display_name": "Me User",
            "password": "securepass123"
        })
        login_resp = await client.post("/api/auth/login", json={
            "email": "me@example.com",
            "password": "securepass123"
        })
        token = login_resp.json()["access_token"]
        # Get me
        resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["email"] == "me@example.com"
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/api/test_auth.py -v`
Expected: FAIL — 404

**Step 3: Implement auth router**

Create `/home/samuel/mission-control/backend/api/auth.py` with:
- `POST /register` — create user with hashed password
- `POST /login` — verify credentials, return JWT pair
- `POST /refresh` — exchange refresh token for new access token
- `GET /me` — return current user from JWT
- `POST /logout` — invalidate refresh token

Add `get_current_user` dependency that extracts + validates JWT from Authorization header.

**Step 4: Add router to main.py**

```python
from backend.api.auth import router as auth_router
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
```

**Step 5: Run test to verify it passes**

Run: `python -m pytest backend/tests/api/test_auth.py -v`
Expected: PASS

**Step 6: Commit**

```bash
git add backend/api/auth.py backend/main.py backend/tests/api/test_auth.py
git commit -m "feat(auth): register, login, refresh, me API endpoints"
```

---

### Task 4: RBAC middleware — role-based route protection

**Files:**
- Create: `/home/samuel/mission-control/backend/middleware/auth.py`
- Test: `/home/samuel/mission-control/backend/tests/middleware/test_auth.py`

**Step 1: Write the failing test**

```python
# tests/middleware/test_auth.py
import pytest
from backend.middleware.auth import require_role

def test_require_operator_allows_admin():
    dep = require_role("operator")
    # Mock user with admin role should pass
    assert dep({"role": "admin"}) is None  # no exception

def test_require_operator_allows_operator():
    dep = require_role("operator")
    assert dep({"role": "operator"}) is None

def test_require_operator_blocks_viewer():
    dep = require_role("operator")
    with pytest.raises(Exception):  # HTTPException 403
        dep({"role": "viewer"})

def test_require_admin_blocks_operator():
    dep = require_role("admin")
    with pytest.raises(Exception):
        dep({"role": "operator"})
```

**Step 2: Implement require_role dependency**

```python
# backend/middleware/auth.py
from fastapi import HTTPException, Depends
from backend.api.auth import get_current_user

ROLE_HIERARCHY = {"admin": 3, "operator": 2, "viewer": 1}

def require_role(minimum_role: str):
    def check(current_user=Depends(get_current_user)):
        user_level = ROLE_HIERARCHY.get(current_user["role"], 0)
        required_level = ROLE_HIERARCHY.get(minimum_role, 0)
        if user_level < required_level:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return check
```

**Step 3: Run tests, verify pass, commit**

```bash
git commit -m "feat(auth): RBAC middleware with role hierarchy"
```

---

### Task 5: OAuth2 — Google provider

**Files:**
- Create: `/home/samuel/mission-control/backend/services/oauth.py`
- Modify: `/home/samuel/mission-control/backend/api/auth.py` (add OAuth routes)
- Test: `/home/samuel/mission-control/backend/tests/services/test_oauth.py`

**Step 1: Implement Google OAuth flow**

- `GET /api/auth/oauth/google` — redirect to Google OAuth consent
- `GET /api/auth/oauth/google/callback` — exchange code for token, create/login user
- Install `httpx` (already present) for token exchange

**Step 2: Test with mock Google responses**

**Step 3: Commit**

```bash
git commit -m "feat(auth): Google OAuth2 provider"
```

---

### Task 6: OAuth2 — GitHub provider

**Files:**
- Modify: `/home/samuel/mission-control/backend/services/oauth.py`
- Modify: `/home/samuel/mission-control/backend/api/auth.py`
- Test: `/home/samuel/mission-control/backend/tests/services/test_oauth.py`

Same pattern as Google. Add GitHub client ID/secret to settings.

**Commit:** `feat(auth): GitHub OAuth2 provider`

---

### Task 7: User management API — CRUD + team assignment

**Files:**
- Create: `/home/samuel/mission-control/backend/api/users.py`
- Modify: `/home/samuel/mission-control/backend/main.py`
- Test: `/home/samuel/mission-control/backend/tests/api/test_users.py`

**Endpoints:**
- `GET /api/users` — list users (admin only)
- `GET /api/users/{id}` — get user detail
- `PATCH /api/users/{id}` — update user (admin: any field, self: display_name/avatar)
- `DELETE /api/users/{id}` — delete user (admin only)
- `POST /api/teams` — create team (admin only)
- `GET /api/teams` — list teams
- `PATCH /api/teams/{id}` — update team (admin only)

**Commit:** `feat(auth): user and team management API`

---

### Task 8: Frontend auth — login page, token storage, protected routes

**Files:**
- Create: `/home/samuel/mission-control/frontend/src/stores/authStore.ts`
- Create: `/home/samuel/mission-control/frontend/src/pages/LoginPage.tsx`
- Create: `/home/samuel/mission-control/frontend/src/services/api.ts` (axios instance with interceptor)
- Modify: `/home/samuel/mission-control/frontend/src/App.tsx`

**Step 1: Create authStore**

```typescript
// stores/authStore.ts
interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}
```

**Step 2: Create LoginPage**

Warm amber themed login form with email/password + Google/GitHub OAuth buttons.

**Step 3: Create API client with JWT interceptor**

Axios instance that attaches Bearer token and auto-refreshes on 401.

**Step 4: Wrap App.tsx with auth check**

If not authenticated → show LoginPage. If authenticated → show panel workspace.

**Step 5: Commit**

```bash
git commit -m "feat(auth): frontend login page, auth store, JWT token management"
```

---

## Phase 2: Panel Workspace (Tasks 9–18)

### Task 9: Panel registry — type system + registration

**Files:**
- Modify: `/home/samuel/mission-control/frontend/src/panels/panelRegistry.ts`
- Test: `/home/samuel/mission-control/frontend/src/panels/__tests__/panelRegistry.test.ts`

**Step 1: Write the failing test**

```typescript
// panels/__tests__/panelRegistry.test.ts
import { PanelRegistry } from '../panelRegistry';

test('registers and retrieves panel definition', () => {
  const registry = new PanelRegistry();
  registry.register({
    id: 'test-panel',
    title: 'Test Panel',
    category: '3d-spatial',
    component: () => null,
    platforms: ['web', 'desktop'],
  });
  const def = registry.get('test-panel');
  expect(def?.title).toBe('Test Panel');
});

test('lists panels by category', () => {
  const registry = new PanelRegistry();
  registry.register({ id: 'a', title: 'A', category: 'data', component: () => null, platforms: ['web'] });
  registry.register({ id: 'b', title: 'B', category: 'data', component: () => null, platforms: ['web'] });
  registry.register({ id: 'c', title: 'C', category: 'ros2-inspect', component: () => null, platforms: ['web'] });
  const dataP = registry.getByCategory('data');
  expect(dataP).toHaveLength(2);
});

test('getAll returns all registered panels', () => {
  const registry = new PanelRegistry();
  registry.register({ id: 'x', title: 'X', category: 'utility', component: () => null, platforms: ['web'] });
  expect(registry.getAll()).toHaveLength(1);
});
```

**Step 2: Rewrite panelRegistry.ts**

```typescript
// panels/panelRegistry.ts
export type PanelCategory =
  | '3d-spatial' | 'sensors' | 'data' | 'ros2-inspect' | 'ros2-control'
  | 'diagnostics' | 'recording' | 'isaac' | 'infrastructure' | 'project' | 'utility';

export interface PanelDefinition {
  id: string;
  title: string;
  category: PanelCategory;
  component: React.ComponentType<PanelProps>;
  icon?: React.ComponentType;
  platforms: ('web' | 'desktop' | 'ios')[];
  requiresLiveData?: boolean;
  defaultConfig?: Record<string, any>;
}

export interface PanelProps {
  panelId: string;  // unique instance ID
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
}

export class PanelRegistry {
  private panels = new Map<string, PanelDefinition>();

  register(def: PanelDefinition): void { this.panels.set(def.id, def); }
  get(id: string): PanelDefinition | undefined { return this.panels.get(id); }
  getAll(): PanelDefinition[] { return Array.from(this.panels.values()); }
  getByCategory(cat: PanelCategory): PanelDefinition[] {
    return this.getAll().filter(p => p.category === cat);
  }
}

export const panelRegistry = new PanelRegistry();
```

**Step 3: Run test, verify pass, commit**

```bash
git commit -m "feat(panels): typed panel registry with category grouping"
```

---

### Task 10: Layout store — replace navStore with layout-centric state

**Files:**
- Modify: `/home/samuel/mission-control/frontend/src/stores/layoutStore.ts`
- Test: `/home/samuel/mission-control/frontend/src/stores/__tests__/layoutStore.test.ts`

**Step 1: Redesign layoutStore**

```typescript
// stores/layoutStore.ts
interface LayoutState {
  // Current workspace
  currentLayout: MosaicNode<string> | null;  // string = panelInstanceId
  panelConfigs: Record<string, { type: string; config: Record<string, any> }>;

  // Saved layouts
  savedLayouts: SavedLayout[];
  activeLayoutId: string | null;

  // Actions
  setLayout: (layout: MosaicNode<string>) => void;
  addPanel: (panelType: string, position?: 'left' | 'right' | 'top' | 'bottom') => void;
  removePanel: (instanceId: string) => void;
  updatePanelConfig: (instanceId: string, config: Record<string, any>) => void;
  saveLayout: (name: string) => void;
  loadLayout: (layoutId: string) => void;
  deleteLayout: (layoutId: string) => void;

  // Layout variables
  variables: Record<string, any>;
  setVariable: (name: string, value: any) => void;
}
```

**Step 2: Test layout CRUD operations**

**Step 3: Commit**

```bash
git commit -m "feat(panels): layout store with panel instances, saved layouts, variables"
```

---

### Task 11: Panel catalog UI — add panel dialog

**Files:**
- Create: `/home/samuel/mission-control/frontend/src/components/PanelCatalog.tsx`
- Test: Visual — render catalog, verify grouping

**Step 1: Build PanelCatalog component**

- Modal/drawer that opens on "+ Panel" click
- Groups panels by category with icons
- Search/filter bar
- Click to add panel to workspace
- Shows platform availability badges

**Step 2: Commit**

```bash
git commit -m "feat(panels): panel catalog UI with category grouping and search"
```

---

### Task 12: Top bar — replaces sidebar navigation

**Files:**
- Create: `/home/samuel/mission-control/frontend/src/components/TopBar.tsx`
- Remove reference to: `/home/samuel/mission-control/frontend/src/components/Sidebar.tsx`

**Step 1: Build TopBar component**

```
[◆ MISSION CONTROL] [Layout: ▾] [+ Panel] [≡ Layouts] ... [⚡ Live] [Robot: ▾] [User: ▾] [⚙]
```

- Layout selector dropdown (saved layouts)
- Add Panel button (opens PanelCatalog)
- Layouts drawer (manage saved layouts)
- Data source indicator (live/MCAP)
- Robot selector
- User menu (profile, team, logout)
- Settings gear

**Step 2: Commit**

```bash
git commit -m "feat(ui): top bar replaces sidebar — layout selector, panel catalog, user menu"
```

---

### Task 13: Workspace renderer — full-screen mosaic

**Files:**
- Modify: `/home/samuel/mission-control/frontend/src/components/Layout.tsx`
- Modify: `/home/samuel/mission-control/frontend/src/App.tsx`

**Step 1: Modify Layout.tsx to be the full app workspace**

- Reads `layoutStore.currentLayout` for mosaic tree
- Reads `layoutStore.panelConfigs` to resolve panel type → component
- Renders each mosaic leaf as a `PanelWrapper` that:
  1. Looks up PanelDefinition from panelRegistry
  2. Renders component with PanelProps
  3. Adds panel header (title, settings gear, close X)

**Step 2: Modify App.tsx**

- Remove page-based routing (`activePage` switch)
- Remove Sidebar import
- Render: `<TopBar />` + `<Workspace />` (full-screen mosaic)
- If not authenticated: render `<LoginPage />`

**Step 3: Commit**

```bash
git commit -m "feat(ui): full-screen panel workspace replaces page-based layout"
```

---

### Task 14: Convert existing pages to panels — Overview

**Files:**
- Modify: `/home/samuel/mission-control/frontend/src/pages/OverviewPage.tsx`
- Modify: Panel registration in app init

**Step 1: Wrap OverviewPage as a panel**

- Adapt to accept `PanelProps`
- Register as `{ id: 'overview', category: 'infrastructure', ... }`
- Keep all existing functionality

**Step 2: Commit**

```bash
git commit -m "refactor: convert OverviewPage to overview panel"
```

---

### Task 15: Convert existing pages to panels — Viewer3D components

**Files:**
- Existing panels already registered: `viewport3d`, `displays`, `topics`, `properties`, `rqtGraph`, `actionGraph`
- Update registrations to use new PanelDefinition format
- Add `category` and `platforms` fields

**Commit:** `refactor: update 3D viewer panels to new PanelDefinition format`

---

### Task 16: Convert existing pages to panels — Robots

**Files:**
- Modify: `/home/samuel/mission-control/frontend/src/pages/RobotsPage.tsx`

**Step 1: Split RobotsPage into 4 panels**

Extract the 4 sub-tabs into independent panels:
- `robot-list` — Robot cards grid
- `robot-config` — Component-based builder (Robot Builder)
- `robot-isaac` — Isaac sim config + build history
- `robot-real` — Real robot connection + joint states

Each becomes a registered panel. The "Robots" layout is a saved layout containing these 4 panels.

**Commit:** `refactor: split RobotsPage into 4 independent robot panels`

---

### Task 17: Convert existing pages to panels — Pipelines, Fleet, Agents, Infra, Registry

**Files:**
- All remaining pages converted to panels
- Each page becomes one or more panels
- PipelinesPage → `pipeline-builder` panel (already complex, keep as single panel)
- FleetPage → `fleet-status` panel
- AgentsPage → `agent-monitor` panel
- InfraPage → `compute-monitor` + `container-manager` panels
- RegistryPage → `registry-browser` panel

**Commit:** `refactor: convert all remaining pages to panels`

---

### Task 18: Default layouts — ship sensible presets

**Files:**
- Create: `/home/samuel/mission-control/frontend/src/layouts/defaults.ts`

**Step 1: Define default layouts**

```typescript
export const DEFAULT_LAYOUTS: SavedLayout[] = [
  {
    id: 'overview',
    name: 'Overview',
    layout: { /* mosaic tree: overview + fleet-status + compute-monitor */ },
  },
  {
    id: '3d-monitoring',
    name: '3D Monitoring',
    layout: { /* viewport3d (80%) + displays + topics + properties */ },
  },
  {
    id: 'recording',
    name: 'Recording',
    layout: { /* viewport3d + image + bag-recorder + topic-monitor */ },
  },
  {
    id: 'robot-builder',
    name: 'Robot Builder',
    layout: { /* robot-config (full) */ },
  },
  {
    id: 'pipeline-builder',
    name: 'Pipeline Builder',
    layout: { /* pipeline-builder (full) */ },
  },
  {
    id: 'debug',
    name: 'Debug',
    layout: { /* raw-messages + log-viewer + node-graph + diagnostics */ },
  },
];
```

**Commit:** `feat(ui): default layouts — Overview, 3D Monitoring, Recording, Debug, Builder presets`

---

## Phase 3: DataSource Abstraction (Tasks 19–24)

### Task 19: DataSource interface + types

**Files:**
- Create: `/home/samuel/mission-control/frontend/src/data-source/types.ts`
- Test: `/home/samuel/mission-control/frontend/src/data-source/__tests__/types.test.ts`

Define `DataSource`, `TopicInfo`, `MessageCallback`, `Subscription`, `ConnectionStatus`, `PlaybackControls` TypeScript interfaces.

**Commit:** `feat(datasource): DataSource interface and type definitions`

---

### Task 20: LiveDataSource — wraps existing rosbridge

**Files:**
- Create: `/home/samuel/mission-control/frontend/src/data-source/LiveDataSource.ts`
- Modify: `/home/samuel/mission-control/frontend/src/ros/connection.ts`
- Test: `/home/samuel/mission-control/frontend/src/data-source/__tests__/LiveDataSource.test.ts`

Wrap existing rosbridge connection, topicPoller, and tfTree into the DataSource interface. Existing stores continue to work — this is an adapter, not a rewrite.

**Commit:** `feat(datasource): LiveDataSource wrapping rosbridge connection`

---

### Task 21: DataSourceProvider React context

**Files:**
- Create: `/home/samuel/mission-control/frontend/src/data-source/DataSourceProvider.tsx`
- Create: `/home/samuel/mission-control/frontend/src/data-source/hooks.ts`
- Modify: `/home/samuel/mission-control/frontend/src/App.tsx`

```typescript
// hooks.ts
export function useDataSource(): DataSource;
export function useSubscription(topic: string): Message | undefined;
export function usePlaybackControls(): PlaybackControls | undefined;
export function useTopics(): TopicInfo[];
export function useConnectionStatus(): ConnectionStatus;
```

Wrap entire app in `<DataSourceProvider>`. Initial implementation uses LiveDataSource only.

**Commit:** `feat(datasource): DataSourceProvider context + hooks for panels`

---

### Task 22: McapDataSource — MCAP file reader

**Files:**
- Create: `/home/samuel/mission-control/frontend/src/data-source/McapDataSource.ts`
- Test: `/home/samuel/mission-control/frontend/src/data-source/__tests__/McapDataSource.test.ts`

**Dependencies:** `@mcap/core`

- Reads MCAP files via `@mcap/core` McapReader
- Implements full playback controls: play/pause/seek/speed/loop
- Message latching on seek
- Uses MCAP index for random-access (no full-file scan)

**Commit:** `feat(datasource): McapDataSource with playback controls`

---

### Task 23: Data source switching — live ↔ MCAP

**Files:**
- Modify: `/home/samuel/mission-control/frontend/src/data-source/DataSourceProvider.tsx`
- Modify: `/home/samuel/mission-control/frontend/src/stores/layoutStore.ts`

Add `switchToLive()` and `switchToMcap(file)` actions. When switching:
1. Disconnect current data source
2. Connect new data source
3. All subscriptions re-established automatically
4. TopBar updates to show current source

**Commit:** `feat(datasource): seamless switching between live and MCAP data sources`

---

### Task 24: Timeline bar component

**Files:**
- Create: `/home/samuel/mission-control/frontend/src/components/TimelineBar.tsx`
- Modify: `/home/samuel/mission-control/frontend/src/App.tsx`

Timeline bar anchored to bottom of workspace, visible only during MCAP playback:
- Play/Pause/Seek controls
- Time display (current / total)
- Speed selector (0.1x–10x)
- Loop toggle
- Seek bar with buffer indicator
- Trim handles
- Keyboard shortcuts (Space, arrows, Home/End)

**Commit:** `feat(ui): timeline bar for MCAP playback controls`

---

## Phase 4: Core Panels — Foxglove Parity (Tasks 25–41)

Each task creates one new panel. Pattern for each:
1. Create panel component file
2. Register in panel registry
3. Write basic render test
4. Commit

### Task 25: Raw Messages panel
**File:** `frontend/src/panels/RawMessages/RawMessagesPanel.tsx`
- JSON tree viewer with collapsible nodes
- Diff mode (consecutive message comparison)
- Topic selector dropdown
- Copy to clipboard

**Commit:** `feat(panels): Raw Messages panel — JSON tree, diff mode`

### Task 26: Plot panel
**File:** `frontend/src/panels/Plot/PlotPanel.tsx`
- **Dependency:** `uplot` (install)
- Time-series chart, multiple series
- Field selection via message path (initially text input, later integrated with message path parser)
- Auto-scale Y axis, configurable time window

**Commit:** `feat(panels): Plot panel — time-series graphing with uPlot`

### Task 27: Log Viewer panel
**File:** `frontend/src/panels/LogViewer/LogViewerPanel.tsx`
- Subscribes to `/rosout`
- Severity filter (DEBUG → FATAL)
- Node name filter
- Keyword search
- Color-coded rows

**Commit:** `feat(panels): Log Viewer panel — filtered ROS2 log stream`

### Task 28: Diagnostics panel
**File:** `frontend/src/panels/Diagnostics/DiagnosticsPanel.tsx`
- Subscribes to `/diagnostics`
- Component status table (OK/WARN/ERROR/STALE)
- Expandable detail view

**Commit:** `feat(panels): Diagnostics panel — component health monitoring`

### Task 29: Table panel
**File:** `frontend/src/panels/Table/TablePanel.tsx`
- Generic tabular display for array messages
- Sortable columns
- Export to CSV

**Commit:** `feat(panels): Table panel — sortable tabular message display`

### Task 30: State Transitions panel
**File:** `frontend/src/panels/StateTransitions/StateTransitionsPanel.tsx`
- Horizontal swim lanes for enum/string fields
- Color-coded per value
- Hover for timestamp detail

**Commit:** `feat(panels): State Transitions panel — temporal state visualization`

### Task 31: Gauge panel
**File:** `frontend/src/panels/Gauge/GaugePanel.tsx`
- Arc gauge for single numeric value
- Configurable thresholds (warning/critical)
- SVG-based rendering

**Commit:** `feat(panels): Gauge panel — numeric arc gauge with thresholds`

### Task 32: Indicator panel
**File:** `frontend/src/panels/Indicator/IndicatorPanel.tsx`
- Boolean status light (green/red/yellow/gray)
- Configurable labels

**Commit:** `feat(panels): Indicator panel — boolean status light`

### Task 33: Publish panel
**File:** `frontend/src/panels/Publish/PublishPanel.tsx`
- Topic + type selector
- Auto-generated form from message schema
- Single shot or rate-based publishing
- Requires operator role

**Commit:** `feat(panels): Publish panel — compose and send ROS2 messages`

### Task 34: Service Call panel
**File:** `frontend/src/panels/ServiceCall/ServiceCallPanel.tsx`
- Service browser
- Auto-generated request form
- Response display
- Call history

**Commit:** `feat(panels): Service Call panel — invoke ROS2 services from UI`

### Task 35: Parameter panel
**File:** `frontend/src/panels/Parameters/ParametersPanel.tsx`
- List all node parameters via rosbridge
- Inline edit (type-appropriate inputs)
- Filter/search

**Commit:** `feat(panels): Parameter panel — view and edit ROS2 node parameters`

### Task 36: Teleop panel
**File:** `frontend/src/panels/Teleop/TeleopPanel.tsx`
- Virtual joystick (SVG/Canvas)
- Keyboard bindings (WASD)
- Publishes Twist messages
- Gamepad API support
- Dead-man switch

**Commit:** `feat(panels): Teleop panel — joystick and keyboard robot control`

### Task 37: Image panel
**File:** `frontend/src/panels/Image/ImagePanel.tsx`
- sensor_msgs/Image and CompressedImage
- Canvas-based rendering
- Overlay support (bounding boxes, labels)
- Multi-camera grid

**Commit:** `feat(panels): Image panel — camera feed viewer with overlays`

### Task 38: Map panel
**File:** `frontend/src/panels/Map/MapPanel.tsx`
- **Dependency:** `leaflet`, `react-leaflet` (install)
- NavSatFix display on OpenStreetMap tiles
- GPS trail overlay
- Position marker

**Commit:** `feat(panels): Map panel — GPS visualization on OpenStreetMap`

### Task 39: User Script panel
**File:** `frontend/src/panels/UserScript/UserScriptPanel.tsx`
- Monaco editor (already installed)
- TypeScript scripting
- Subscribe to topics, publish to virtual topics

**Commit:** `feat(panels): User Script panel — TypeScript data transforms`

### Task 40: Variable Slider panel
**File:** `frontend/src/panels/VariableSlider/VariableSliderPanel.tsx`
- Slider bound to layout variable
- Configurable min/max/step/name

**Commit:** `feat(panels): Variable Slider panel — interactive layout variable control`

### Task 41: Utility panels — Markdown, Data Source Info, Action Monitor, Latency/Frequency monitors

**Files:**
- `frontend/src/panels/Markdown/MarkdownPanel.tsx`
- `frontend/src/panels/DataSourceInfo/DataSourceInfoPanel.tsx`
- `frontend/src/panels/ActionMonitor/ActionMonitorPanel.tsx`
- `frontend/src/panels/LatencyMonitor/LatencyMonitorPanel.tsx`
- `frontend/src/panels/FrequencyMonitor/FrequencyMonitorPanel.tsx`

Five smaller panels bundled into one task.

**Commit:** `feat(panels): Markdown, DataSource Info, Action Monitor, Latency/Frequency monitors`

---

## Phase 5: Message Path Syntax (Tasks 42–46)

### Task 42: Message path parser — lexer + AST
**File:** `frontend/src/message-path/parser.ts`
- Tokenize message path strings
- Build AST: TopicRef, FieldAccess, ArrayIndex, Slice, Filter, Variable, Transform

**Commit:** `feat(message-path): parser — lexer and AST for field query syntax`

### Task 43: Message path evaluator — resolve paths against messages
**File:** `frontend/src/message-path/evaluator.ts`
- Walk AST against a ROS message object
- Return resolved value(s)

**Commit:** `feat(message-path): evaluator — resolve paths against ROS messages`

### Task 44: Built-in transforms — @rpy, @degrees, @abs, @length, @sqrt
**File:** `frontend/src/message-path/transforms.ts`

**Commit:** `feat(message-path): built-in transforms — rpy, degrees, abs, length, sqrt`

### Task 45: Layout variable resolution
**File:** `frontend/src/message-path/variables.ts`
- Resolve `$variableName` references from layoutStore.variables

**Commit:** `feat(message-path): layout variable resolution in paths`

### Task 46: Integrate message path into Plot, Gauge, Indicator, State Transitions panels
- Add message path input field to panel configs
- Wire evaluator into data subscription logic

**Commit:** `feat(message-path): integrate parser into data-bound panels`

---

## Phase 6: MCAP Recording & Playback (Tasks 47–55)

### Task 47: Recordings DB table + migration
**File:** `backend/db/registry/models.py`
- Add `Recording` model (see design doc §13)
- Alembic migration

**Commit:** `feat(mcap): recordings table + migration`

### Task 48: Recording API — CRUD
**File:** `backend/api/recordings.py`
- `POST /api/recordings` — start recording
- `GET /api/recordings` — list (filter by device/date/tags)
- `GET /api/recordings/{id}` — detail
- `PATCH /api/recordings/{id}` — update tags/sharing
- `DELETE /api/recordings/{id}` — admin only

**Commit:** `feat(mcap): recordings CRUD API`

### Task 49: MCAP writer service — record ROS2 topics
**File:** `backend/services/mcap_writer.py`
- Subscribe to selected topics via rosbridge
- Write to MCAP file (chunked, LZ4)
- Track message counts, size

**Dependencies:** `mcap`, `mcap-ros2-support`

**Commit:** `feat(mcap): backend MCAP recording service`

### Task 50: Recording control API — start/stop
**File:** `backend/api/recordings.py`
- `POST /api/recordings/start` — begin recording selected topics
- `POST /api/recordings/stop` — finalize, register in DB

**Commit:** `feat(mcap): start/stop recording API endpoints`

### Task 51: Bag Recorder panel (frontend)
**File:** `frontend/src/panels/BagRecorder/BagRecorderPanel.tsx`
- Topic selection checklist
- Start/Stop/Pause controls
- Live duration, size, message count display
- Auto-upload toggle

**Commit:** `feat(panels): Bag Recorder panel — record ROS2 topics to MCAP`

### Task 52: MCAP Browser panel (frontend)
**File:** `frontend/src/panels/McapBrowser/McapBrowserPanel.tsx`
- List recordings with filters
- Open (switch to MCAP DataSource)
- Download, delete, share, tag actions

**Commit:** `feat(panels): MCAP Browser panel — browse and open recordings`

### Task 53: MCAP file streaming from backend
**File:** `backend/api/recordings.py`
- `GET /api/recordings/{id}/stream` — stream MCAP file via HTTP range requests
- Enables web/iOS to play back without full download

**Commit:** `feat(mcap): HTTP range streaming for MCAP file playback`

### Task 54: McapDataSource S3 streaming
**File:** `frontend/src/data-source/McapDataSource.ts`
- Add S3 URL support — stream MCAP from presigned S3 URL via HTTP range requests

**Commit:** `feat(datasource): MCAP streaming from S3 presigned URLs`

### Task 55: End-to-end recording + playback test
- Manual test: record 30s of `/joint_states`, stop, open in MCAP Browser, verify Plot panel shows data

**Commit:** `test(mcap): end-to-end recording and playback verification`

---

## Phase 7: Cloud Storage — S3 (Tasks 56–61)

### Task 56: S3 service — boto3 wrapper
**File:** `backend/services/cloud_storage.py`
- S3 client wrapper (boto3)
- Generate presigned upload/download URLs
- List objects by prefix
- Delete objects
- Support both AWS S3 and MinIO (same API)

**Dependencies:** `boto3`

**Commit:** `feat(cloud): S3 storage service with presigned URLs`

### Task 57: Cloud storage API
**File:** `backend/api/cloud.py`
- `POST /api/cloud/presign-upload` — get presigned URL for upload
- `POST /api/cloud/presign-download` — get presigned URL for download
- `GET /api/cloud/objects` — list objects by prefix
- `DELETE /api/cloud/objects/{key}` — delete (admin only)

**Commit:** `feat(cloud): cloud storage API — presigned URLs, object listing`

### Task 58: Cloud objects DB table
**File:** `backend/db/registry/models.py`
- Add `CloudObject` model
- Track upload status, size, expiration

**Commit:** `feat(cloud): cloud_objects tracking table`

### Task 59: Auto-upload recordings to S3
**File:** `backend/services/mcap_writer.py`
- After recording finalize: if auto-upload enabled, upload MCAP to S3
- Update recording status: `complete` → `uploading` → `cloud`
- Background task (non-blocking)

**Commit:** `feat(cloud): auto-upload MCAP recordings to S3 after recording`

### Task 60: Config sharing via S3
**File:** `backend/api/registry.py`
- `POST /api/registry/{file_id}/share` — upload promoted config to S3, mark as shared
- `GET /api/registry/shared` — list shared configs from S3
- `POST /api/registry/import/{key}` — import shared config from S3 to local registry

**Commit:** `feat(cloud): share and import promoted configs via S3`

### Task 61: Cloud storage settings UI
**File:** `frontend/src/components/settings/CloudSettings.tsx`
- S3 endpoint, bucket, access key, secret key configuration
- Test connection button
- Auto-upload toggle
- Retention policy selector

**Commit:** `feat(ui): cloud storage settings panel`

---

## Phase 8: Team Features (Tasks 62–67)

### Task 62: Layouts DB table + API
**File:** `backend/db/registry/models.py`, `backend/api/layouts.py`
- `Layout` model (see design doc §13)
- CRUD API: create, list (personal + team), update, delete
- `POST /api/layouts/{id}/promote` — make team layout

**Commit:** `feat(teams): layouts DB table + CRUD API with team promotion`

### Task 63: Frontend layout sync
**File:** `frontend/src/stores/layoutStore.ts`
- Save/load layouts from backend API (not just localStorage)
- Team layouts appear in layout selector
- Real-time sync via WebSocket for team layout updates

**Commit:** `feat(teams): frontend layout persistence + team layout sync`

### Task 64: Recording sharing
**File:** `backend/api/recordings.py`, `frontend/src/panels/McapBrowser/McapBrowserPanel.tsx`
- `POST /api/recordings/{id}/share` — share with team
- MCAP Browser shows shared recordings from team
- Default sharing policy setting (admin)

**Commit:** `feat(teams): share recordings with team members`

### Task 65: Team management UI
**File:** `frontend/src/components/settings/TeamSettings.tsx`
- Create/edit teams
- Invite users
- Assign roles
- View team members

**Commit:** `feat(teams): team management UI in settings`

### Task 66: User profile UI
**File:** `frontend/src/components/settings/ProfileSettings.tsx`
- Display name, avatar, email
- Change password (local auth)
- Connected OAuth accounts
- Active sessions

**Commit:** `feat(teams): user profile settings UI`

### Task 67: Notification system for team events
**File:** `frontend/src/stores/notificationStore.ts`, `frontend/src/components/NotificationCenter.tsx`
- WebSocket-based real-time notifications
- Events: layout updated, recording shared, config promoted
- Toast notifications + notification center panel

**Commit:** `feat(teams): real-time notification system for team events`

---

## Phase 9: Monorepo Restructure (Tasks 68–73)

### Task 68: Initialize pnpm workspace
**File:** `mission-control/pnpm-workspace.yaml`, `mission-control/package.json`
- Set up pnpm workspaces with `packages/*`
- Root package.json with workspace scripts

**Commit:** `build: initialize pnpm monorepo workspace`

### Task 69: Extract packages/core from frontend/src
- Move platform-agnostic code to `packages/core/`:
  - `data-source/` — DataSource interface + implementations
  - `message-path/` — parser, evaluator, transforms
  - `stores/` — shared Zustand stores
  - `api/` — API client
  - `auth/` — auth client
  - `types/` — shared types
- Update imports in `packages/web` (formerly `frontend/`)

**Commit:** `refactor: extract packages/core — shared platform-agnostic logic`

### Task 70: Rename frontend/ → packages/web/
- Move `frontend/` to `packages/web/`
- Update all import paths to use `@mission-control/core`
- Update vite.config.ts
- Update CI/scripts

**Commit:** `refactor: move frontend to packages/web, imports from @mission-control/core`

### Task 71: Create packages/desktop skeleton (Electron)
**File:** `packages/desktop/`
- `package.json` with Electron dependency
- `main/main.ts` — Electron main process
- `preload/preload.ts` — IPC bridge
- `electron-builder.yml` — build config
- Loads `packages/web` in BrowserWindow

**Commit:** `build: Electron desktop app skeleton`

### Task 72: Create packages/ios skeleton
**File:** `packages/ios/`
- Xcode project structure
- WKWebView wrapper for shared panels
- Swift native navigation

**Commit:** `build: iOS app skeleton with WKWebView`

### Task 73: CI/CD updates for monorepo
- Update build scripts for workspace structure
- Ensure `pnpm build` builds core → web → desktop → ios

**Commit:** `build: CI/CD pipeline for monorepo workspace`

---

## Phase 10: Desktop App — Electron (Tasks 74–80)

### Task 74: Electron main process — window, menu, tray
**File:** `packages/desktop/main/main.ts`

**Commit:** `feat(desktop): Electron main process — window management, menu, system tray`

### Task 75: Local file access — open MCAP/bag files from disk
**File:** `packages/desktop/main/fileAccess.ts`
- IPC handler for native file dialogs
- Open MCAP files → switch to McapDataSource with local file

**Commit:** `feat(desktop): native file dialogs for local MCAP/bag files`

### Task 76: Electron safeStorage — secure token persistence
**File:** `packages/desktop/main/secureStorage.ts`
- Store refresh token in OS keychain via Electron safeStorage API

**Commit:** `feat(desktop): secure JWT storage via Electron safeStorage`

### Task 77: Auto-update
**File:** `packages/desktop/main/autoUpdate.ts`
- electron-updater for auto-update from GitHub Releases

**Commit:** `feat(desktop): auto-update from GitHub Releases`

### Task 78: Native ROS2 via rclnodejs (optional)
**File:** `packages/desktop/main/nativeRos2.ts`
- Direct DDS connection without rosbridge
- Falls back to rosbridge if rclnodejs not available

**Commit:** `feat(desktop): optional native ROS2 via rclnodejs`

### Task 79: Desktop build pipeline
- electron-builder config for Linux, macOS, Windows
- Build: `pnpm --filter desktop build`
- Output: AppImage (Linux), DMG (macOS), NSIS (Windows)

**Commit:** `build(desktop): electron-builder config for Linux/macOS/Windows`

### Task 80: Desktop smoke test
- Launch built app, connect to rosbridge, verify panels render

**Commit:** `test(desktop): smoke test — launch, connect, verify panels`

---

## Phase 11: iOS App (Tasks 81–87)

### Task 81: Xcode project setup
- Swift app with SwiftUI navigation
- WKWebView for panel rendering
- Minimum iOS 17

**Commit:** `feat(ios): Xcode project with SwiftUI + WKWebView`

### Task 82: Auth — login screen + Keychain token storage
- Native SwiftUI login form
- JWT storage in iOS Keychain
- Biometric unlock (Face ID / Touch ID)

**Commit:** `feat(ios): native login with Keychain + biometric unlock`

### Task 83: Panel rendering via WKWebView
- Load `@mission-control/core` panels in WKWebView
- JavaScript bridge for native ↔ web communication
- Panel subset: fleet-status, image, 3d-viewport, gauge, compute-monitor, mcap-browser

**Commit:** `feat(ios): panel rendering in WKWebView with JS bridge`

### Task 84: Push notifications
- APNs integration
- Backend sends push for: recording complete, alert, team activity
- Notification settings screen

**Commit:** `feat(ios): push notifications via APNs`

### Task 85: Quick Record — trigger remote recording
- Button to start/stop MCAP recording on connected robot
- Calls backend recording API

**Commit:** `feat(ios): quick record — trigger remote MCAP recording`

### Task 86: MCAP Browser — stream from S3
- Browse recordings
- Stream MCAP playback from S3 presigned URLs

**Commit:** `feat(ios): MCAP Browser — browse and stream cloud recordings`

### Task 87: iOS build pipeline
- Xcode Cloud or Fastlane
- TestFlight distribution

**Commit:** `build(ios): Fastlane + TestFlight distribution pipeline`

---

## Phase 12: Tailscale Integration (Tasks 88–92)

### Task 88: Tailscale ACL configuration
**File:** `infrastructure/tailscale/acl.json`
- Define tags: `mission-control`, `operator`, `viewer`
- ACL rules per design doc §4

**Commit:** `infra(tailscale): ACL policy for Mission Control tags`

### Task 89: Tailscale setup for fleet machines
- Install/configure Tailscale on workstation, DGX Spark, AGX Thor, Orin Nano
- Tag each machine as `tag:mission-control`
- Verify mesh connectivity

**Commit:** `infra(tailscale): fleet machine enrollment`

### Task 90: Desktop app — Tailscale detection
**File:** `packages/desktop/main/tailscale.ts`
- Detect if Tailscale is running
- Show connection status in TopBar
- If not running: prompt user to install/start Tailscale

**Commit:** `feat(desktop): Tailscale connection detection and status`

### Task 91: iOS app — Tailscale requirement
- Add setup guide for Tailscale iOS app
- Detect tailnet connectivity before allowing login
- Fallback: show "Connect to Tailscale" prompt

**Commit:** `feat(ios): Tailscale connectivity check and setup guide`

### Task 92: Backend — bind to Tailscale interface
**File:** `backend/main.py`
- Configuration option to bind FastAPI to Tailscale interface only
- Reject connections from non-tailnet IPs (optional security hardening)

**Commit:** `feat(backend): optional Tailscale-only binding for security`

---

## Execution Notes

### Parallelization Opportunities

- **Phase 1 and Phase 2** can run in parallel (independent: backend auth vs frontend panels)
- **Tasks 25–41** (new panels) can be parallelized across multiple agents — each panel is independent
- **Phase 10 and Phase 11** can run in parallel (desktop and iOS are independent)

### Critical Path

```
Phase 2 (Panel Workspace) → Phase 3 (DataSource) → Phase 6 (MCAP) → Phase 7 (Cloud)
Phase 1 (Auth) → Phase 7 (Cloud) → Phase 8 (Teams)
Phase 2 → Phase 9 (Monorepo) → Phase 10 (Desktop) + Phase 11 (iOS) → Phase 12 (Tailscale)
```

### Risk Mitigation

- **Biggest risk:** Phase 2 (panel workspace) is a complete UI rewrite. Mitigate by keeping existing page components intact and wrapping them as panels rather than rewriting.
- **MCAP risk:** MCAP recording requires rosbridge to be stable. Test with mock data first.
- **Monorepo risk:** Moving files breaks all imports. Do in a single atomic commit with search-replace.

### Total Estimated Tasks: 92
### Total Estimated Commits: ~95

---

*Implementation plan for design doc: `docs/plans/2026-03-02-foxglove-parity-design.md`*
*Generated: 2026-03-02*
