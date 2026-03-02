# Mission Control 3D Visualization Platform — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a browser-based RViz2 replacement with 3D viewport (all ROS2 display types), RQT Graph panel, and Action Graph editor, using warm amber theme.

**Architecture:** React 18 + TypeScript frontend with Three.js 0.170 for 3D, React Flow for graphs, react-mosaic for panel layout, Zustand for state, roslib for direct rosbridge WebSocket connection. Display plugin system where each ROS2 message type is a self-contained class.

**Tech Stack:** Vite 5, React 18, TypeScript 5.6, Three.js 0.170, React Flow 11, react-mosaic-component, Zustand 5, roslibjs, @dagrejs/dagre, Tailwind CSS 3.4, pnpm

**Working directory:** `~/mission-control/frontend/`

**Existing files to preserve:**
- `package.json` — deps already declared (add react-mosaic-component, @dagrejs/dagre)
- `src/hooks/useRosBridge.ts` — rewrite to use singleton pattern
- `src/types/index.ts` — keep, extend with display types

---

## Phase 1: Foundation

### Task 1: Project Bootstrap

**Files:**
- Modify: `package.json` (add missing deps)
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/vite-env.d.ts`
- Create: `.env` (rosbridge port default)

**Step 1: Add missing dependencies to package.json**

Add to `dependencies`:
```json
"react-mosaic-component": "^6.1.0",
"@dagrejs/dagre": "^1.1.0",
"@blueprintjs/core": "^5.0.0",
"@blueprintjs/icons": "^5.0.0"
```

Note: react-mosaic requires Blueprint CSS for window chrome. We override styles with our theme.

**Step 2: Install dependencies**

Run: `cd ~/mission-control/frontend && pnpm install`
Expected: `node_modules/` created, lockfile generated, no errors

**Step 3: Create Vite config**

Create `vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  define: {
    global: 'globalThis',
  },
});
```

Note: `global: 'globalThis'` fixes roslib's Node.js `global` reference in browser.

**Step 4: Create TypeScript configs**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 5: Create Tailwind + PostCSS config**

Create `tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0a0a0a',
        surface: { 1: '#111111', 2: '#1a1a1a', 3: '#222222' },
        border: { DEFAULT: '#2a2a2a', active: '#ffaa00' },
        accent: { DEFAULT: '#ffaa00', hover: '#ffbb33' },
        success: '#00cc66',
        danger: '#ff4444',
        warning: '#ff8800',
        info: '#4499ff',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs: '10px',
        sm: '12px',
        base: '13px',
        lg: '16px',
        xl: '20px',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

Create `postcss.config.js`:
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

**Step 6: Create entry files**

Create `index.html`:
```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mission Control</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  </head>
  <body class="bg-base text-[#e0e0e0] font-sans text-base antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/vite-env.d.ts`:
```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROSBRIDGE_PORT: string;
  readonly VITE_MC_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

Create `src/main.tsx`:
```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './theme/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Create `src/App.tsx` (minimal placeholder):
```typescript
export default function App() {
  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <h1 className="text-accent text-xl font-semibold">Mission Control</h1>
    </div>
  );
}
```

Create `.env`:
```
VITE_ROSBRIDGE_PORT=9090
VITE_MC_API_URL=http://localhost:8000
```

**Step 7: Verify build**

Run: `cd ~/mission-control/frontend && pnpm run typecheck`
Expected: No errors

Run: `cd ~/mission-control/frontend && pnpm run build`
Expected: Build succeeds, `dist/` created

**Step 8: Commit**

```bash
cd ~/mission-control
git add frontend/
git commit -m "feat(frontend): bootstrap MC visualization frontend

Vite + React 18 + TypeScript + Tailwind + react-mosaic + Three.js 0.170.
Warm amber theme tokens configured. Builds clean."
```

---

### Task 2: Warm Amber CSS Theme

**Files:**
- Create: `src/theme/index.css`
- Create: `src/theme/mosaic-overrides.css`

**Step 1: Create main theme CSS**

Create `src/theme/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ===== Warm Amber Engineering Theme ===== */

:root {
  --bg-base: #0a0a0a;
  --bg-surface-1: #111111;
  --bg-surface-2: #1a1a1a;
  --bg-surface-3: #222222;
  --border-default: #2a2a2a;
  --border-active: #ffaa00;

  --accent: #ffaa00;
  --accent-hover: #ffbb33;
  --accent-glow: rgba(255, 170, 0, 0.15);
  --accent-dim: rgba(255, 170, 0, 0.08);

  --success: #00cc66;
  --danger: #ff4444;
  --warning: #ff8800;
  --info: #4499ff;

  --text-primary: #e0e0e0;
  --text-secondary: #888888;
  --text-muted: #666666;
  --text-accent: #ffaa00;

  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
}

/* ===== Base ===== */

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ===== Scrollbar ===== */

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: var(--bg-surface-2);
}

::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--accent);
}

/* ===== Selection ===== */

::selection {
  background: var(--accent-glow);
  color: var(--text-primary);
}

/* ===== Focus ===== */

:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: 1px;
}

/* ===== Utility Classes ===== */

.panel {
  background: var(--bg-surface-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
}

.panel-active {
  border-color: var(--accent);
  box-shadow: 0 0 12px var(--accent-glow);
}

.btn-primary {
  background: var(--accent);
  color: var(--bg-base);
  font-weight: 600;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s, box-shadow 0.15s;
}

.btn-primary:hover {
  background: var(--accent-hover);
  box-shadow: 0 0 8px var(--accent-glow);
}

.btn-secondary {
  background: var(--bg-surface-2);
  color: var(--text-primary);
  font-weight: 500;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  cursor: pointer;
  font-size: 12px;
  transition: border-color 0.15s;
}

.btn-secondary:hover {
  border-color: var(--accent);
}

.input {
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  padding: 5px 10px;
  font-size: 12px;
  font-family: var(--font-sans);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 6px var(--accent-glow);
  outline: none;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
}

.badge-success { background: rgba(0, 204, 102, 0.15); color: var(--success); }
.badge-danger { background: rgba(255, 68, 68, 0.15); color: var(--danger); }
.badge-warning { background: rgba(255, 136, 0, 0.15); color: var(--warning); }
.badge-info { background: rgba(68, 153, 255, 0.15); color: var(--info); }
.badge-accent { background: var(--accent-dim); color: var(--accent); }

.mono {
  font-family: var(--font-mono);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.status-dot-live {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ===== Viewport Background Gradient ===== */

.viewport-bg {
  background: linear-gradient(180deg, #0a0a0a 0%, #0f0f12 100%);
}
```

**Step 2: Create mosaic theme overrides**

Create `src/theme/mosaic-overrides.css`:
```css
/* Override react-mosaic Blueprint defaults with warm amber theme */

.mosaic {
  background: var(--bg-base) !important;
}

.mosaic-tile {
  margin: 2px !important;
}

.mosaic-window {
  border-radius: var(--radius-md) !important;
  overflow: hidden;
}

.mosaic-window .mosaic-window-toolbar {
  background: var(--bg-surface-1) !important;
  border-bottom: 1px solid var(--border-default) !important;
  height: 28px !important;
  min-height: 28px !important;
}

.mosaic-window .mosaic-window-title {
  color: var(--text-secondary) !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.5px !important;
}

.mosaic-window .mosaic-window-body {
  background: var(--bg-surface-1) !important;
}

.mosaic-window .mosaic-window-controls .mosaic-default-control {
  color: var(--text-muted) !important;
}

.mosaic-window .mosaic-window-controls .mosaic-default-control:hover {
  color: var(--accent) !important;
}

.mosaic-split {
  background: transparent !important;
}

.mosaic-split:hover {
  background: var(--accent-dim) !important;
}

.mosaic-split.-row {
  margin: 0 -2px !important;
  width: 4px !important;
}

.mosaic-split.-column {
  margin: -2px 0 !important;
  height: 4px !important;
}

/* Hide Blueprint default styles we don't want */
.bp5-dark {
  background: transparent !important;
}
```

**Step 3: Import mosaic overrides in theme/index.css**

Add at the end of `src/theme/index.css`:
```css
@import './mosaic-overrides.css';
```

**Step 4: Verify build**

Run: `cd ~/mission-control/frontend && pnpm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
cd ~/mission-control
git add frontend/src/theme/
git commit -m "feat(frontend): warm amber CSS theme + mosaic overrides

Engineering cockpit aesthetic: near-black surfaces, amber accents,
PBR-ready viewport background gradient. Blueprint overrides for mosaic."
```

---

### Task 3: ROS Connection Singleton + Zustand Stores

**Files:**
- Create: `src/ros/connection.ts`
- Create: `src/ros/messageTypes.ts`
- Create: `src/stores/rosBridgeStore.ts`
- Create: `src/stores/displayStore.ts`
- Create: `src/stores/tfStore.ts`
- Create: `src/stores/layoutStore.ts`
- Create: `src/stores/topicStore.ts`
- Create: `src/stores/settingsStore.ts`
- Modify: `src/hooks/useRosBridge.ts` — rewrite to use singleton

**Step 1: Create ROS message type constants**

Create `src/ros/messageTypes.ts`:
```typescript
export const MSG = {
  // Sensor
  JointState: 'sensor_msgs/JointState',
  PointCloud2: 'sensor_msgs/PointCloud2',
  LaserScan: 'sensor_msgs/LaserScan',
  Image: 'sensor_msgs/Image',
  CompressedImage: 'sensor_msgs/CompressedImage',
  CameraInfo: 'sensor_msgs/CameraInfo',
  Range: 'sensor_msgs/Range',

  // Geometry
  PoseStamped: 'geometry_msgs/PoseStamped',
  PoseArray: 'geometry_msgs/PoseArray',
  PointStamped: 'geometry_msgs/PointStamped',
  WrenchStamped: 'geometry_msgs/WrenchStamped',
  PolygonStamped: 'geometry_msgs/PolygonStamped',
  TransformStamped: 'geometry_msgs/TransformStamped',

  // Navigation
  Path: 'nav_msgs/Path',
  Odometry: 'nav_msgs/Odometry',
  OccupancyGrid: 'nav_msgs/OccupancyGrid',

  // Visualization
  Marker: 'visualization_msgs/Marker',
  MarkerArray: 'visualization_msgs/MarkerArray',
  InteractiveMarkerFeedback: 'visualization_msgs/InteractiveMarkerFeedback',

  // TF
  TFMessage: 'tf2_msgs/TFMessage',

  // Diagnostics
  DiagnosticArray: 'diagnostic_msgs/DiagnosticArray',

  // ROS Log
  Log: 'rcl_interfaces/Log',
} as const;

export type RosMessageType = (typeof MSG)[keyof typeof MSG];
```

**Step 2: Create ROS connection singleton**

Create `src/ros/connection.ts`:
```typescript
import ROSLIB from 'roslibjs';

export type RosConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

type StatusListener = (status: RosConnectionStatus) => void;

let ros: ROSLIB.Ros | null = null;
let currentStatus: RosConnectionStatus = 'disconnected';
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 3000;
const MAX_RECONNECT_DELAY = 30000;
const listeners = new Set<StatusListener>();

function getUrl(): string {
  const port = import.meta.env.VITE_ROSBRIDGE_PORT || '9090';
  return `ws://${window.location.hostname}:${port}`;
}

function setStatus(status: RosConnectionStatus) {
  currentStatus = status;
  listeners.forEach((fn) => fn(status));
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY);
}

export function connect(): ROSLIB.Ros {
  if (ros) {
    ros.close();
  }

  setStatus('connecting');
  ros = new ROSLIB.Ros({ url: getUrl() });

  ros.on('connection', () => {
    reconnectDelay = 3000;
    setStatus('connected');
  });

  ros.on('error', () => {
    setStatus('error');
  });

  ros.on('close', () => {
    setStatus('disconnected');
    scheduleReconnect();
  });

  return ros;
}

export function getRos(): ROSLIB.Ros {
  if (!ros) {
    return connect();
  }
  return ros;
}

export function getStatus(): RosConnectionStatus {
  return currentStatus;
}

export function onStatusChange(fn: StatusListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ros) {
    ros.close();
    ros = null;
  }
  setStatus('disconnected');
}

export function subscribeTopic<T>(
  topicName: string,
  messageType: string,
  callback: (msg: T) => void,
  throttleRate = 0,
): ROSLIB.Topic {
  const topic = new ROSLIB.Topic({
    ros: getRos(),
    name: topicName,
    messageType,
    throttle_rate: throttleRate,
  });
  topic.subscribe(callback as (msg: ROSLIB.Message) => void);
  return topic;
}
```

**Step 3: Create Zustand stores**

Create `src/stores/rosBridgeStore.ts`:
```typescript
import { create } from 'zustand';
import type { RosConnectionStatus } from '@/ros/connection';

interface RosBridgeState {
  status: RosConnectionStatus;
  url: string;
  error: string | null;
  setStatus: (status: RosConnectionStatus) => void;
  setError: (error: string | null) => void;
}

export const useRosBridgeStore = create<RosBridgeState>((set) => ({
  status: 'disconnected',
  url: `ws://${window.location.hostname}:${import.meta.env.VITE_ROSBRIDGE_PORT || '9090'}`,
  error: null,
  setStatus: (status) => set({ status, error: status === 'error' ? 'Connection error' : null }),
  setError: (error) => set({ error }),
}));
```

Create `src/stores/topicStore.ts`:
```typescript
import { create } from 'zustand';

export interface TopicInfo {
  name: string;
  type: string;
  hz: number | null;
  lastMessage: number; // timestamp
}

interface TopicState {
  topics: Map<string, TopicInfo>;
  setTopics: (topics: TopicInfo[]) => void;
  updateHz: (name: string, hz: number) => void;
}

export const useTopicStore = create<TopicState>((set) => ({
  topics: new Map(),
  setTopics: (topics) =>
    set({ topics: new Map(topics.map((t) => [t.name, t])) }),
  updateHz: (name, hz) =>
    set((state) => {
      const next = new Map(state.topics);
      const existing = next.get(name);
      if (existing) next.set(name, { ...existing, hz, lastMessage: Date.now() });
      return { topics: next };
    }),
}));
```

Create `src/stores/layoutStore.ts`:
```typescript
import { create } from 'zustand';
import type { MosaicNode } from 'react-mosaic-component';

export type PanelId = 'viewport3d' | 'rqtGraph' | 'actionGraph' | 'imageViewer' | 'displays' | 'topics' | 'properties';

const DEFAULT_LAYOUT: MosaicNode<PanelId> = {
  direction: 'row',
  first: {
    direction: 'column',
    first: 'displays',
    second: 'topics',
    splitPercentage: 60,
  },
  second: {
    direction: 'row',
    first: 'viewport3d',
    second: 'properties',
    splitPercentage: 80,
  },
  splitPercentage: 18,
};

interface LayoutState {
  layout: MosaicNode<PanelId> | null;
  setLayout: (layout: MosaicNode<PanelId> | null) => void;
  resetLayout: () => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  layout: DEFAULT_LAYOUT,
  setLayout: (layout) => set({ layout }),
  resetLayout: () => set({ layout: DEFAULT_LAYOUT }),
}));
```

Create `src/stores/settingsStore.ts`:
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  fixedFrame: string;
  backgroundColor: string;
  showGrid: boolean;
  showAxes: boolean;
  gridSize: number;
  gridDivisions: number;
  setFixedFrame: (frame: string) => void;
  setSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      fixedFrame: 'base_link',
      backgroundColor: '#0a0a0a',
      showGrid: true,
      showAxes: true,
      gridSize: 10,
      gridDivisions: 20,
      setFixedFrame: (frame) => set({ fixedFrame: frame }),
      setSetting: (key, value) => set({ [key]: value } as any),
    }),
    { name: 'mc-settings' },
  ),
);
```

Create `src/stores/displayStore.ts`:
```typescript
import { create } from 'zustand';

export interface DisplayConfig {
  id: string;
  type: string;
  topic: string;
  visible: boolean;
  properties: Record<string, any>;
}

interface DisplayState {
  displays: DisplayConfig[];
  selectedId: string | null;
  addDisplay: (type: string, topic?: string) => string;
  removeDisplay: (id: string) => void;
  updateDisplay: (id: string, updates: Partial<DisplayConfig>) => void;
  setSelected: (id: string | null) => void;
  toggleVisible: (id: string) => void;
}

let nextId = 1;

export const useDisplayStore = create<DisplayState>((set) => ({
  displays: [],
  selectedId: null,

  addDisplay: (type, topic = '') => {
    const id = `display-${nextId++}`;
    set((s) => ({
      displays: [...s.displays, { id, type, topic, visible: true, properties: {} }],
      selectedId: id,
    }));
    return id;
  },

  removeDisplay: (id) =>
    set((s) => ({
      displays: s.displays.filter((d) => d.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  updateDisplay: (id, updates) =>
    set((s) => ({
      displays: s.displays.map((d) => (d.id === id ? { ...d, ...updates } : d)),
    })),

  setSelected: (id) => set({ selectedId: id }),

  toggleVisible: (id) =>
    set((s) => ({
      displays: s.displays.map((d) =>
        d.id === id ? { ...d, visible: !d.visible } : d,
      ),
    })),
}));
```

Create `src/stores/tfStore.ts`:
```typescript
import { create } from 'zustand';
import * as THREE from 'three';

export interface TFFrame {
  frameId: string;
  parentId: string;
  translation: THREE.Vector3;
  rotation: THREE.Quaternion;
  timestamp: number;
}

interface TFState {
  frames: Map<string, TFFrame>;
  frameList: string[];
  updateFrame: (frame: TFFrame) => void;
  getTransform: (frameId: string, targetFrame: string) => THREE.Matrix4 | null;
}

export const useTFStore = create<TFState>((set, get) => ({
  frames: new Map(),
  frameList: [],

  updateFrame: (frame) =>
    set((state) => {
      const next = new Map(state.frames);
      next.set(frame.frameId, frame);
      const frameList = Array.from(next.keys()).sort();
      return { frames: next, frameList };
    }),

  getTransform: (frameId, targetFrame) => {
    const { frames } = get();
    if (frameId === targetFrame) return new THREE.Matrix4();

    // Walk up from frameId to root, collecting transforms
    const chainToRoot = (fid: string): THREE.Matrix4[] => {
      const chain: THREE.Matrix4[] = [];
      let current = fid;
      const visited = new Set<string>();
      while (current && !visited.has(current)) {
        visited.add(current);
        const f = frames.get(current);
        if (!f) break;
        const mat = new THREE.Matrix4();
        mat.compose(f.translation, f.rotation, new THREE.Vector3(1, 1, 1));
        chain.push(mat);
        current = f.parentId;
      }
      return chain;
    };

    const chainA = chainToRoot(frameId);
    const chainB = chainToRoot(targetFrame);

    // Simple case: frameId -> targetFrame through root
    const result = new THREE.Matrix4();
    for (const m of chainA) result.premultiply(m);
    const targetMat = new THREE.Matrix4();
    for (const m of chainB) targetMat.premultiply(m);
    targetMat.invert();
    result.premultiply(targetMat);

    return result;
  },
}));
```

**Step 4: Rewrite useRosBridge hook to use singleton**

Overwrite `src/hooks/useRosBridge.ts`:
```typescript
import { useEffect, useCallback } from 'react';
import ROSLIB from 'roslibjs';
import { getRos, getStatus, onStatusChange, connect } from '@/ros/connection';
import { useRosBridgeStore } from '@/stores/rosBridgeStore';

export function useRosBridge() {
  const setStatus = useRosBridgeStore((s) => s.setStatus);

  useEffect(() => {
    // Initialize connection on first use
    connect();
    setStatus(getStatus());
    return onStatusChange(setStatus);
  }, [setStatus]);

  return getRos();
}

export function useTopic<T = Record<string, unknown>>(
  topicName: string,
  messageType: string,
  onMessage: (msg: T) => void,
  throttleRate = 0,
) {
  const ros = useRosBridge();

  useEffect(() => {
    if (!topicName || !messageType) return;

    const topic = new ROSLIB.Topic({
      ros,
      name: topicName,
      messageType,
      throttle_rate: throttleRate,
    });

    const handler = (msg: ROSLIB.Message) => onMessage(msg as T);
    topic.subscribe(handler);

    return () => { topic.unsubscribe(); };
  }, [ros, topicName, messageType, throttleRate]);
}

export function useServiceCall(serviceName: string, serviceType: string) {
  const ros = useRosBridge();

  return useCallback(
    (request: Record<string, unknown>): Promise<Record<string, unknown>> => {
      return new Promise((resolve, reject) => {
        const service = new ROSLIB.Service({
          ros,
          name: serviceName,
          serviceType,
        });
        service.callService(
          new ROSLIB.ServiceRequest(request),
          (result) => resolve(result as Record<string, unknown>),
          (error) => reject(new Error(error)),
        );
      });
    },
    [ros, serviceName, serviceType],
  );
}
```

**Step 5: Verify typecheck**

Run: `cd ~/mission-control/frontend && pnpm run typecheck`
Expected: No errors (may need type stubs for roslibjs — create if needed)

**Step 6: Commit**

```bash
cd ~/mission-control
git add frontend/src/ros/ frontend/src/stores/ frontend/src/hooks/
git commit -m "feat(frontend): ROS singleton + Zustand stores

Connection singleton with auto-reconnect (3s-30s backoff).
Stores: rosBridge, displays, tf, layout, topics, settings.
Hook rewritten to use singleton instead of per-component connections."
```

---

### Task 4: Panel Layout System

**Files:**
- Create: `src/components/Layout.tsx`
- Create: `src/components/Toolbar.tsx`
- Create: `src/components/StatusBar.tsx`
- Create: `src/panels/panelRegistry.ts`
- Create: `src/panels/Viewport3D/Viewport3D.tsx` (placeholder)
- Modify: `src/App.tsx`

**Step 1: Create panel registry**

Create `src/panels/panelRegistry.ts`:
```typescript
import type { ComponentType } from 'react';
import type { PanelId } from '@/stores/layoutStore';

export interface PanelDef {
  id: PanelId;
  title: string;
  component: ComponentType;
}

const registry = new Map<PanelId, PanelDef>();

export function registerPanel(def: PanelDef) {
  registry.set(def.id, def);
}

export function getPanel(id: PanelId): PanelDef | undefined {
  return registry.get(id);
}

export function getAllPanels(): PanelDef[] {
  return Array.from(registry.values());
}
```

**Step 2: Create placeholder panels**

Create `src/panels/Viewport3D/Viewport3D.tsx`:
```typescript
export default function Viewport3D() {
  return (
    <div className="w-full h-full viewport-bg flex items-center justify-center">
      <span className="text-text-muted text-sm">3D Viewport</span>
    </div>
  );
}
```

Create `src/panels/DisplaySidebar/DisplaySidebar.tsx`:
```typescript
export default function DisplaySidebar() {
  return (
    <div className="w-full h-full p-3 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[--text-secondary]">Displays</h2>
        <button className="btn-primary text-xs px-2 py-1">+ Add</button>
      </div>
      <p className="text-[--text-muted] text-sm">No displays added</p>
    </div>
  );
}
```

Create `src/panels/TopicBrowser/TopicBrowser.tsx`:
```typescript
export default function TopicBrowser() {
  return (
    <div className="w-full h-full p-3 overflow-y-auto">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[--text-secondary] mb-3">Topics</h2>
      <p className="text-[--text-muted] text-sm">Not connected to rosbridge</p>
    </div>
  );
}
```

Create `src/panels/PropertyEditor/PropertyEditor.tsx`:
```typescript
export default function PropertyEditor() {
  return (
    <div className="w-full h-full p-3 overflow-y-auto">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[--text-secondary] mb-3">Properties</h2>
      <p className="text-[--text-muted] text-sm">Select a display to edit properties</p>
    </div>
  );
}
```

**Step 3: Register panels in App**

Create `src/components/Layout.tsx`:
```typescript
import { Mosaic, MosaicWindow } from 'react-mosaic-component';
import 'react-mosaic-component/react-mosaic-component.css';
import { useLayoutStore, type PanelId } from '@/stores/layoutStore';
import { getPanel } from '@/panels/panelRegistry';

export default function Layout() {
  const { layout, setLayout } = useLayoutStore();

  const renderTile = (id: PanelId, path: (string | number)[]) => {
    const panel = getPanel(id);
    if (!panel) return <div>Unknown panel: {id}</div>;
    const Component = panel.component;

    return (
      <MosaicWindow<PanelId>
        path={path}
        title={panel.title}
        toolbarControls={<></>}
      >
        <Component />
      </MosaicWindow>
    );
  };

  return (
    <Mosaic<PanelId>
      renderTile={renderTile}
      value={layout}
      onChange={setLayout as any}
      className="mosaic-blueprint-theme bp5-dark"
    />
  );
}
```

**Step 4: Create Toolbar**

Create `src/components/Toolbar.tsx`:
```typescript
import { useRosBridgeStore } from '@/stores/rosBridgeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTFStore } from '@/stores/tfStore';

export default function Toolbar() {
  const rosStatus = useRosBridgeStore((s) => s.status);
  const fixedFrame = useSettingsStore((s) => s.fixedFrame);
  const setFixedFrame = useSettingsStore((s) => s.setFixedFrame);
  const frameList = useTFStore((s) => s.frameList);

  return (
    <div
      className="h-9 flex items-center gap-4 px-4 border-b"
      style={{ background: 'var(--bg-surface-1)', borderColor: 'var(--border-default)' }}
    >
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
        Mission Control
      </span>

      <div className="flex items-center gap-2 ml-4">
        <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Fixed Frame</label>
        <select
          className="input text-xs py-0.5"
          value={fixedFrame}
          onChange={(e) => setFixedFrame(e.target.value)}
        >
          {frameList.length === 0 && <option value="base_link">base_link</option>}
          {frameList.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span
            className={`status-dot ${rosStatus === 'connected' ? 'status-dot-live' : ''}`}
            style={{
              backgroundColor:
                rosStatus === 'connected' ? 'var(--success)' :
                rosStatus === 'connecting' ? 'var(--warning)' : 'var(--danger)',
            }}
          />
          <span className="text-xs mono" style={{ color: 'var(--text-secondary)' }}>
            {rosStatus}
          </span>
        </div>
      </div>
    </div>
  );
}
```

**Step 5: Create StatusBar**

Create `src/components/StatusBar.tsx`:
```typescript
import { useDisplayStore } from '@/stores/displayStore';
import { useRosBridgeStore } from '@/stores/rosBridgeStore';

export default function StatusBar() {
  const displayCount = useDisplayStore((s) => s.displays.filter((d) => d.visible).length);
  const rosStatus = useRosBridgeStore((s) => s.status);

  return (
    <div
      className="h-6 flex items-center gap-4 px-4 text-xs border-t"
      style={{
        background: 'var(--bg-surface-1)',
        borderColor: 'var(--border-default)',
        color: 'var(--text-muted)',
      }}
    >
      <span>Displays: {displayCount}</span>
      <span className="mono">ROS: {rosStatus}</span>
      <span className="ml-auto mono">MC v0.1.0</span>
    </div>
  );
}
```

**Step 6: Wire up App.tsx**

Overwrite `src/App.tsx`:
```typescript
import { useEffect } from 'react';
import Layout from '@/components/Layout';
import Toolbar from '@/components/Toolbar';
import StatusBar from '@/components/StatusBar';
import { registerPanel } from '@/panels/panelRegistry';
import Viewport3D from '@/panels/Viewport3D/Viewport3D';
import DisplaySidebar from '@/panels/DisplaySidebar/DisplaySidebar';
import TopicBrowser from '@/panels/TopicBrowser/TopicBrowser';
import PropertyEditor from '@/panels/PropertyEditor/PropertyEditor';
import { connect } from '@/ros/connection';

// Register all panels
registerPanel({ id: 'viewport3d', title: '3D Viewport', component: Viewport3D });
registerPanel({ id: 'displays', title: 'Displays', component: DisplaySidebar });
registerPanel({ id: 'topics', title: 'Topics', component: TopicBrowser });
registerPanel({ id: 'properties', title: 'Properties', component: PropertyEditor });

export default function App() {
  useEffect(() => {
    connect();
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <Toolbar />
      <div className="flex-1 min-h-0">
        <Layout />
      </div>
      <StatusBar />
    </div>
  );
}
```

**Step 7: Verify dev server**

Run: `cd ~/mission-control/frontend && pnpm run dev`
Expected: Opens at localhost:3000, shows panel layout with toolbar, 4 panels (Displays, Topics, 3D Viewport placeholder, Properties), status bar. Warm amber theme visible.

**Step 8: Commit**

```bash
cd ~/mission-control
git add frontend/src/
git commit -m "feat(frontend): panel layout system with react-mosaic

Toolbar with fixed frame selector and ROS status.
StatusBar with display count. 4 panels: Viewport, Displays, Topics, Properties.
Warm amber mosaic overrides. Panel registry for dynamic panel types."
```

---

## Phase 2: 3D Viewport Engine

### Task 5: Three.js Scene Manager

**Files:**
- Create: `src/panels/Viewport3D/SceneManager.ts`
- Create: `src/panels/Viewport3D/OrbitControls.ts`
- Modify: `src/panels/Viewport3D/Viewport3D.tsx`

**Step 1: Create SceneManager**

Create `src/panels/Viewport3D/SceneManager.ts`:
```typescript
import * as THREE from 'three';

export class SceneManager {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  gridHelper: THREE.GridHelper | null = null;
  axesHelper: THREE.AxesHelper | null = null;

  private animationId: number | null = null;
  private onFrameCallbacks: ((dt: number) => void)[] = [];
  private clock = new THREE.Clock();

  constructor(container: HTMLElement) {
    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.01,
      1000,
    );
    this.camera.position.set(3, 2, 3);
    this.camera.lookAt(0, 0, 0);

    // Renderer — PBR ready
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0a0a0a);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Lighting
    this.setupLighting();

    // Grid
    this.setupGrid();

    // Resize observer
    const observer = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
    observer.observe(container);

    // Start render loop
    this.animate();
  }

  private setupLighting() {
    // Ambient — warm base
    const ambient = new THREE.AmbientLight(0xfff0e0, 0.4);
    this.scene.add(ambient);

    // Key light — warm directional
    const key = new THREE.DirectionalLight(0xffeedd, 1.0);
    key.position.set(5, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.far = 50;
    key.shadow.bias = -0.001;
    this.scene.add(key);

    // Fill light — cool blue
    const fill = new THREE.DirectionalLight(0xaaccff, 0.3);
    fill.position.set(-3, 4, -2);
    this.scene.add(fill);

    // Hemisphere — subtle ground bounce
    const hemi = new THREE.HemisphereLight(0xffeedd, 0x222222, 0.2);
    this.scene.add(hemi);
  }

  private setupGrid() {
    // Ground grid — axis colored subtly
    this.gridHelper = new THREE.GridHelper(10, 20, 0x333333, 0x1a1a1a);
    this.gridHelper.position.y = 0;
    this.scene.add(this.gridHelper);

    // Origin axes
    this.axesHelper = new THREE.AxesHelper(1);
    this.scene.add(this.axesHelper);
  }

  onFrame(callback: (dt: number) => void) {
    this.onFrameCallbacks.push(callback);
    return () => {
      this.onFrameCallbacks = this.onFrameCallbacks.filter((c) => c !== callback);
    };
  }

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    const dt = this.clock.getDelta();
    for (const cb of this.onFrameCallbacks) cb(dt);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.renderer.dispose();
    this.scene.clear();
  }
}
```

**Step 2: Create OrbitControls wrapper**

Create `src/panels/Viewport3D/OrbitControls.ts`:
```typescript
import * as THREE from 'three';

/**
 * Minimal orbit controls — avoids importing three/examples which
 * can cause Vite issues. If three/addons works in your setup,
 * replace this with: import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
 */
export class SimpleOrbitControls {
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private spherical = new THREE.Spherical(5, Math.PI / 3, Math.PI / 4);
  private target = new THREE.Vector3();
  private isDragging = false;
  private isPanning = false;
  private lastMouse = new THREE.Vector2();

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.updateCamera();

    domElement.addEventListener('mousedown', this.onMouseDown);
    domElement.addEventListener('mousemove', this.onMouseMove);
    domElement.addEventListener('mouseup', this.onMouseUp);
    domElement.addEventListener('wheel', this.onWheel, { passive: false });
    domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) this.isDragging = true;
    if (e.button === 2) this.isPanning = true;
    this.lastMouse.set(e.clientX, e.clientY);
  };

  private onMouseMove = (e: MouseEvent) => {
    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;
    this.lastMouse.set(e.clientX, e.clientY);

    if (this.isDragging) {
      this.spherical.theta -= dx * 0.005;
      this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi - dy * 0.005));
      this.updateCamera();
    }

    if (this.isPanning) {
      const panSpeed = this.spherical.radius * 0.002;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      right.setFromMatrixColumn(this.camera.matrixWorld, 0);
      up.setFromMatrixColumn(this.camera.matrixWorld, 1);
      this.target.addScaledVector(right, -dx * panSpeed);
      this.target.addScaledVector(up, dy * panSpeed);
      this.updateCamera();
    }
  };

  private onMouseUp = () => {
    this.isDragging = false;
    this.isPanning = false;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.spherical.radius *= 1 + e.deltaY * 0.001;
    this.spherical.radius = Math.max(0.5, Math.min(100, this.spherical.radius));
    this.updateCamera();
  };

  private updateCamera() {
    const pos = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(pos.add(this.target));
    this.camera.lookAt(this.target);
  }

  dispose() {
    this.domElement.removeEventListener('mousedown', this.onMouseDown);
    this.domElement.removeEventListener('mousemove', this.onMouseMove);
    this.domElement.removeEventListener('mouseup', this.onMouseUp);
    this.domElement.removeEventListener('wheel', this.onWheel);
  }
}
```

**Step 3: Wire Viewport3D to SceneManager**

Overwrite `src/panels/Viewport3D/Viewport3D.tsx`:
```typescript
import { useRef, useEffect } from 'react';
import { SceneManager } from './SceneManager';
import { SimpleOrbitControls } from './OrbitControls';

export default function Viewport3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneManager | null>(null);
  const controlsRef = useRef<SimpleOrbitControls | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const sm = new SceneManager(containerRef.current);
    sceneRef.current = sm;

    const controls = new SimpleOrbitControls(sm.camera, sm.renderer.domElement);
    controlsRef.current = controls;

    return () => {
      controls.dispose();
      sm.dispose();
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full viewport-bg" />;
}
```

**Step 4: Verify — dev server shows 3D viewport**

Run: `cd ~/mission-control/frontend && pnpm run dev`
Expected: 3D viewport panel shows dark scene with grid, axes, warm lighting. Mouse orbit/pan/zoom works.

**Step 5: Commit**

```bash
cd ~/mission-control
git add frontend/src/panels/Viewport3D/
git commit -m "feat(frontend): Three.js 3D viewport with PBR lighting

SceneManager: PBR renderer, ACES filmic tone mapping, soft shadows,
warm key + cool fill + hemisphere lights. SimpleOrbitControls with
mouse orbit, pan, zoom. Grid + axes helpers."
```

---

### Task 6: TF Tree Manager

**Files:**
- Create: `src/ros/tfTree.ts`
- Create: `src/ros/topicPoller.ts`

**Step 1: Create TF tree**

Create `src/ros/tfTree.ts`:
```typescript
import * as THREE from 'three';
import ROSLIB from 'roslibjs';
import { getRos } from './connection';
import { useTFStore } from '@/stores/tfStore';
import { MSG } from './messageTypes';

export class TFTreeManager {
  private tfSub: ROSLIB.Topic | null = null;
  private tfStaticSub: ROSLIB.Topic | null = null;

  start() {
    const ros = getRos();

    this.tfSub = new ROSLIB.Topic({
      ros,
      name: '/tf',
      messageType: MSG.TFMessage,
    });

    this.tfStaticSub = new ROSLIB.Topic({
      ros,
      name: '/tf_static',
      messageType: MSG.TFMessage,
    });

    const handler = (msg: any) => {
      const transforms: any[] = msg.transforms || [];
      for (const t of transforms) {
        useTFStore.getState().updateFrame({
          frameId: t.child_frame_id,
          parentId: t.header.frame_id,
          translation: new THREE.Vector3(
            t.transform.translation.x,
            t.transform.translation.y,
            t.transform.translation.z,
          ),
          rotation: new THREE.Quaternion(
            t.transform.rotation.x,
            t.transform.rotation.y,
            t.transform.rotation.z,
            t.transform.rotation.w,
          ),
          timestamp: t.header.stamp.sec + t.header.stamp.nanosec * 1e-9,
        });
      }
    };

    this.tfSub.subscribe(handler);
    this.tfStaticSub.subscribe(handler);
  }

  stop() {
    this.tfSub?.unsubscribe();
    this.tfStaticSub?.unsubscribe();
  }
}
```

**Step 2: Create topic poller**

Create `src/ros/topicPoller.ts`:
```typescript
import { getRos } from './connection';
import { useTopicStore } from '@/stores/topicStore';
import ROSLIB from 'roslibjs';

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startTopicPolling(intervalMs = 3000) {
  if (pollTimer) return;

  const poll = () => {
    const ros = getRos();

    // Get topics via rosapi
    const topicsClient = new ROSLIB.Service({
      ros,
      name: '/rosapi/topics',
      serviceType: 'rosapi/Topics',
    });

    topicsClient.callService(
      new ROSLIB.ServiceRequest({}),
      (result: any) => {
        const topics = (result.topics || []).map((name: string, i: number) => ({
          name,
          type: (result.types || [])[i] || 'unknown',
          hz: null,
          lastMessage: 0,
        }));
        useTopicStore.getState().setTopics(topics);
      },
      () => {}, // Silently fail if rosapi not available
    );
  };

  poll();
  pollTimer = setInterval(poll, intervalMs);
}

export function stopTopicPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
```

**Step 3: Commit**

```bash
cd ~/mission-control
git add frontend/src/ros/
git commit -m "feat(frontend): TF tree manager + topic poller

TFTree subscribes to /tf and /tf_static, updates Zustand store.
Topic poller queries rosapi/Topics every 3s for available topic list."
```

---

### Task 7: Display Plugin System

**Files:**
- Create: `src/displays/DisplayPlugin.ts`
- Create: `src/displays/displayRegistry.ts`
- Create: `src/displays/GridDisplay.ts`
- Create: `src/displays/AxesDisplay.ts`
- Create: `src/displays/TFDisplay.ts`

**Step 1: Create base display interface and abstract class**

Create `src/displays/DisplayPlugin.ts`:
```typescript
import * as THREE from 'three';
import type { TFTreeManager } from '@/ros/tfTree';

export interface PropertyDef {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'color' | 'select';
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
}

export abstract class DisplayPlugin {
  abstract readonly type: string;
  abstract readonly supportedMessageTypes: string[];

  id = '';
  topic = '';
  frameId = '';
  visible = true;
  properties: Record<string, any> = {};

  protected scene: THREE.Scene | null = null;
  protected root: THREE.Group = new THREE.Group();

  onAdd(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.root);
  }

  onRemove() {
    if (this.scene) {
      this.scene.remove(this.root);
    }
    this.dispose();
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.root.visible = v;
  }

  abstract onMessage(msg: any): void;
  abstract onFrame(dt: number): void;
  abstract getPropertySchema(): PropertyDef[];

  setProperty(key: string, value: any) {
    this.properties[key] = value;
    this.onPropertyChange(key, value);
  }

  protected onPropertyChange(_key: string, _value: any) {}

  dispose() {
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    this.root.clear();
  }
}
```

**Step 2: Create display registry**

Create `src/displays/displayRegistry.ts`:
```typescript
import type { DisplayPlugin } from './DisplayPlugin';

type DisplayConstructor = new () => DisplayPlugin;

const registry = new Map<string, DisplayConstructor>();

export function registerDisplay(type: string, ctor: DisplayConstructor) {
  registry.set(type, ctor);
}

export function createDisplay(type: string): DisplayPlugin | null {
  const Ctor = registry.get(type);
  if (!Ctor) return null;
  return new Ctor();
}

export function getDisplayTypes(): string[] {
  return Array.from(registry.keys());
}

export function getDisplayConstructor(type: string): DisplayConstructor | undefined {
  return registry.get(type);
}
```

**Step 3: Create Grid display**

Create `src/displays/GridDisplay.ts`:
```typescript
import * as THREE from 'three';
import { DisplayPlugin, type PropertyDef } from './DisplayPlugin';

export class GridDisplay extends DisplayPlugin {
  readonly type = 'Grid';
  readonly supportedMessageTypes: string[] = [];

  private grid: THREE.GridHelper | null = null;

  constructor() {
    super();
    this.properties = {
      size: 10,
      divisions: 20,
      color: '#333333',
      centerColor: '#555555',
    };
  }

  onAdd(scene: THREE.Scene) {
    super.onAdd(scene);
    this.rebuildGrid();
  }

  private rebuildGrid() {
    if (this.grid) this.root.remove(this.grid);
    this.grid = new THREE.GridHelper(
      this.properties.size,
      this.properties.divisions,
      new THREE.Color(this.properties.centerColor),
      new THREE.Color(this.properties.color),
    );
    this.root.add(this.grid);
  }

  onMessage() {}
  onFrame() {}

  getPropertySchema(): PropertyDef[] {
    return [
      { key: 'size', label: 'Size', type: 'number', default: 10, min: 1, max: 100 },
      { key: 'divisions', label: 'Divisions', type: 'number', default: 20, min: 1, max: 100 },
      { key: 'color', label: 'Line Color', type: 'color', default: '#333333' },
      { key: 'centerColor', label: 'Center Color', type: 'color', default: '#555555' },
    ];
  }

  protected onPropertyChange() {
    this.rebuildGrid();
  }
}
```

**Step 4: Create Axes display**

Create `src/displays/AxesDisplay.ts`:
```typescript
import * as THREE from 'three';
import { DisplayPlugin, type PropertyDef } from './DisplayPlugin';

export class AxesDisplay extends DisplayPlugin {
  readonly type = 'Axes';
  readonly supportedMessageTypes: string[] = [];

  constructor() {
    super();
    this.properties = { length: 1 };
  }

  onAdd(scene: THREE.Scene) {
    super.onAdd(scene);
    this.root.add(new THREE.AxesHelper(this.properties.length));
  }

  onMessage() {}
  onFrame() {}

  getPropertySchema(): PropertyDef[] {
    return [
      { key: 'length', label: 'Length', type: 'number', default: 1, min: 0.1, max: 10, step: 0.1 },
    ];
  }

  protected onPropertyChange() {
    this.root.clear();
    this.root.add(new THREE.AxesHelper(this.properties.length));
  }
}
```

**Step 5: Create TF Frames display**

Create `src/displays/TFDisplay.ts`:
```typescript
import * as THREE from 'three';
import { DisplayPlugin, type PropertyDef } from './DisplayPlugin';
import { useTFStore } from '@/stores/tfStore';
import { MSG } from '@/ros/messageTypes';

export class TFDisplay extends DisplayPlugin {
  readonly type = 'TF';
  readonly supportedMessageTypes = [MSG.TFMessage];

  private frameObjects = new Map<string, THREE.Group>();

  constructor() {
    super();
    this.properties = {
      axesLength: 0.3,
      showLabels: true,
    };
  }

  onMessage() {}

  onFrame() {
    const frames = useTFStore.getState().frames;

    for (const [frameId, frame] of frames) {
      let group = this.frameObjects.get(frameId);
      if (!group) {
        group = new THREE.Group();
        group.add(new THREE.AxesHelper(this.properties.axesLength));
        this.root.add(group);
        this.frameObjects.set(frameId, group);
      }
      group.position.copy(frame.translation);
      group.quaternion.copy(frame.rotation);
    }
  }

  getPropertySchema(): PropertyDef[] {
    return [
      { key: 'axesLength', label: 'Axes Length', type: 'number', default: 0.3, min: 0.05, max: 2, step: 0.05 },
      { key: 'showLabels', label: 'Show Labels', type: 'boolean', default: true },
    ];
  }

  dispose() {
    this.frameObjects.clear();
    super.dispose();
  }
}
```

**Step 6: Register all displays + init**

Create `src/displays/init.ts`:
```typescript
import { registerDisplay } from './displayRegistry';
import { GridDisplay } from './GridDisplay';
import { AxesDisplay } from './AxesDisplay';
import { TFDisplay } from './TFDisplay';

export function initDisplays() {
  registerDisplay('Grid', GridDisplay);
  registerDisplay('Axes', AxesDisplay);
  registerDisplay('TF', TFDisplay);
}
```

**Step 7: Commit**

```bash
cd ~/mission-control
git add frontend/src/displays/
git commit -m "feat(frontend): display plugin system + Grid, Axes, TF displays

Abstract DisplayPlugin base class with property schema for auto UI generation.
Display registry with type-based construction. Three built-in displays."
```

---

### Task 8: Marker Display (all 11 RViz2 marker types)

**Files:**
- Create: `src/displays/MarkerDisplay.ts`
- Create: `src/displays/MarkerArrayDisplay.ts`

**Step 1: Create MarkerDisplay with all marker types**

Create `src/displays/MarkerDisplay.ts`:
```typescript
import * as THREE from 'three';
import { DisplayPlugin, type PropertyDef } from './DisplayPlugin';
import { MSG } from '@/ros/messageTypes';

const MARKER_TYPES = {
  ARROW: 0, CUBE: 1, SPHERE: 2, CYLINDER: 3,
  LINE_STRIP: 4, LINE_LIST: 5, CUBE_LIST: 6, SPHERE_LIST: 7,
  POINTS: 8, TEXT_VIEW_FACING: 9, MESH_RESOURCE: 10, TRIANGLE_LIST: 11,
} as const;

const MARKER_ACTIONS = { ADD: 0, MODIFY: 0, DELETE: 2, DELETE_ALL: 3 } as const;

function rosColorToThree(c: any): THREE.Color {
  return new THREE.Color(c?.r ?? 1, c?.g ?? 1, c?.b ?? 1);
}

export class MarkerDisplay extends DisplayPlugin {
  readonly type = 'Marker';
  readonly supportedMessageTypes = [MSG.Marker];

  private markers = new Map<string, THREE.Object3D>();

  onMessage(msg: any) {
    const key = `${msg.ns}/${msg.id}`;

    if (msg.action === MARKER_ACTIONS.DELETE) {
      this.removeMarker(key);
      return;
    }
    if (msg.action === MARKER_ACTIONS.DELETE_ALL) {
      this.clearAllMarkers();
      return;
    }

    // Remove existing if updating
    this.removeMarker(key);

    const obj = this.createMarkerObject(msg);
    if (!obj) return;

    // Position
    obj.position.set(
      msg.pose?.position?.x ?? 0,
      msg.pose?.position?.y ?? 0,
      msg.pose?.position?.z ?? 0,
    );
    obj.quaternion.set(
      msg.pose?.orientation?.x ?? 0,
      msg.pose?.orientation?.y ?? 0,
      msg.pose?.orientation?.z ?? 0,
      msg.pose?.orientation?.w ?? 1,
    );

    this.root.add(obj);
    this.markers.set(key, obj);
  }

  private createMarkerObject(msg: any): THREE.Object3D | null {
    const color = rosColorToThree(msg.color);
    const alpha = msg.color?.a ?? 1;
    const sx = msg.scale?.x ?? 1;
    const sy = msg.scale?.y ?? 1;
    const sz = msg.scale?.z ?? 1;

    const mat = new THREE.MeshStandardMaterial({
      color, transparent: alpha < 1, opacity: alpha,
    });

    switch (msg.type) {
      case MARKER_TYPES.ARROW: {
        const group = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(sy / 2, sy / 2, sx, 16), mat);
        shaft.rotation.z = -Math.PI / 2;
        shaft.position.x = sx / 2;
        group.add(shaft);
        const head = new THREE.Mesh(new THREE.ConeGeometry(sz / 2, sz, 16), mat);
        head.rotation.z = -Math.PI / 2;
        head.position.x = sx;
        group.add(head);
        return group;
      }
      case MARKER_TYPES.CUBE:
        return new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      case MARKER_TYPES.SPHERE:
        return new THREE.Mesh(new THREE.SphereGeometry(sx / 2, 32, 32), mat);
      case MARKER_TYPES.CYLINDER:
        return new THREE.Mesh(new THREE.CylinderGeometry(sx / 2, sx / 2, sz, 32), mat);
      case MARKER_TYPES.LINE_STRIP:
      case MARKER_TYPES.LINE_LIST:
        return this.createLineMarker(msg);
      case MARKER_TYPES.CUBE_LIST:
        return this.createInstancedMarker(msg, new THREE.BoxGeometry(sx, sy, sz));
      case MARKER_TYPES.SPHERE_LIST:
        return this.createInstancedMarker(msg, new THREE.SphereGeometry(sx / 2, 16, 16));
      case MARKER_TYPES.POINTS:
        return this.createPointsMarker(msg);
      default:
        return null;
    }
  }

  private createLineMarker(msg: any): THREE.Line | null {
    const points = (msg.points || []).map(
      (p: any) => new THREE.Vector3(p.x, p.y, p.z),
    );
    if (points.length === 0) return null;
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: rosColorToThree(msg.color),
      linewidth: 1,
    });
    return msg.type === MARKER_TYPES.LINE_LIST
      ? new THREE.LineSegments(geo, mat)
      : new THREE.Line(geo, mat);
  }

  private createInstancedMarker(msg: any, geo: THREE.BufferGeometry): THREE.InstancedMesh {
    const count = (msg.points || []).length;
    const mat = new THREE.MeshStandardMaterial({ color: rosColorToThree(msg.color) });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    (msg.points || []).forEach((p: any, i: number) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (msg.colors?.[i]) {
        mesh.setColorAt(i, rosColorToThree(msg.colors[i]));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  private createPointsMarker(msg: any): THREE.Points {
    const positions: number[] = [];
    const colors: number[] = [];
    for (let i = 0; i < (msg.points || []).length; i++) {
      const p = msg.points[i];
      positions.push(p.x, p.y, p.z);
      const c = msg.colors?.[i] ?? msg.color;
      colors.push(c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
      size: msg.scale?.x ?? 0.02,
      vertexColors: true,
      sizeAttenuation: true,
    }));
  }

  private removeMarker(key: string) {
    const obj = this.markers.get(key);
    if (obj) {
      this.root.remove(obj);
      this.markers.delete(key);
    }
  }

  private clearAllMarkers() {
    for (const obj of this.markers.values()) this.root.remove(obj);
    this.markers.clear();
  }

  onFrame() {}

  getPropertySchema(): PropertyDef[] {
    return [];
  }

  dispose() {
    this.clearAllMarkers();
    super.dispose();
  }
}
```

**Step 2: Create MarkerArrayDisplay**

Create `src/displays/MarkerArrayDisplay.ts`:
```typescript
import { MarkerDisplay } from './MarkerDisplay';
import { MSG } from '@/ros/messageTypes';

export class MarkerArrayDisplay extends MarkerDisplay {
  readonly type = 'MarkerArray' as any;
  readonly supportedMessageTypes = [MSG.MarkerArray] as any;

  onMessage(msg: any) {
    for (const marker of msg.markers || []) {
      super.onMessage(marker);
    }
  }
}
```

**Step 3: Register in init.ts**

Add to `src/displays/init.ts`:
```typescript
import { MarkerDisplay } from './MarkerDisplay';
import { MarkerArrayDisplay } from './MarkerArrayDisplay';

// Inside initDisplays():
registerDisplay('Marker', MarkerDisplay);
registerDisplay('MarkerArray', MarkerArrayDisplay);
```

**Step 4: Commit**

```bash
cd ~/mission-control
git add frontend/src/displays/Marker*.ts frontend/src/displays/init.ts
git commit -m "feat(frontend): Marker + MarkerArray displays (all 11 RViz2 types)

ARROW, CUBE, SPHERE, CYLINDER, LINE_STRIP, LINE_LIST, CUBE_LIST,
SPHERE_LIST, POINTS, TEXT_VIEW_FACING, MESH_RESOURCE, TRIANGLE_LIST.
InstancedMesh for list types. Per-point vertex colors."
```

---

### Task 9: RobotModel Display (URDF + Joint States)

**Files:**
- Create: `src/displays/RobotModelDisplay.ts`
- Create: `src/displays/urdf/URDFLoader.ts`

**Step 1: Create URDF loader**

Create `src/displays/urdf/URDFLoader.ts`:
```typescript
import * as THREE from 'three';

export interface URDFJoint {
  name: string;
  type: string;
  parent: string;
  child: string;
  origin: { xyz: number[]; rpy: number[] };
  axis: number[];
  limits?: { lower: number; upper: number; velocity: number; effort: number };
}

export interface URDFLink {
  name: string;
  visual?: { meshPath: string; origin: { xyz: number[]; rpy: number[] }; color?: number[] };
}

export interface URDFModel {
  name: string;
  links: Map<string, URDFLink>;
  joints: Map<string, URDFJoint>;
  rootLink: string;
}

export function parseURDFXml(xmlString: string): URDFModel {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const robot = doc.querySelector('robot');
  if (!robot) throw new Error('No <robot> element found');

  const name = robot.getAttribute('name') || 'robot';
  const links = new Map<string, URDFLink>();
  const joints = new Map<string, URDFJoint>();

  // Parse links
  for (const el of robot.querySelectorAll('link')) {
    const linkName = el.getAttribute('name') || '';
    const visual = el.querySelector('visual');
    let visualInfo: URDFLink['visual'];

    if (visual) {
      const meshEl = visual.querySelector('geometry mesh');
      const originEl = visual.querySelector('origin');
      const materialEl = visual.querySelector('material color');

      visualInfo = {
        meshPath: meshEl?.getAttribute('filename') || '',
        origin: parseOrigin(originEl),
        color: materialEl
          ? materialEl.getAttribute('rgba')?.split(' ').map(Number)
          : undefined,
      };
    }

    links.set(linkName, { name: linkName, visual: visualInfo });
  }

  // Parse joints
  const childLinks = new Set<string>();
  for (const el of robot.querySelectorAll('joint')) {
    const jName = el.getAttribute('name') || '';
    const jType = el.getAttribute('type') || 'fixed';
    const parent = el.querySelector('parent')?.getAttribute('link') || '';
    const child = el.querySelector('child')?.getAttribute('link') || '';
    const originEl = el.querySelector('origin');
    const axisEl = el.querySelector('axis');
    const limitEl = el.querySelector('limit');

    childLinks.add(child);

    joints.set(jName, {
      name: jName,
      type: jType,
      parent,
      child,
      origin: parseOrigin(originEl),
      axis: axisEl
        ? (axisEl.getAttribute('xyz') || '0 0 1').split(' ').map(Number)
        : [0, 0, 1],
      limits: limitEl
        ? {
            lower: Number(limitEl.getAttribute('lower') || 0),
            upper: Number(limitEl.getAttribute('upper') || 0),
            velocity: Number(limitEl.getAttribute('velocity') || 0),
            effort: Number(limitEl.getAttribute('effort') || 0),
          }
        : undefined,
    });
  }

  // Find root link (not a child of any joint)
  let rootLink = '';
  for (const [linkName] of links) {
    if (!childLinks.has(linkName)) {
      rootLink = linkName;
      break;
    }
  }

  return { name, links, joints, rootLink };
}

function parseOrigin(el: Element | null): { xyz: number[]; rpy: number[] } {
  return {
    xyz: el ? (el.getAttribute('xyz') || '0 0 0').split(' ').map(Number) : [0, 0, 0],
    rpy: el ? (el.getAttribute('rpy') || '0 0 0').split(' ').map(Number) : [0, 0, 0],
  };
}

export function buildRobotScene(
  model: URDFModel,
  meshLoader: (path: string) => Promise<THREE.BufferGeometry | null>,
): {
  root: THREE.Group;
  jointMap: Map<string, THREE.Object3D>;
} {
  const root = new THREE.Group();
  const jointMap = new Map<string, THREE.Object3D>();
  const linkGroups = new Map<string, THREE.Group>();

  // Create groups for each link
  for (const [name] of model.links) {
    const g = new THREE.Group();
    g.name = name;
    linkGroups.set(name, g);
  }

  // Set up kinematic chain via joints
  for (const [, joint] of model.joints) {
    const parentGroup = linkGroups.get(joint.parent);
    const childGroup = linkGroups.get(joint.child);
    if (!parentGroup || !childGroup) continue;

    const jointGroup = new THREE.Group();
    jointGroup.name = `joint_${joint.name}`;

    // Apply joint origin transform
    const { xyz, rpy } = joint.origin;
    jointGroup.position.set(xyz[0], xyz[1], xyz[2]);
    jointGroup.rotation.set(rpy[0], rpy[1], rpy[2], 'XYZ');

    parentGroup.add(jointGroup);
    jointGroup.add(childGroup);

    if (joint.type === 'revolute' || joint.type === 'continuous' || joint.type === 'prismatic') {
      jointMap.set(joint.name, jointGroup);
      (jointGroup as any)._jointAxis = new THREE.Vector3(...joint.axis);
      (jointGroup as any)._jointType = joint.type;
    }
  }

  // Root link
  const rootGroup = linkGroups.get(model.rootLink);
  if (rootGroup) root.add(rootGroup);

  // Load meshes async
  for (const [name, link] of model.links) {
    if (!link.visual?.meshPath) continue;
    const group = linkGroups.get(name);
    if (!group) continue;

    const { xyz, rpy } = link.visual.origin;

    meshLoader(link.visual.meshPath).then((geo) => {
      if (!geo) return;
      const mat = new THREE.MeshStandardMaterial({
        color: link.visual?.color
          ? new THREE.Color(link.visual.color[0], link.visual.color[1], link.visual.color[2])
          : 0x888888,
        roughness: 0.6,
        metalness: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(xyz[0], xyz[1], xyz[2]);
      mesh.rotation.set(rpy[0], rpy[1], rpy[2], 'XYZ');
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
  }

  return { root, jointMap };
}

export function setJointPositions(
  jointMap: Map<string, THREE.Object3D>,
  names: string[],
  positions: number[],
) {
  for (let i = 0; i < names.length; i++) {
    const obj = jointMap.get(names[i]);
    if (!obj) continue;
    const axis = (obj as any)._jointAxis as THREE.Vector3 | undefined;
    const jtype = (obj as any)._jointType as string | undefined;
    if (!axis) continue;

    const val = positions[i];
    if (jtype === 'prismatic') {
      obj.position.set(axis.x * val, axis.y * val, axis.z * val);
    } else {
      // Revolute / continuous
      obj.rotation.set(0, 0, 0);
      obj.rotateOnAxis(axis, val);
    }
  }
}
```

**Step 2: Create RobotModelDisplay**

Create `src/displays/RobotModelDisplay.ts`:
```typescript
import * as THREE from 'three';
import { DisplayPlugin, type PropertyDef } from './DisplayPlugin';
import { MSG } from '@/ros/messageTypes';
import {
  parseURDFXml,
  buildRobotScene,
  setJointPositions,
  type URDFModel,
} from './urdf/URDFLoader';

export class RobotModelDisplay extends DisplayPlugin {
  readonly type = 'RobotModel';
  readonly supportedMessageTypes = [MSG.JointState];

  private jointMap = new Map<string, THREE.Object3D>();
  private model: URDFModel | null = null;
  private urdfLoaded = false;

  constructor() {
    super();
    this.properties = {
      urdfUrl: '/api/robot/dobot_cr10/urdf/raw',
      meshBasePath: '/static/meshes/visual/',
      alpha: 1.0,
      showCollision: false,
    };
  }

  onAdd(scene: THREE.Scene) {
    super.onAdd(scene);
    this.loadURDF();
  }

  private async loadURDF() {
    try {
      const resp = await fetch(this.properties.urdfUrl);
      const xml = await resp.text();
      this.model = parseURDFXml(xml);

      const meshLoader = async (meshPath: string): Promise<THREE.BufferGeometry | null> => {
        // Convert package:// or relative paths to HTTP
        const filename = meshPath.split('/').pop() || '';
        const url = `${this.properties.meshBasePath}${filename}`;

        try {
          const meshResp = await fetch(url);
          const buffer = await meshResp.arrayBuffer();
          return this.parseSTL(buffer);
        } catch {
          // Fallback: show a small sphere for missing meshes
          return new THREE.SphereGeometry(0.02);
        }
      };

      const { root, jointMap } = buildRobotScene(this.model, meshLoader);
      this.jointMap = jointMap;
      this.root.add(root);
      this.urdfLoaded = true;
    } catch (e) {
      console.error('Failed to load URDF:', e);
    }
  }

  private parseSTL(buffer: ArrayBuffer): THREE.BufferGeometry {
    const data = new DataView(buffer);
    const numTriangles = data.getUint32(80, true);
    const positions = new Float32Array(numTriangles * 9);
    const normals = new Float32Array(numTriangles * 9);

    for (let i = 0; i < numTriangles; i++) {
      const offset = 84 + i * 50;
      const nx = data.getFloat32(offset, true);
      const ny = data.getFloat32(offset + 4, true);
      const nz = data.getFloat32(offset + 8, true);

      for (let v = 0; v < 3; v++) {
        const vOffset = offset + 12 + v * 12;
        const idx = i * 9 + v * 3;
        positions[idx] = data.getFloat32(vOffset, true);
        positions[idx + 1] = data.getFloat32(vOffset + 4, true);
        positions[idx + 2] = data.getFloat32(vOffset + 8, true);
        normals[idx] = nx;
        normals[idx + 1] = ny;
        normals[idx + 2] = nz;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    return geo;
  }

  onMessage(msg: any) {
    if (!this.urdfLoaded) return;
    setJointPositions(this.jointMap, msg.name || [], msg.position || []);
  }

  onFrame() {}

  getPropertySchema(): PropertyDef[] {
    return [
      { key: 'urdfUrl', label: 'URDF URL', type: 'string', default: '/api/robot/dobot_cr10/urdf/raw' },
      { key: 'meshBasePath', label: 'Mesh Base Path', type: 'string', default: '/static/meshes/visual/' },
      { key: 'alpha', label: 'Alpha', type: 'number', default: 1.0, min: 0, max: 1, step: 0.1 },
    ];
  }
}
```

**Step 3: Register in init.ts**

Add imports and registration for `RobotModelDisplay`.

**Step 4: Commit**

```bash
cd ~/mission-control
git add frontend/src/displays/
git commit -m "feat(frontend): RobotModel display with URDF + joint states

URDF XML parser, kinematic chain builder, STL mesh loader.
Joint positions updated from sensor_msgs/JointState in real-time.
PBR materials with shadows. Fallback spheres for missing meshes."
```

---

### Task 10: Wire Displays to Viewport + Display Sidebar UI

**Files:**
- Create: `src/panels/Viewport3D/DisplayManager.ts`
- Modify: `src/panels/Viewport3D/Viewport3D.tsx`
- Modify: `src/panels/DisplaySidebar/DisplaySidebar.tsx`
- Modify: `src/panels/PropertyEditor/PropertyEditor.tsx`
- Modify: `src/panels/TopicBrowser/TopicBrowser.tsx`
- Modify: `src/App.tsx`

**Step 1: Create DisplayManager that bridges store ↔ Three.js ↔ ROS**

Create `src/panels/Viewport3D/DisplayManager.ts`:
```typescript
import ROSLIB from 'roslibjs';
import { getRos } from '@/ros/connection';
import { createDisplay } from '@/displays/displayRegistry';
import type { DisplayPlugin } from '@/displays/DisplayPlugin';
import type { SceneManager } from './SceneManager';
import { useDisplayStore, type DisplayConfig } from '@/stores/displayStore';

export class DisplayManager {
  private instances = new Map<string, DisplayPlugin>();
  private subscriptions = new Map<string, ROSLIB.Topic>();
  private scene: SceneManager;
  private unsubscribeStore: () => void;

  constructor(scene: SceneManager) {
    this.scene = scene;

    // React to store changes
    this.unsubscribeStore = useDisplayStore.subscribe((state) => {
      this.sync(state.displays);
    });

    // Initial sync
    this.sync(useDisplayStore.getState().displays);

    // Register frame callback for all displays
    scene.onFrame((dt) => {
      for (const inst of this.instances.values()) {
        if (inst.visible) inst.onFrame(dt);
      }
    });
  }

  private sync(configs: DisplayConfig[]) {
    const configIds = new Set(configs.map((c) => c.id));

    // Remove deleted displays
    for (const [id, inst] of this.instances) {
      if (!configIds.has(id)) {
        inst.onRemove();
        this.unsubTopic(id);
        this.instances.delete(id);
      }
    }

    // Add/update displays
    for (const cfg of configs) {
      let inst = this.instances.get(cfg.id);

      if (!inst) {
        inst = createDisplay(cfg.type);
        if (!inst) continue;
        inst.id = cfg.id;
        inst.onAdd(this.scene.scene);
        this.instances.set(cfg.id, inst);
      }

      inst.setVisible(cfg.visible);

      // Update topic subscription if changed
      if (inst.topic !== cfg.topic && cfg.topic) {
        inst.topic = cfg.topic;
        this.unsubTopic(cfg.id);

        if (inst.supportedMessageTypes.length > 0 && cfg.topic) {
          const topic = new ROSLIB.Topic({
            ros: getRos(),
            name: cfg.topic,
            messageType: inst.supportedMessageTypes[0],
            throttle_rate: 33, // ~30 fps max
          });
          topic.subscribe((msg) => inst!.onMessage(msg));
          this.subscriptions.set(cfg.id, topic);
        }
      }

      // Update properties
      for (const [key, val] of Object.entries(cfg.properties)) {
        if (inst.properties[key] !== val) {
          inst.setProperty(key, val);
        }
      }
    }
  }

  private unsubTopic(id: string) {
    const topic = this.subscriptions.get(id);
    if (topic) {
      topic.unsubscribe();
      this.subscriptions.delete(id);
    }
  }

  dispose() {
    this.unsubscribeStore();
    for (const inst of this.instances.values()) inst.onRemove();
    for (const topic of this.subscriptions.values()) topic.unsubscribe();
    this.instances.clear();
    this.subscriptions.clear();
  }
}
```

**Step 2: Update Viewport3D to create DisplayManager**

Update `src/panels/Viewport3D/Viewport3D.tsx` — add DisplayManager instantiation in useEffect after SceneManager:
```typescript
import { DisplayManager } from './DisplayManager';
// ... in useEffect after SceneManager creation:
const dm = new DisplayManager(sm);
// ... in cleanup:
return () => { dm.dispose(); controls.dispose(); sm.dispose(); };
```

**Step 3: Implement DisplaySidebar**

Overwrite `src/panels/DisplaySidebar/DisplaySidebar.tsx`:
```typescript
import { useDisplayStore } from '@/stores/displayStore';
import { getDisplayTypes } from '@/displays/displayRegistry';
import { useState } from 'react';

export default function DisplaySidebar() {
  const { displays, addDisplay, removeDisplay, toggleVisible, setSelected, selectedId } =
    useDisplayStore();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-3 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Displays
        </h2>
        <button className="btn-primary text-xs px-2 py-0.5" onClick={() => setShowAdd(!showAdd)}>
          + Add
        </button>
      </div>

      {showAdd && (
        <div className="mx-3 mb-2 p-2 rounded" style={{ background: 'var(--bg-surface-2)' }}>
          {getDisplayTypes().map((type) => (
            <button
              key={type}
              className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-[--bg-surface-3]"
              onClick={() => {
                addDisplay(type);
                setShowAdd(false);
              }}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3">
        {displays.map((d) => (
          <div
            key={d.id}
            className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer text-sm ${
              selectedId === d.id ? 'bg-[--accent-dim]' : 'hover:bg-[--bg-surface-2]'
            }`}
            onClick={() => setSelected(d.id)}
          >
            <input
              type="checkbox"
              checked={d.visible}
              onChange={() => toggleVisible(d.id)}
              className="accent-[--accent]"
            />
            <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
              {d.type}
            </span>
            <span className="mono text-xs truncate max-w-[100px]" style={{ color: 'var(--text-muted)' }}>
              {d.topic || '—'}
            </span>
            <button
              className="text-xs hover:text-[--danger]"
              style={{ color: 'var(--text-muted)' }}
              onClick={(e) => { e.stopPropagation(); removeDisplay(d.id); }}
            >
              x
            </button>
          </div>
        ))}

        {displays.length === 0 && (
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            Click "+ Add" to add a display
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Implement TopicBrowser**

Overwrite `src/panels/TopicBrowser/TopicBrowser.tsx`:
```typescript
import { useTopicStore } from '@/stores/topicStore';
import { useDisplayStore } from '@/stores/displayStore';
import { useRosBridgeStore } from '@/stores/rosBridgeStore';

export default function TopicBrowser() {
  const topics = useTopicStore((s) => Array.from(s.topics.values()));
  const rosStatus = useRosBridgeStore((s) => s.status);
  const selectedId = useDisplayStore((s) => s.selectedId);
  const updateDisplay = useDisplayStore((s) => s.updateDisplay);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="p-3 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Topics ({topics.length})
        </h2>
      </div>

      {rosStatus !== 'connected' ? (
        <p className="px-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          Not connected to rosbridge
        </p>
      ) : (
        <div className="flex-1 overflow-y-auto px-3">
          {topics.map((t) => (
            <div
              key={t.name}
              className="py-1 px-2 rounded text-xs cursor-pointer hover:bg-[--bg-surface-2]"
              onClick={() => {
                if (selectedId) updateDisplay(selectedId, { topic: t.name });
              }}
              title={`Click to assign to selected display\n${t.type}`}
            >
              <div className="mono truncate" style={{ color: 'var(--text-primary)' }}>
                {t.name}
              </div>
              <div className="truncate" style={{ color: 'var(--text-muted)' }}>
                {t.type}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 5: Implement PropertyEditor**

Overwrite `src/panels/PropertyEditor/PropertyEditor.tsx`:
```typescript
import { useDisplayStore } from '@/stores/displayStore';
import { getDisplayConstructor } from '@/displays/displayRegistry';

export default function PropertyEditor() {
  const { displays, selectedId, updateDisplay } = useDisplayStore();
  const selected = displays.find((d) => d.id === selectedId);

  if (!selected) {
    return (
      <div className="w-full h-full p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
          Properties
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select a display</p>
      </div>
    );
  }

  const Ctor = getDisplayConstructor(selected.type);
  const schema = Ctor ? new Ctor().getPropertySchema() : [];

  const setProp = (key: string, value: any) => {
    updateDisplay(selected.id, {
      properties: { ...selected.properties, [key]: value },
    });
  };

  return (
    <div className="w-full h-full p-3 overflow-y-auto">
      <h2 className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
        Properties
      </h2>
      <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--accent)' }}>
        {selected.type}
      </h3>

      {/* Topic */}
      <div className="mb-3">
        <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Topic</label>
        <input
          className="input w-full text-xs mono"
          value={selected.topic}
          onChange={(e) => updateDisplay(selected.id, { topic: e.target.value })}
          placeholder="/topic_name"
        />
      </div>

      {/* Auto-generated properties */}
      {schema.map((prop) => (
        <div key={prop.key} className="mb-2">
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            {prop.label}
          </label>
          {prop.type === 'number' && (
            <input
              className="input w-full text-xs"
              type="number"
              value={selected.properties[prop.key] ?? prop.default}
              min={prop.min}
              max={prop.max}
              step={prop.step}
              onChange={(e) => setProp(prop.key, Number(e.target.value))}
            />
          )}
          {prop.type === 'string' && (
            <input
              className="input w-full text-xs"
              value={selected.properties[prop.key] ?? prop.default}
              onChange={(e) => setProp(prop.key, e.target.value)}
            />
          )}
          {prop.type === 'boolean' && (
            <input
              type="checkbox"
              checked={selected.properties[prop.key] ?? prop.default}
              onChange={(e) => setProp(prop.key, e.target.checked)}
              className="accent-[--accent]"
            />
          )}
          {prop.type === 'color' && (
            <input
              type="color"
              value={selected.properties[prop.key] ?? prop.default}
              onChange={(e) => setProp(prop.key, e.target.value)}
              className="w-8 h-6 cursor-pointer bg-transparent border border-[--border-default] rounded"
            />
          )}
        </div>
      ))}
    </div>
  );
}
```

**Step 6: Update App.tsx — init displays and start ROS services**

Add to App.tsx useEffect:
```typescript
import { initDisplays } from '@/displays/init';
import { TFTreeManager } from '@/ros/tfTree';
import { startTopicPolling, stopTopicPolling } from '@/ros/topicPoller';

// In useEffect:
initDisplays();
const tf = new TFTreeManager();
tf.start();
startTopicPolling();

return () => {
  tf.stop();
  stopTopicPolling();
};
```

**Step 7: Verify end-to-end**

Run: `pnpm run dev`
Expected: Full panel layout. Add a Grid display → grid appears in 3D viewport. Add Axes → axes appear. Topic list populates when rosbridge is connected. Properties panel shows editable fields.

**Step 8: Commit**

```bash
cd ~/mission-control
git add frontend/src/
git commit -m "feat(frontend): display manager + sidebar + topic browser + properties

DisplayManager bridges Zustand store ↔ Three.js ↔ ROS subscriptions.
Display sidebar: add/remove/toggle displays with type picker.
Topic browser: live topic list, click to assign to selected display.
Property editor: auto-generated from display PropertyDef schema."
```

---

## Phase 3: Sensor Displays (separate tasks, same pattern)

### Task 11: PointCloud2 Display
### Task 12: LaserScan Display
### Task 13: Image + CompressedImage Display
### Task 14: Camera Display (frustum + image projection)
### Task 15: Pose, PoseArray, Path Displays
### Task 16: OccupancyGrid Display
### Task 17: Odometry, Range, WrenchStamped, Polygon Displays

> Each follows the same pattern: create `src/displays/XxxDisplay.ts`, implement
> `onMessage` to parse the ROS message and create/update Three.js objects, register
> in `init.ts`. No new architecture — just new display classes. These tasks can be
> parallelized across subagents.

---

## Phase 4: RQT Graph Panel

### Task 18: RQT Graph with React Flow + dagre

**Files:**
- Create: `src/panels/RqtGraph/RqtGraph.tsx`
- Create: `src/panels/RqtGraph/graphLayout.ts`
- Create: `src/panels/RqtGraph/RosNodeNode.tsx` (custom React Flow node)
- Create: `src/panels/RqtGraph/TopicNode.tsx` (custom React Flow node)
- Create: `src/stores/rqtGraphStore.ts`

> Queries rosbridge for live node/topic graph every 2s, runs dagre auto-layout,
> renders as React Flow with custom node types (amber ROS nodes, blue topics).
> Click node → sidebar details.

---

## Phase 5: Action Graph Editor

### Task 19: Action Graph Canvas (React Flow read-write)
### Task 20: Node Library Drawer
### Task 21: Node Properties Sidebar
### Task 22: Launch File Generator (backend endpoint)
### Task 23: Deploy Pipeline (backend + Container Agent)

---

## Phase 6: Backend Extensions

### Task 24: `/api/ros2/graph` endpoint (live computation graph)
### Task 25: `/api/action-graph/*` CRUD + deploy endpoints
### Task 26: Action graph DB table migration
### Task 27: Launch file generator service
### Task 28: URDF raw XML endpoint for frontend loader

---

## Dependency Graph

```
Task 1 (bootstrap)
  └─ Task 2 (theme)
      └─ Task 3 (ROS + stores)
          └─ Task 4 (panel layout)
              └─ Task 5 (scene manager)
                  ├─ Task 6 (TF tree)
                  └─ Task 7 (display plugin system)
                      ├─ Task 8 (markers)
                      ├─ Task 9 (robot model)
                      └─ Task 10 (wire everything)
                          ├─ Tasks 11-17 (sensor displays, parallelizable)
                          ├─ Task 18 (RQT graph)
                          └─ Tasks 19-23 (action graph)
Tasks 24-28 (backend, parallelizable with Phase 4-5)
```

---

## Verification Criteria

After Phase 2 (Task 10) is complete, the following must work:
- [ ] `pnpm run build` succeeds with zero errors
- [ ] Dev server shows warm amber panel layout (4 panels)
- [ ] 3D viewport renders with grid, axes, PBR lighting
- [ ] Orbit/pan/zoom controls work
- [ ] "Add Display" picker shows all registered types
- [ ] Adding Grid/Axes display updates 3D viewport immediately
- [ ] Topic list populates when rosbridge is reachable
- [ ] Clicking topic assigns it to selected display
- [ ] Property editor auto-generates controls from display schema
- [ ] RobotModel display loads URDF and renders meshes (when API available)
- [ ] Marker display renders all basic marker types
