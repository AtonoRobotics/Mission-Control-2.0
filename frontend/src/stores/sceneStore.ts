import { create } from 'zustand';

// --- Types ---

export interface ScenePlacement {
  id: string;
  asset_id: string;
  asset_source: 'registry' | 'nvidia' | 'upload';
  asset_type: 'robot' | 'environment' | 'object' | 'sensor' | 'light';
  label: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  physics_enabled: boolean;
  is_global: boolean;
  properties: Record<string, unknown>;
}

export interface SceneConfig {
  name: string;
  description?: string;
  physics_dt: number;
  render_dt: number;
  gravity: [number, number, number];
  num_envs?: number;
  env_spacing?: number;
  placements: ScenePlacement[];
}

export interface NvidiaAssetEntry {
  id: string;
  label: string;
  path: string;
  description: string;
  thumbnail: string | null;
}

export interface NvidiaAssetCatalog {
  version: string;
  source: string;
  categories: {
    environments: NvidiaAssetEntry[];
    robots: NvidiaAssetEntry[];
    objects: NvidiaAssetEntry[];
    sensors: NvidiaAssetEntry[];
    lighting: NvidiaAssetEntry[];
  };
}

export interface RegistryAsset {
  file_id: string;
  robot_id: string | null;
  file_type: string;
  file_path: string;
  version: string;
  status: string;
  created_at: string;
}

// --- Defaults ---

const defaultSceneConfig: SceneConfig = {
  name: 'Untitled Scene',
  description: '',
  physics_dt: 1 / 120,
  render_dt: 1 / 60,
  gravity: [0, 0, -9.81],
  num_envs: 1,
  env_spacing: 2.0,
  placements: [],
};

// --- Store ---

export interface SavedSceneSummary {
  scene_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

interface SceneState {
  sceneConfig: SceneConfig;
  selectedPlacementId: string | null;
  nvidiaAssets: NvidiaAssetCatalog | null;
  nvidiaAssetsLoading: boolean;
  registryAssets: RegistryAsset[];
  registryAssetsLoading: boolean;
  sceneViewMode: '2d' | '3d' | 'split';
  generating: boolean;
  generateError: string | null;
  savedSceneId: string | null;
  savedScenes: SavedSceneSummary[];
  saving: boolean;

  setSceneConfig: (config: Partial<SceneConfig>) => void;
  addPlacement: (placement: ScenePlacement) => void;
  updatePlacement: (id: string, updates: Partial<ScenePlacement>) => void;
  removePlacement: (id: string) => void;
  selectPlacement: (id: string | null) => void;
  setSceneViewMode: (mode: '2d' | '3d' | 'split') => void;
  fetchNvidiaAssets: () => Promise<void>;
  fetchRegistryAssets: () => Promise<void>;
  uploadAsset: (file: File, fileType: string) => Promise<RegistryAsset | null>;
  generateScene: (prompt: string, taskType: string, robotId?: string) => Promise<void>;
  resetScene: () => void;
  saveScene: (name?: string) => Promise<void>;
  loadScene: (sceneId: string) => Promise<void>;
  fetchSavedScenes: () => Promise<void>;
  deleteScene: (sceneId: string) => Promise<void>;
  exportSceneJson: () => void;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  sceneConfig: { ...defaultSceneConfig },
  selectedPlacementId: null,
  nvidiaAssets: null,
  nvidiaAssetsLoading: false,
  registryAssets: [],
  registryAssetsLoading: false,
  sceneViewMode: 'split',
  generating: false,
  generateError: null,
  savedSceneId: null,
  savedScenes: [],
  saving: false,

  setSceneConfig: (config) => {
    set({ sceneConfig: { ...get().sceneConfig, ...config } });
  },

  addPlacement: (placement) => {
    const current = get().sceneConfig;
    set({
      sceneConfig: {
        ...current,
        placements: [...current.placements, placement],
      },
    });
  },

  updatePlacement: (id, updates) => {
    const current = get().sceneConfig;
    set({
      sceneConfig: {
        ...current,
        placements: current.placements.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        ),
      },
    });
  },

  removePlacement: (id) => {
    const current = get().sceneConfig;
    set({
      sceneConfig: {
        ...current,
        placements: current.placements.filter((p) => p.id !== id),
      },
      selectedPlacementId: get().selectedPlacementId === id ? null : get().selectedPlacementId,
    });
  },

  selectPlacement: (id) => {
    set({ selectedPlacementId: id });
  },

  setSceneViewMode: (mode) => {
    set({ sceneViewMode: mode });
  },

  fetchNvidiaAssets: async () => {
    set({ nvidiaAssetsLoading: true });
    try {
      const res = await fetch('/nvidia-assets.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: NvidiaAssetCatalog = await res.json();
      set({ nvidiaAssets: data, nvidiaAssetsLoading: false });
    } catch {
      set({ nvidiaAssets: null, nvidiaAssetsLoading: false });
    }
  },

  fetchRegistryAssets: async () => {
    set({ registryAssetsLoading: true });
    try {
      const res = await fetch('/mc/api/registry/files?limit=500');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ registryAssets: Array.isArray(data) ? data : [], registryAssetsLoading: false });
    } catch {
      set({ registryAssets: [], registryAssetsLoading: false });
    }
  },

  uploadAsset: async (file, fileType) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/mc/api/registry/files/upload?file_type=${encodeURIComponent(fileType)}`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const asset: RegistryAsset = await res.json();
      set({ registryAssets: [...get().registryAssets, asset] });
      return asset;
    } catch {
      return null;
    }
  },

  generateScene: async (prompt, taskType, robotId) => {
    set({ generating: true, generateError: null });
    try {
      // Submit job — backend returns { job_id, status } with HTTP 202
      const res = await fetch('/mc/api/pipelines/scenes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, task_type: taskType, robot_id: robotId ?? null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const { job_id } = await res.json();

      // Poll until complete or failed
      const POLL_INTERVAL = 3000;
      const MAX_POLLS = 200; // ~10 minutes
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        const poll = await fetch(`/mc/api/pipelines/scenes/generate/${job_id}`);
        if (!poll.ok) throw new Error(`Poll failed: HTTP ${poll.status}`);
        const job = await poll.json();

        if (job.status === 'completed' && job.result) {
          set({ sceneConfig: job.result, generating: false, savedSceneId: null });
          // Auto-save the generated scene
          get().saveScene(job.result.name || 'Generated Scene');
          return;
        }
        if (job.status === 'failed') {
          throw new Error(job.error || 'Generation failed');
        }
      }
      throw new Error('Generation timed out');
    } catch (e) {
      set({ generating: false, generateError: e instanceof Error ? e.message : 'Generation failed' });
    }
  },

  saveScene: async (name?) => {
    const { sceneConfig, savedSceneId } = get();
    set({ saving: true });
    try {
      if (savedSceneId) {
        // PATCH existing
        const res = await fetch(`/mc/api/pipelines/scenes/${savedSceneId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name ?? sceneConfig.name,
            description: sceneConfig.description,
            scene_json: sceneConfig,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        // POST new
        const res = await fetch('/mc/api/pipelines/scenes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name ?? sceneConfig.name,
            description: sceneConfig.description,
            scene_json: sceneConfig,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        set({ savedSceneId: data.scene_id });
      }
    } catch (e) {
      console.error('Failed to save scene:', e);
    } finally {
      set({ saving: false });
    }
  },

  loadScene: async (sceneId) => {
    try {
      const res = await fetch(`/mc/api/pipelines/scenes/${sceneId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.scene_json) {
        set({
          sceneConfig: data.scene_json,
          savedSceneId: data.scene_id,
          selectedPlacementId: null,
        });
      }
    } catch (e) {
      console.error('Failed to load scene:', e);
    }
  },

  fetchSavedScenes: async () => {
    try {
      const res = await fetch('/mc/api/pipelines/scenes?limit=50');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ savedScenes: Array.isArray(data) ? data : [] });
    } catch {
      set({ savedScenes: [] });
    }
  },

  deleteScene: async (sceneId) => {
    try {
      const res = await fetch(`/mc/api/pipelines/scenes/${sceneId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { savedSceneId, savedScenes } = get();
      set({
        savedScenes: savedScenes.filter((s) => s.scene_id !== sceneId),
        savedSceneId: savedSceneId === sceneId ? null : savedSceneId,
      });
    } catch (e) {
      console.error('Failed to delete scene:', e);
    }
  },

  exportSceneJson: () => {
    const { sceneConfig } = get();
    const json = JSON.stringify(sceneConfig, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sceneConfig.name.replace(/\s+/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  resetScene: () => {
    set({
      sceneConfig: { ...defaultSceneConfig, placements: [] },
      selectedPlacementId: null,
      generating: false,
      generateError: null,
      savedSceneId: null,
    });
  },
}));
