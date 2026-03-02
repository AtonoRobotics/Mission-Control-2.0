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
