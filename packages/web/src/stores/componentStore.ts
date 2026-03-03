import { create } from 'zustand';

interface ComponentPhysics {
  mass_kg: number | null;
  dimensions_mm: [number, number, number] | null;
  center_of_mass: [number, number, number] | null;
  inertia_tensor: number[] | null;
}

interface AttachmentInterface {
  name: string;
  type: string;
  position: [number, number, number];
  orientation: [number, number, number];
}

interface DataSource {
  source: string;
  tier: number;
  url: string;
  field_path: string;
  retrieved_at: string;
}

interface MeshVariants {
  source_file: string | null;
  visual_mesh: string | null;
  collision_mesh: string | null;
  usd_mesh: string | null;
}

export interface Component {
  component_id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  model: string | null;
  physics: ComponentPhysics | null;
  attachment_interfaces: AttachmentInterface[] | null;
  data_sources: DataSource[] | null;
  mesh_variants: MeshVariants | null;
  approval_status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ComponentState {
  components: Component[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  fetchComponents: (category?: string, status?: string) => Promise<void>;
  createComponent: (data: Partial<Component>) => Promise<void>;
  updateComponent: (id: string, data: Partial<Component>) => Promise<void>;
  approveComponent: (id: string) => Promise<void>;
  rejectComponent: (id: string) => Promise<void>;
  deleteComponent: (id: string) => Promise<void>;
  selectComponent: (id: string | null) => void;
}

export const useComponentStore = create<ComponentState>()((set) => ({
  components: [],
  selectedId: null,
  loading: false,
  error: null,

  fetchComponents: async (category?: string, status?: string) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (status) params.set('approval_status', status);
      const qs = params.toString();
      const res = await fetch(`/mc/api/components${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error(await res.text());
      set({ components: await res.json(), loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createComponent: async (data) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/mc/api/components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      set((s) => ({ components: [...s.components, created], loading: false }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  updateComponent: async (id, data) => {
    set({ error: null });
    try {
      const res = await fetch(`/mc/api/components/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      set((s) => ({
        components: s.components.map((c) => (c.component_id === id ? updated : c)),
      }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  approveComponent: async (id) => {
    try {
      const res = await fetch(`/mc/api/components/${id}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      set((s) => ({
        components: s.components.map((c) =>
          c.component_id === id ? { ...c, approval_status: 'approved' as const } : c
        ),
      }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  rejectComponent: async (id) => {
    try {
      const res = await fetch(`/mc/api/components/${id}/reject`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      set((s) => ({
        components: s.components.map((c) =>
          c.component_id === id ? { ...c, approval_status: 'rejected' as const } : c
        ),
      }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  deleteComponent: async (id) => {
    try {
      const res = await fetch(`/mc/api/components/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      set((s) => ({
        components: s.components.filter((c) => c.component_id !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
      }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  selectComponent: (id) => set({ selectedId: id }),
}));
