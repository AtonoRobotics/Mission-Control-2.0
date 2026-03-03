import { create } from 'zustand';

export interface TreeNode {
  component_id: string;
  attach_to: string;
  joint_config: {
    type: string;
    origin_xyz?: [number, number, number];
    origin_rpy?: [number, number, number];
    axis?: [number, number, number];
    limits?: Record<string, number>;
  };
}

export interface Package {
  package_id: string;
  name: string;
  package_type: 'payload' | 'sensor';
  component_tree: TreeNode[];
  total_mass_kg: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface RobotConfig {
  config_id: string;
  robot_id: string;
  name: string;
  base_type: 'standing' | 'track' | 'track_weighted';
  base_config: Record<string, unknown>;
  payload_package_id: string | null;
  sensor_package_id: string | null;
  status: string;
  generated_files: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface BuildResult {
  config_id: string;
  status: string;
  generated_files: Record<string, string>;
  errors: string[];
}

interface BuilderState {
  // Robot configurations for selected robot
  configurations: RobotConfig[];
  selectedConfigId: string | null;
  configLoading: boolean;

  // Packages
  packages: Package[];
  packagesLoading: boolean;

  // Build state
  building: boolean;
  buildResult: BuildResult | null;

  // HIT approval queue
  pendingApprovals: number;

  fetchConfigurations: (robotId: string) => Promise<void>;
  createConfiguration: (robotId: string, data: Partial<RobotConfig>) => Promise<RobotConfig | null>;
  updateConfiguration: (configId: string, data: Partial<RobotConfig>) => Promise<boolean>;
  deleteConfiguration: (configId: string) => Promise<boolean>;
  selectConfiguration: (configId: string | null) => void;
  buildConfiguration: (configId: string) => Promise<BuildResult | null>;

  fetchPackages: (packageType?: string) => Promise<void>;
  createPackage: (data: Partial<Package>) => Promise<Package | null>;
  deletePackage: (packageId: string) => Promise<boolean>;
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  configurations: [],
  selectedConfigId: null,
  configLoading: false,
  packages: [],
  packagesLoading: false,
  building: false,
  buildResult: null,
  pendingApprovals: 0,

  fetchConfigurations: async (robotId) => {
    set({ configLoading: true });
    try {
      const res = await fetch(`/mc/api/robots/${robotId}/configurations`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ configurations: Array.isArray(data) ? data : [], configLoading: false });
    } catch {
      set({ configurations: [], configLoading: false });
    }
  },

  createConfiguration: async (robotId, data) => {
    try {
      const res = await fetch(`/mc/api/robots/${robotId}/configurations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) return null;
      const config: RobotConfig = await res.json();
      set({ configurations: [config, ...get().configurations] });
      return config;
    } catch {
      return null;
    }
  },

  updateConfiguration: async (configId, data) => {
    try {
      const res = await fetch(`/mc/api/robots/configurations/${configId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) return false;
      const updated: RobotConfig = await res.json();
      set({ configurations: get().configurations.map((c) => c.config_id === configId ? updated : c) });
      return true;
    } catch {
      return false;
    }
  },

  deleteConfiguration: async (configId) => {
    try {
      const res = await fetch(`/mc/api/robots/configurations/${configId}`, { method: 'DELETE' });
      if (!res.ok) return false;
      set({ configurations: get().configurations.filter((c) => c.config_id !== configId) });
      return true;
    } catch {
      return false;
    }
  },

  selectConfiguration: (configId) => {
    set({ selectedConfigId: configId, buildResult: null });
  },

  buildConfiguration: async (configId) => {
    set({ building: true, buildResult: null });
    try {
      const res = await fetch(`/mc/api/robots/configurations/${configId}/build`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result: BuildResult = await res.json();
      set({ building: false, buildResult: result });
      // Refresh configurations to get updated status
      const config = get().configurations.find((c) => c.config_id === configId);
      if (config) {
        await get().fetchConfigurations(config.robot_id);
      }
      return result;
    } catch {
      set({ building: false });
      return null;
    }
  },

  fetchPackages: async (packageType) => {
    set({ packagesLoading: true });
    try {
      const qs = packageType ? `?package_type=${packageType}` : '';
      const res = await fetch(`/mc/api/packages${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ packages: Array.isArray(data) ? data : [], packagesLoading: false });
    } catch {
      set({ packages: [], packagesLoading: false });
    }
  },

  createPackage: async (data) => {
    try {
      const res = await fetch('/mc/api/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) return null;
      const pkg: Package = await res.json();
      set({ packages: [pkg, ...get().packages] });
      return pkg;
    } catch {
      return null;
    }
  },

  deletePackage: async (packageId) => {
    try {
      const res = await fetch(`/mc/api/packages/${packageId}`, { method: 'DELETE' });
      if (!res.ok) return false;
      set({ packages: get().packages.filter((p) => p.package_id !== packageId) });
      return true;
    } catch {
      return false;
    }
  },
}));
