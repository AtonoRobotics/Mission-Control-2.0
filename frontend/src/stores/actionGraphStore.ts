// ============================================================
// Action Graph Store — Zustand
// Manages multiple named graphs, each holding ReactFlow node
// and edge state. Persisted to localStorage.
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Node, Edge } from 'reactflow';

// ── Types ─────────────────────────────────────────────────────

export interface ActionGraph {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  createdAt: number;
  updatedAt: number;
}

interface ActionGraphState {
  // Data
  graphs: Record<string, ActionGraph>;
  activeGraphId: string | null;

  // Selectors
  activeGraph: () => ActionGraph | null;

  // Actions
  createGraph: (name: string) => string;
  deleteGraph: (id: string) => void;
  setActiveGraph: (id: string) => void;
  renameGraph: (id: string, name: string) => void;

  updateNodes: (graphId: string, nodes: Node[]) => void;
  updateEdges: (graphId: string, edges: Edge[]) => void;

  // Import / export helpers
  exportGraph: (graphId: string) => ActionGraph | null;
  importGraph: (graph: ActionGraph) => void;

  // Clear canvas without deleting the graph record
  clearCanvas: (graphId: string) => void;
}

// ── ID helper ─────────────────────────────────────────────────
function nanoid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── Default graph seeded on first load ───────────────────────
function defaultGraph(): ActionGraph {
  const id = 'default';
  return {
    id,
    name: 'Main Graph',
    nodes: [],
    edges: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ── Store ─────────────────────────────────────────────────────
export const useActionGraphStore = create<ActionGraphState>()(
  persist(
    (set, get) => {
      const initial = defaultGraph();

      return {
        graphs: { [initial.id]: initial },
        activeGraphId: initial.id,

        // ── Selectors ────────────────────────────────────────
        activeGraph: () => {
          const { graphs, activeGraphId } = get();
          if (!activeGraphId) return null;
          return graphs[activeGraphId] ?? null;
        },

        // ── Graph lifecycle ──────────────────────────────────
        createGraph: (name) => {
          const id = nanoid();
          const graph: ActionGraph = {
            id,
            name,
            nodes: [],
            edges: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          set((state) => ({
            graphs: { ...state.graphs, [id]: graph },
            activeGraphId: id,
          }));
          return id;
        },

        deleteGraph: (id) => {
          set((state) => {
            const next = { ...state.graphs };
            delete next[id];
            const ids = Object.keys(next);
            return {
              graphs: next,
              // Fall back to another graph or null
              activeGraphId:
                state.activeGraphId === id ? (ids[0] ?? null) : state.activeGraphId,
            };
          });
        },

        setActiveGraph: (id) => {
          set({ activeGraphId: id });
        },

        renameGraph: (id, name) => {
          set((state) => ({
            graphs: {
              ...state.graphs,
              [id]: { ...state.graphs[id], name, updatedAt: Date.now() },
            },
          }));
        },

        // ── Node / edge updates ──────────────────────────────
        updateNodes: (graphId, nodes) => {
          set((state) => {
            const existing = state.graphs[graphId];
            if (!existing) return state;
            return {
              graphs: {
                ...state.graphs,
                [graphId]: { ...existing, nodes, updatedAt: Date.now() },
              },
            };
          });
        },

        updateEdges: (graphId, edges) => {
          set((state) => {
            const existing = state.graphs[graphId];
            if (!existing) return state;
            return {
              graphs: {
                ...state.graphs,
                [graphId]: { ...existing, edges, updatedAt: Date.now() },
              },
            };
          });
        },

        // ── Import / export ──────────────────────────────────
        exportGraph: (graphId) => {
          return get().graphs[graphId] ?? null;
        },

        importGraph: (graph) => {
          set((state) => ({
            graphs: {
              ...state.graphs,
              [graph.id]: { ...graph, updatedAt: Date.now() },
            },
            activeGraphId: graph.id,
          }));
        },

        // ── Utilities ────────────────────────────────────────
        clearCanvas: (graphId) => {
          set((state) => {
            const existing = state.graphs[graphId];
            if (!existing) return state;
            return {
              graphs: {
                ...state.graphs,
                [graphId]: {
                  ...existing,
                  nodes: [],
                  edges: [],
                  updatedAt: Date.now(),
                },
              },
            };
          });
        },
      };
    },
    {
      name: 'mc-action-graphs',
      // Serialize Maps as plain objects — not needed here since we use Record,
      // but we exclude non-serializable function values from persistence.
      partialize: (state) => ({
        graphs: state.graphs,
        activeGraphId: state.activeGraphId,
      }),
    },
  ),
);
