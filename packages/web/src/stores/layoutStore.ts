/**
 * Mission Control — Layout Store (Zustand)
 * Manages panel workspace state: mosaic tree, panel instances, saved layouts.
 */

import { create } from 'zustand';
import type { MosaicNode, MosaicDirection } from 'react-mosaic-component';
import { toSavedLayouts } from '@/layouts/defaults';
import api from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PanelInstance {
  type: string; // panelRegistry id
  config: Record<string, unknown>;
}

export interface SavedLayout {
  id: string;
  name: string;
  layout: MosaicNode<string>;
  panelConfigs: Record<string, PanelInstance>;
  createdAt: string;
}

interface LayoutState {
  // Current workspace
  layout: MosaicNode<string> | null;
  panelConfigs: Record<string, PanelInstance>;

  // Saved layouts
  savedLayouts: SavedLayout[];
  activeLayoutId: string | null;

  // Layout variables (for data binding between panels)
  variables: Record<string, unknown>;

  // Server sync
  syncing: boolean;
  lastSyncError: string | null;

  // Actions — workspace
  setLayout: (layout: MosaicNode<string> | null) => void;
  addPanel: (panelType: string, direction?: MosaicDirection) => void;
  removePanel: (instanceId: string) => void;
  updatePanelConfig: (instanceId: string, config: Record<string, unknown>) => void;

  // Actions — saved layouts (local)
  saveLayout: (name: string) => void;
  loadLayout: (layoutId: string) => void;
  deleteLayout: (layoutId: string) => void;

  // Actions — server persistence
  saveLayoutToServer: (name: string) => Promise<void>;
  fetchLayouts: () => Promise<void>;
  loadLayoutFromServer: (layoutId: string) => Promise<void>;
  deleteLayoutFromServer: (layoutId: string) => Promise<void>;
  updateLayoutOnServer: (layoutId: string) => Promise<void>;

  // Actions — variables
  setVariable: (name: string, value: unknown) => void;

  // Reset
  resetLayout: () => void;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

let instanceCounter = 0;
function nextInstanceId(panelType: string): string {
  return `${panelType}-${++instanceCounter}`;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULT_LAYOUT: MosaicNode<string> = {
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

const DEFAULT_PANEL_CONFIGS: Record<string, PanelInstance> = {
  viewport3d: { type: 'viewport3d', config: {} },
  displays: { type: 'displays', config: {} },
  topics: { type: 'topics', config: {} },
  properties: { type: 'properties', config: {} },
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layout: DEFAULT_LAYOUT,
  panelConfigs: { ...DEFAULT_PANEL_CONFIGS },
  savedLayouts: toSavedLayouts(),
  activeLayoutId: null,
  variables: {},
  syncing: false,
  lastSyncError: null,

  setLayout: (layout) => set({ layout }),

  addPanel: (panelType, direction = 'row') => {
    const instanceId = nextInstanceId(panelType);
    const state = get();

    // Add to panel configs
    const newConfigs = {
      ...state.panelConfigs,
      [instanceId]: { type: panelType, config: {} },
    };

    // Add to mosaic tree: wrap current layout with new split
    const newLayout: MosaicNode<string> = state.layout
      ? { direction, first: state.layout, second: instanceId, splitPercentage: 70 }
      : instanceId;

    set({ layout: newLayout, panelConfigs: newConfigs });
  },

  removePanel: (instanceId) => {
    const state = get();
    const { [instanceId]: _, ...remainingConfigs } = state.panelConfigs;

    // Remove from mosaic tree
    const newLayout = removePanelFromTree(state.layout, instanceId);

    set({ layout: newLayout, panelConfigs: remainingConfigs });
  },

  updatePanelConfig: (instanceId, config) => {
    const state = get();
    const existing = state.panelConfigs[instanceId];
    if (!existing) return;

    set({
      panelConfigs: {
        ...state.panelConfigs,
        [instanceId]: { ...existing, config: { ...existing.config, ...config } },
      },
    });
  },

  saveLayout: (name) => {
    const state = get();
    const id = generateId();
    const saved: SavedLayout = {
      id,
      name,
      layout: state.layout!,
      panelConfigs: { ...state.panelConfigs },
      createdAt: new Date().toISOString(),
    };
    set({ savedLayouts: [...state.savedLayouts, saved], activeLayoutId: id });
  },

  loadLayout: (layoutId) => {
    const state = get();
    const saved = state.savedLayouts.find((l) => l.id === layoutId);
    if (!saved) return;
    set({
      layout: saved.layout,
      panelConfigs: { ...saved.panelConfigs },
      activeLayoutId: layoutId,
    });
  },

  deleteLayout: (layoutId) => {
    const state = get();
    set({
      savedLayouts: state.savedLayouts.filter((l) => l.id !== layoutId),
      activeLayoutId: state.activeLayoutId === layoutId ? null : state.activeLayoutId,
    });
  },

  // ── Server persistence ────────────────────────────────────────────────────

  saveLayoutToServer: async (name) => {
    const { layout, panelConfigs, savedLayouts } = get();
    set({ syncing: true, lastSyncError: null });
    try {
      const { data } = await api.post('/layouts', { name, layout_json: { layout, panelConfigs } });
      const saved: SavedLayout = {
        id: data.layout_id,
        name: data.name,
        layout: data.layout_json.layout,
        panelConfigs: data.layout_json.panelConfigs,
        createdAt: data.created_at,
      };
      set({ savedLayouts: [...savedLayouts, saved], activeLayoutId: saved.id, syncing: false });
    } catch (e) {
      set({ syncing: false, lastSyncError: (e as Error).message });
    }
  },

  fetchLayouts: async () => {
    set({ syncing: true, lastSyncError: null });
    try {
      const { data } = await api.get('/layouts');
      // Merge server layouts with local defaults
      const defaults = toSavedLayouts();
      const serverLayouts: SavedLayout[] = data.map((l: any) => ({
        id: l.layout_id,
        name: l.name,
        layout: l.layout_json?.layout,
        panelConfigs: l.layout_json?.panelConfigs ?? {},
        createdAt: l.created_at,
      }));
      set({ savedLayouts: [...defaults, ...serverLayouts], syncing: false });
    } catch (e) {
      set({ syncing: false, lastSyncError: (e as Error).message });
    }
  },

  loadLayoutFromServer: async (layoutId) => {
    set({ syncing: true, lastSyncError: null });
    try {
      const { data } = await api.get(`/layouts/${layoutId}`);
      set({
        layout: data.layout_json.layout,
        panelConfigs: data.layout_json.panelConfigs ?? {},
        activeLayoutId: layoutId,
        syncing: false,
      });
    } catch (e) {
      set({ syncing: false, lastSyncError: (e as Error).message });
    }
  },

  deleteLayoutFromServer: async (layoutId) => {
    set({ syncing: true, lastSyncError: null });
    try {
      await api.delete(`/layouts/${layoutId}`);
      const state = get();
      set({
        savedLayouts: state.savedLayouts.filter((l) => l.id !== layoutId),
        activeLayoutId: state.activeLayoutId === layoutId ? null : state.activeLayoutId,
        syncing: false,
      });
    } catch (e) {
      set({ syncing: false, lastSyncError: (e as Error).message });
    }
  },

  updateLayoutOnServer: async (layoutId) => {
    const { layout, panelConfigs } = get();
    set({ syncing: true, lastSyncError: null });
    try {
      await api.patch(`/layouts/${layoutId}`, { layout_json: { layout, panelConfigs } });
      set({ syncing: false });
    } catch (e) {
      set({ syncing: false, lastSyncError: (e as Error).message });
    }
  },

  setVariable: (name, value) => {
    const state = get();
    set({ variables: { ...state.variables, [name]: value } });
  },

  resetLayout: () =>
    set({
      layout: DEFAULT_LAYOUT,
      panelConfigs: { ...DEFAULT_PANEL_CONFIGS },
      activeLayoutId: null,
    }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function removePanelFromTree(
  node: MosaicNode<string> | null,
  targetId: string,
): MosaicNode<string> | null {
  if (!node) return null;
  if (typeof node === 'string') {
    return node === targetId ? null : node;
  }

  if (node.first === targetId) return typeof node.second === 'string' ? node.second : node.second;
  if (node.second === targetId) return typeof node.first === 'string' ? node.first : node.first;

  const newFirst = removePanelFromTree(node.first, targetId);
  const newSecond = removePanelFromTree(node.second, targetId);

  if (!newFirst && !newSecond) return null;
  if (!newFirst) return newSecond;
  if (!newSecond) return newFirst;

  return { ...node, first: newFirst, second: newSecond };
}

// Backward compat — old code imported PanelId
export type PanelId = string;
