import dagre from '@dagrejs/dagre';
import type { Node, Edge } from 'reactflow';

// Node dimensions by type
const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  'ros-node':    { width: 180, height: 50 },
  'ros-topic':   { width: 140, height: 50 },
  'ros-service': { width: 140, height: 50 },
};

const DEFAULT_DIMENSIONS = { width: 160, height: 50 };

/**
 * Compute left-to-right dagre layout for a set of ReactFlow nodes and edges.
 * Returns new node/edge arrays with `position` updated — original objects are
 * not mutated.
 */
export function layoutGraph(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();

  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',   // left-to-right flow
    nodesep: 60,     // vertical separation between nodes in the same rank
    ranksep: 120,    // horizontal separation between ranks
    marginx: 20,
    marginy: 20,
  });

  // Register nodes with their dimensions
  for (const node of nodes) {
    const dims = NODE_DIMENSIONS[node.type ?? ''] ?? DEFAULT_DIMENSIONS;
    g.setNode(node.id, { width: dims.width, height: dims.height });
  }

  // Register edges
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  // Map positions back onto ReactFlow nodes (centered on the dagre anchor)
  const laid = nodes.map((node) => {
    const dims = NODE_DIMENSIONS[node.type ?? ''] ?? DEFAULT_DIMENSIONS;
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - dims.width / 2,
        y: pos.y - dims.height / 2,
      },
    };
  });

  return { nodes: laid, edges };
}
