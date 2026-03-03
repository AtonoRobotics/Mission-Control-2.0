import { create } from 'zustand';

export interface TreeNode {
  node_id: string;
  component_id: string;
  attach_to: string | null;
  joint_config: {
    origin_xyz: [number, number, number];
    origin_rpy: [number, number, number];
  } | null;
}

export interface RobotConfig {
  config_id: string;
  robot_id: string;
  name: string;
  base_type: 'fixed' | 'track' | 'turntable';
  build_status: 'draft' | 'building' | 'built' | 'failed';
  generated_files: Record<string, string> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BuildResult {
  status: string;
  files: Record<string, string>;
  errors: string[];
}

interface BuilderState {
  configs: RobotConfig[];
  selectedConfigId: string | null;
  tree: TreeNode[];
  building: boolean;
  buildResult: BuildResult | null;
  error: string | null;
  fetchConfigs: (robotId: string) => Promise<void>;
  createConfig: (robotId: string, name: string) => Promise<void>;
  selectConfig: (id: string | null) => void;
  addNode: (node: TreeNode) => void;
  removeNode: (nodeId: string) => void;
  updateNodeJointConfig: (nodeId: string, config: TreeNode['joint_config']) => void;
  build: (configId: string) => Promise<void>;
}

export const useBuilderStore = create<BuilderState>()((set) => ({
  configs: [],
  selectedConfigId: null,
  tree: [],
  building: false,
  buildResult: null,
  error: null,

  fetchConfigs: async (robotId) => {
    try {
      const res = await fetch(`/mc/api/robots/${robotId}/configurations`);
      if (!res.ok) throw new Error(await res.text());
      set({ configs: await res.json() });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  createConfig: async (robotId, name) => {
    try {
      const res = await fetch(`/mc/api/robots/${robotId}/configurations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await res.text());
      const config = await res.json();
      set((s) => ({ configs: [...s.configs, config] }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  selectConfig: (id) => set({ selectedConfigId: id }),

  addNode: (node) => set((s) => ({ tree: [...s.tree, node] })),

  removeNode: (nodeId) =>
    set((s) => ({ tree: s.tree.filter((n) => n.node_id !== nodeId) })),

  updateNodeJointConfig: (nodeId, config) =>
    set((s) => ({
      tree: s.tree.map((n) => (n.node_id === nodeId ? { ...n, joint_config: config } : n)),
    })),

  build: async (configId) => {
    set({ building: true, buildResult: null, error: null });
    try {
      const res = await fetch(`/mc/api/configurations/${configId}/build`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      set({ buildResult: result, building: false });
    } catch (e) {
      set({
        buildResult: { status: 'failed', files: {}, errors: [(e as Error).message] },
        building: false,
      });
    }
  },
}));
