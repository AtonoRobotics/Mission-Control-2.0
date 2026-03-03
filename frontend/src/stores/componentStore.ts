import { create } from 'zustand';

export interface ComponentPhysics {
  mass_kg?: number | null;
  dimensions_mm?: { l: number; w: number; h: number } | null;
  center_of_mass?: [number, number, number] | null;
  inertia_tensor?: Record<string, number> | null;
}

export interface AttachmentInterface {
  name: string;
  type: string;
  role: 'provides' | 'accepts';
  offset_xyz?: [number, number, number];
  offset_rpy?: [number, number, number];
}

export interface DataSource {
  source: string;
  url?: string;
  tier: 1 | 2;
  field_path?: string;
  retrieved_at?: string;
}

export interface Component {
  component_id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  model: string | null;
  physics: ComponentPhysics;
  attachment_interfaces: AttachmentInterface[];
  data_sources: DataSource[];
  approval_status: 'pending_hit' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  visual_mesh_file_id: string | null;
  collision_mesh_file_id: string | null;
  source_mesh_file_id: string | null;
  thumbnail_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ComponentState {
  components: Component[];
  loading: boolean;
  error: string | null;

  fetchComponents: (category?: string, approvalStatus?: string) => Promise<void>;
  createComponent: (data: Partial<Component>) => Promise<Component | null>;
  approveComponent: (id: string, approvedBy: string, notes?: string) => Promise<boolean>;
  rejectComponent: (id: string, approvedBy: string, notes?: string) => Promise<boolean>;
  researchComponent: (name: string, category: string, manufacturer?: string, model?: string) => Promise<Component | null>;
  deleteComponent: (id: string) => Promise<boolean>;
}

export const useComponentStore = create<ComponentState>((set, get) => ({
  components: [],
  loading: false,
  error: null,

  fetchComponents: async (category, approvalStatus) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (approvalStatus) params.set('approval_status', approvalStatus);
      const qs = params.toString();
      const res = await fetch(`/mc/api/components${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ components: Array.isArray(data) ? data : [], loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load components', loading: false });
    }
  },

  createComponent: async (data) => {
    try {
      const res = await fetch('/mc/api/components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const comp: Component = await res.json();
      set({ components: [comp, ...get().components] });
      return comp;
    } catch {
      return null;
    }
  },

  approveComponent: async (id, approvedBy, notes) => {
    try {
      const res = await fetch(`/mc/api/components/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved_by: approvedBy, notes }),
      });
      if (!res.ok) return false;
      const updated: Component = await res.json();
      set({ components: get().components.map((c) => c.component_id === id ? updated : c) });
      return true;
    } catch {
      return false;
    }
  },

  rejectComponent: async (id, approvedBy, notes) => {
    try {
      const res = await fetch(`/mc/api/components/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved_by: approvedBy, notes }),
      });
      if (!res.ok) return false;
      const updated: Component = await res.json();
      set({ components: get().components.map((c) => c.component_id === id ? updated : c) });
      return true;
    } catch {
      return false;
    }
  },

  researchComponent: async (name, category, manufacturer, model) => {
    try {
      const res = await fetch('/mc/api/components/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, manufacturer, model }),
      });
      if (!res.ok) return null;
      const comp: Component = await res.json();
      set({ components: [comp, ...get().components] });
      return comp;
    } catch {
      return null;
    }
  },

  deleteComponent: async (id) => {
    try {
      const res = await fetch(`/mc/api/components/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      set({ components: get().components.filter((c) => c.component_id !== id) });
      return true;
    } catch {
      return false;
    }
  },
}));
