import { create } from 'zustand';

// --- Types ---

export interface PipelineNode {
  id: string;
  category: 'asset' | 'operation';
  type: string;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
  data_type: string;
}

export interface PipelineGraphJson {
  schema_version: string;
  template: string;
  osmo_compatible: boolean;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

export interface Pipeline {
  graph_id: string;
  name: string;
  version: number;
  description: string | null;
  graph_json: PipelineGraphJson;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface NodeResult {
  status: 'pending' | 'running' | 'complete' | 'failed';
  started_at?: string;
  completed_at?: string;
  progress?: number;
  output_artifact_id?: string;
  agent_log_id?: string;
  logs?: string[];
  metrics?: Record<string, unknown>;
  error?: string;
}

export interface PipelineRun {
  run_id: string;
  graph_id: string;
  graph_name: string;
  status: string;
  node_results: Record<string, NodeResult>;
  started_at: string;
  completed_at: string | null;
}

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  node_count: number;
  edge_count: number;
}

// --- Store ---

interface PipelineState {
  pipelines: Pipeline[];
  pipelinesLoading: boolean;
  activePipeline: Pipeline | null;
  activePipelineLoading: boolean;
  runs: PipelineRun[];
  runsLoading: boolean;
  activeRun: PipelineRun | null;
  templates: PipelineTemplate[];
  templatesLoading: boolean;
  selectedNodeId: string | null;

  fetchPipelines: () => Promise<void>;
  fetchPipeline: (graphId: string) => Promise<void>;
  createPipeline: (name: string, description?: string) => Promise<Pipeline | null>;
  updatePipeline: (graphId: string, data: Partial<Pipeline>) => Promise<Pipeline | null>;
  deletePipeline: (graphId: string) => Promise<void>;
  fetchTemplates: () => Promise<void>;
  instantiateTemplate: (templateId: string) => Promise<Pipeline | null>;
  fetchRuns: (graphId: string) => Promise<void>;
  startRun: (graphId: string) => Promise<PipelineRun | null>;
  fetchRun: (runId: string) => Promise<void>;
  selectNode: (nodeId: string | null) => void;
  clearActive: () => void;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  pipelines: [],
  pipelinesLoading: false,
  activePipeline: null,
  activePipelineLoading: false,
  runs: [],
  runsLoading: false,
  activeRun: null,
  templates: [],
  templatesLoading: false,
  selectedNodeId: null,

  fetchPipelines: async () => {
    set({ pipelinesLoading: true });
    try {
      const res = await fetch('/mc/api/pipelines');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ pipelines: Array.isArray(data) ? data : [], pipelinesLoading: false });
    } catch {
      set({ pipelines: [], pipelinesLoading: false });
    }
  },

  fetchPipeline: async (graphId) => {
    set({ activePipelineLoading: true });
    try {
      const res = await fetch(`/mc/api/pipelines/${graphId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ activePipeline: data, activePipelineLoading: false });
    } catch {
      set({ activePipeline: null, activePipelineLoading: false });
    }
  },

  createPipeline: async (name, description) => {
    try {
      const res = await fetch('/mc/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description ?? null,
          graph_json: { schema_version: '1.0', template: '', osmo_compatible: false, nodes: [], edges: [] },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pipeline: Pipeline = await res.json();
      set({ pipelines: [...get().pipelines, pipeline] });
      return pipeline;
    } catch {
      return null;
    }
  },

  updatePipeline: async (graphId, data) => {
    try {
      const res = await fetch(`/mc/api/pipelines/${graphId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: Pipeline = await res.json();
      set({
        pipelines: get().pipelines.map((p) => (p.graph_id === graphId ? updated : p)),
        activePipeline: get().activePipeline?.graph_id === graphId ? updated : get().activePipeline,
      });
      return updated;
    } catch {
      return null;
    }
  },

  deletePipeline: async (graphId) => {
    try {
      const res = await fetch(`/mc/api/pipelines/${graphId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      set({
        pipelines: get().pipelines.filter((p) => p.graph_id !== graphId),
        activePipeline: get().activePipeline?.graph_id === graphId ? null : get().activePipeline,
      });
    } catch {
      // silent
    }
  },

  fetchTemplates: async () => {
    set({ templatesLoading: true });
    try {
      const res = await fetch('/mc/api/pipelines/templates');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ templates: Array.isArray(data) ? data : [], templatesLoading: false });
    } catch {
      set({ templates: [], templatesLoading: false });
    }
  },

  instantiateTemplate: async (templateId) => {
    try {
      const res = await fetch(`/mc/api/pipelines/templates/${templateId}/instantiate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pipeline: Pipeline = await res.json();
      set({ pipelines: [...get().pipelines, pipeline] });
      return pipeline;
    } catch {
      return null;
    }
  },

  fetchRuns: async (graphId) => {
    set({ runsLoading: true });
    try {
      const res = await fetch(`/mc/api/pipelines/${graphId}/runs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ runs: Array.isArray(data) ? data : [], runsLoading: false });
    } catch {
      set({ runs: [], runsLoading: false });
    }
  },

  startRun: async (graphId) => {
    try {
      const res = await fetch(`/mc/api/pipelines/${graphId}/run`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const run: PipelineRun = await res.json();
      set({ runs: [run, ...get().runs], activeRun: run });
      return run;
    } catch {
      return null;
    }
  },

  fetchRun: async (runId) => {
    try {
      const res = await fetch(`/mc/api/pipelines/runs/${runId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const run: PipelineRun = await res.json();
      set({ activeRun: run });
    } catch {
      set({ activeRun: null });
    }
  },

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  clearActive: () => {
    set({
      activePipeline: null,
      runs: [],
      activeRun: null,
      selectedNodeId: null,
    });
  },
}));
