// ============================================================
// Pipeline Canvas — React Flow canvas for the Physical AI
// Pipeline bipartite DAG. Handles drag-and-drop from the
// NodePalette, bipartite connection validation, and syncs
// with the external graphJson prop.
// ============================================================

import 'reactflow/dist/style.css';

import { useCallback, useEffect, useRef, useMemo } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
} from 'reactflow';

import { pipelineNodeTypes } from './nodeTypes';
import type { PipelineGraphJson, NodeResult } from '@/stores/pipelineStore';

// ── Props ────────────────────────────────────────────────────

interface PipelineCanvasProps {
  graphJson: PipelineGraphJson;
  onGraphChange: (graphJson: PipelineGraphJson) => void;
  onNodeSelect: (nodeId: string | null) => void;
  selectedNodeId: string | null;
  runNodeResults?: Record<string, NodeResult>;
}

// ── Helpers ──────────────────────────────────────────────────

/** Convert PipelineGraphJson nodes → React Flow nodes */
function toRFNodes(
  graphJson: PipelineGraphJson,
  selectedNodeId: string | null,
  runNodeResults?: Record<string, NodeResult>,
): Node[] {
  return graphJson.nodes.map((n) => ({
    id: n.id,
    type: n.category, // 'asset' | 'operation' — matches pipelineNodeTypes keys
    position: n.position,
    data: {
      label: n.label,
      assetType: n.category === 'asset' ? n.type : undefined,
      opType: n.category === 'operation' ? n.type : undefined,
      status: runNodeResults?.[n.id]?.status,
      progress: runNodeResults?.[n.id]?.progress,
      version: n.config?.version as string | undefined,
    },
    selected: n.id === selectedNodeId,
  }));
}

/** Convert PipelineGraphJson edges → React Flow edges */
function toRFEdges(
  graphJson: PipelineGraphJson,
  runNodeResults?: Record<string, NodeResult>,
): Edge[] {
  return graphJson.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: runNodeResults?.[e.source]?.status === 'running',
    style: { stroke: '#444', strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#666' },
  }));
}

/** Look up a node's category from the graphJson or from existing RF nodes */
function getNodeCategory(
  nodeId: string,
  graphJson: PipelineGraphJson,
): 'asset' | 'operation' | undefined {
  const node = graphJson.nodes.find((n) => n.id === nodeId);
  return node?.category;
}

// ── Component ────────────────────────────────────────────────

export default function PipelineCanvas({
  graphJson,
  onGraphChange,
  onNodeSelect,
  selectedNodeId,
  runNodeResults,
}: PipelineCanvasProps) {
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  // Debounce ref for onGraphChange
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a mutable ref to graphJson so callbacks can read latest without re-creating
  const graphJsonRef = useRef(graphJson);
  graphJsonRef.current = graphJson;

  // ── React Flow state ────────────────────────────────────────
  const initialNodes = useMemo(
    () => toRFNodes(graphJson, selectedNodeId, runNodeResults),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // only on mount
  );
  const initialEdges = useMemo(
    () => toRFEdges(graphJson, runNodeResults),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // ── Sync external graphJson → internal RF state ─────────────
  // Use a serialized key to detect real changes and avoid infinite loops
  const externalKey = useMemo(() => {
    return JSON.stringify({
      nodes: graphJson.nodes.map((n) => `${n.id}:${n.type}:${n.label}:${n.position.x}:${n.position.y}`),
      edges: graphJson.edges.map((e) => `${e.id}:${e.source}:${e.target}`),
    });
  }, [graphJson]);

  useEffect(() => {
    setNodes(toRFNodes(graphJson, selectedNodeId, runNodeResults));
    setEdges(toRFEdges(graphJson, runNodeResults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalKey]);

  // Also update selection styling when selectedNodeId changes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);

  // Also update run results when they change
  useEffect(() => {
    if (!runNodeResults) return;
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          status: runNodeResults[n.id]?.status,
          progress: runNodeResults[n.id]?.progress,
        },
      })),
    );
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        animated: runNodeResults[e.source]?.status === 'running',
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runNodeResults]);

  // ── Debounced propagation to parent ─────────────────────────
  const propagateChange = useCallback(
    (updatedNodes: Node[], updatedEdges: Edge[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const currentJson = graphJsonRef.current;
        const newGraphJson: PipelineGraphJson = {
          ...currentJson,
          nodes: updatedNodes.map((n) => {
            // Preserve existing node data, update position
            const existing = currentJson.nodes.find((orig) => orig.id === n.id);
            if (existing) {
              return { ...existing, position: n.position };
            }
            // New node from drop
            return {
              id: n.id,
              category: (n.type as 'asset' | 'operation') ?? 'asset',
              type: n.data?.assetType ?? n.data?.opType ?? n.type ?? 'unknown',
              label: n.data?.label ?? 'Untitled',
              config: {},
              position: n.position,
            };
          }),
          edges: updatedEdges.map((e) => {
            const existing = currentJson.edges.find((orig) => orig.id === e.id);
            if (existing) return existing;
            return {
              id: e.id,
              source: e.source,
              target: e.target,
              data_type: 'any',
            };
          }),
        };
        onGraphChange(newGraphJson);
      }, 500);
    },
    [onGraphChange],
  );

  // ── Node changes (position drag, removal) ───────────────────
  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      // After state update, propagate
      setNodes((currentNodes) => {
        // Schedule propagation with the latest state
        // We need the edges too — read from a stable ref
        setTimeout(() => {
          // Use the setter to peek at current edges without subscribing
          setEdges((currentEdges) => {
            propagateChange(currentNodes, currentEdges);
            return currentEdges;
          });
        }, 0);
        return currentNodes;
      });
    },
    [onNodesChange, setNodes, setEdges, propagateChange],
  );

  const handleEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      setEdges((currentEdges) => {
        setTimeout(() => {
          setNodes((currentNodes) => {
            propagateChange(currentNodes, currentEdges);
            return currentNodes;
          });
        }, 0);
        return currentEdges;
      });
    },
    [onEdgesChange, setEdges, setNodes, propagateChange],
  );

  // ── Connection validation (bipartite: asset ↔ operation) ────
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const sourceCategory = getNodeCategory(connection.source, graphJsonRef.current)
        // Fallback: check RF nodes for newly dropped nodes
        ?? (() => {
          const rfNode = nodes.find((n) => n.id === connection.source);
          return rfNode?.type as 'asset' | 'operation' | undefined;
        })();
      const targetCategory = getNodeCategory(connection.target, graphJsonRef.current)
        ?? (() => {
          const rfNode = nodes.find((n) => n.id === connection.target);
          return rfNode?.type as 'asset' | 'operation' | undefined;
        })();

      // Bipartite: reject same-category connections
      if (sourceCategory === targetCategory) {
        return; // silently reject
      }

      const edgeId = `edge_${connection.source}_${connection.target}`;
      const newEdge: Edge = {
        id: edgeId,
        source: connection.source,
        target: connection.target,
        animated: false,
        style: { stroke: '#444', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#666' },
      };

      setEdges((eds) => {
        const updated = [...eds, newEdge];
        setNodes((nds) => {
          propagateChange(nds, updated);
          return nds;
        });
        return updated;
      });
    },
    [nodes, setEdges, setNodes, propagateChange],
  );

  // ── Drag-and-drop from NodePalette ──────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('application/pipeline-node');
      if (!raw) return;

      let payload: { category: string; type: string; label: string };
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }

      if (!rfInstance.current) return;

      const position = rfInstance.current.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      const newNode: Node = {
        id: `node_${Date.now()}`,
        type: payload.category, // 'asset' or 'operation'
        position,
        data: {
          label: payload.label,
          assetType: payload.category === 'asset' ? payload.type : undefined,
          opType: payload.category === 'operation' ? payload.type : undefined,
        },
      };

      setNodes((nds) => {
        const updated = [...nds, newNode];
        setEdges((eds) => {
          propagateChange(updated, eds);
          return eds;
        });
        return updated;
      });
    },
    [setNodes, setEdges, propagateChange],
  );

  // ── Selection handlers ──────────────────────────────────────
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeSelect(node.id);
    },
    [onNodeSelect],
  );

  const handlePaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  // ── Cleanup debounce on unmount ─────────────────────────────
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Render ──────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={pipelineNodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onInit={(instance) => {
          rfInstance.current = instance;
        }}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        deleteKeyCode="Delete"
        style={{ background: '#0a0a0a' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#1a1a1a"
        />
        <Controls
          style={{
            button: {
              backgroundColor: '#1a1a1a',
              color: '#888',
              borderColor: '#2a2a2a',
            },
          } as React.CSSProperties}
        />
        <MiniMap
          nodeColor={(n) => (n.type === 'asset' ? '#ffaa00' : '#888')}
          maskColor="rgba(0,0,0,0.8)"
          style={{ backgroundColor: '#111' }}
        />
      </ReactFlow>
    </div>
  );
}
