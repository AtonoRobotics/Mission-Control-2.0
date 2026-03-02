import { useEffect, useCallback, useRef, useState } from 'react';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import type { Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';

import { Service } from 'roslib';
import { getRos, getStatus } from '@/ros/connection';
import { layoutGraph } from './graphLayout';
import { nodeTypes } from './ROSGraphNodes';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ROSGraph {
  nodes: string[];        // node names  e.g. ['/rviz', '/robot_state_publisher']
  topics: string[];       // topic names e.g. ['/joint_states', '/tf']
  topicTypes: string[];   // parallel array of message types
  publishers: Record<string, string[]>;   // topic → node names that publish
  subscribers: Record<string, string[]>;  // topic → node names that subscribe
  services: string[];     // service names
  serviceTypes: string[]; // parallel array of service types
  serviceProviders: Record<string, string[]>; // service → node names
}

// ─── fetchROSGraph ────────────────────────────────────────────────────────────
/**
 * Calls rosapi services to retrieve the live ROS2 computation graph.
 * Falls back to empty arrays if rosbridge / rosapi is unavailable.
 */
async function fetchROSGraph(): Promise<ROSGraph> {
  // Only attempt if rosbridge is connected
  if (getStatus() !== 'connected') {
    return emptyGraph();
  }

  const ros = getRos();

  // Helper: wrap a roslib Service call in a Promise with a timeout
  function callService<T>(name: string, serviceType: string, request = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const svc = new Service({ ros, name, serviceType });
      const timer = setTimeout(() => reject(new Error(`timeout: ${name}`)), 4000);
      svc.callService(
        request,
        (result: any) => { clearTimeout(timer); resolve(result as T); },
        (err: string) => { clearTimeout(timer); reject(new Error(err)); },
      );
    });
  }

  try {
    // 1. Fetch topic list (names + types in parallel arrays)
    const topicsResult = await callService<{ topics: string[]; types: string[] }>(
      '/rosapi/topics',
      'rosapi/Topics',
    );

    // 2. Fetch node list
    const nodesResult = await callService<{ nodes: string[] }>(
      '/rosapi/nodes',
      'rosapi/Nodes',
    );

    // 3. Fetch service list (best-effort)
    let servicesResult: { services: string[]; types: string[] } = { services: [], types: [] };
    try {
      servicesResult = await callService<{ services: string[]; types: string[] }>(
        '/rosapi/services',
        'rosapi/Services',
      );
    } catch {
      // rosapi/services may not be available on all setups — ignore
    }

    // 4. For each topic fetch publishers and subscribers (best-effort, parallel)
    const topics = topicsResult.topics ?? [];
    const pubSubResults = await Promise.allSettled(
      topics.map((topic) =>
        callService<{ publishers: string[]; subscribers: string[] }>(
          '/rosapi/topic_type',
          'rosapi/TopicType',
          { topic },
        ),
      ),
    );

    // Build publisher/subscriber maps from node_details (if available)
    // rosapi/nodes_for_topic gives publishers+subscribers per topic
    const publishers: Record<string, string[]> = {};
    const subscribers: Record<string, string[]> = {};

    await Promise.allSettled(
      topics.map(async (topic) => {
        try {
          const detail = await callService<{ publishers: string[]; subscribers: string[] }>(
            '/rosapi/nodes_for_topic',
            'rosapi/NodesForTopic',
            { topic },
          );
          if (detail.publishers?.length) publishers[topic] = detail.publishers;
          if (detail.subscribers?.length) subscribers[topic] = detail.subscribers;
        } catch {
          // not all rosapi versions expose this endpoint
        }
      }),
    );

    // Service providers (best-effort)
    const serviceProviders: Record<string, string[]> = {};
    const services = servicesResult.services ?? [];
    await Promise.allSettled(
      services.map(async (svc) => {
        try {
          const detail = await callService<{ providers: string[] }>(
            '/rosapi/service_providers',
            'rosapi/ServiceProviders',
            { service: svc },
          );
          if (detail.providers?.length) serviceProviders[svc] = detail.providers;
        } catch {}
      }),
    );

    void pubSubResults; // used indirectly via the nodes_for_topic calls above

    return {
      nodes: nodesResult.nodes ?? [],
      topics,
      topicTypes: topicsResult.types ?? [],
      publishers,
      subscribers,
      serviceProviders,
      services,
      serviceTypes: servicesResult.types ?? [],
    };
  } catch {
    return emptyGraph();
  }
}

function emptyGraph(): ROSGraph {
  return {
    nodes: [], topics: [], topicTypes: [],
    publishers: {}, subscribers: {},
    services: [], serviceTypes: [], serviceProviders: {},
  };
}

// ─── Graph conversion (ROSGraph → ReactFlow nodes + edges) ───────────────────

function rosGraphToFlow(graph: ROSGraph): { nodes: Node[]; edges: Edge[] } {
  const rfNodes: Node[] = [];
  const rfEdges: Edge[] = [];

  // ROS nodes
  for (const name of graph.nodes) {
    rfNodes.push({
      id: `node::${name}`,
      type: 'ros-node',
      position: { x: 0, y: 0 },
      data: { label: name },
      selectable: true,
      draggable: true,
    });
  }

  // Topics — only include topics that have at least one pub or sub connection
  for (const topic of graph.topics) {
    const pubs = graph.publishers[topic] ?? [];
    const subs = graph.subscribers[topic] ?? [];
    if (pubs.length === 0 && subs.length === 0) continue;

    rfNodes.push({
      id: `topic::${topic}`,
      type: 'ros-topic',
      position: { x: 0, y: 0 },
      data: { label: topic },
      selectable: true,
      draggable: true,
    });

    // publisher → topic edges
    for (const pub of pubs) {
      rfEdges.push({
        id: `e_pub::${pub}::${topic}`,
        source: `node::${pub}`,
        target: `topic::${topic}`,
        animated: true,
        style: { stroke: '#555', strokeWidth: 1.5 },
        type: 'smoothstep',
      });
    }

    // topic → subscriber edges
    for (const sub of subs) {
      rfEdges.push({
        id: `e_sub::${topic}::${sub}`,
        source: `topic::${topic}`,
        target: `node::${sub}`,
        animated: false,
        style: { stroke: '#444', strokeWidth: 1.5 },
        type: 'smoothstep',
      });
    }
  }

  // Services — only include services that have a known provider
  for (const svc of graph.services) {
    const providers = graph.serviceProviders[svc] ?? [];
    if (providers.length === 0) continue;

    rfNodes.push({
      id: `svc::${svc}`,
      type: 'ros-service',
      position: { x: 0, y: 0 },
      data: { label: svc },
      selectable: true,
      draggable: true,
    });

    for (const provider of providers) {
      rfEdges.push({
        id: `e_svc::${provider}::${svc}`,
        source: `node::${provider}`,
        target: `svc::${svc}`,
        animated: false,
        style: { stroke: '#2a6644', strokeWidth: 1.5, strokeDasharray: '4 3' },
        type: 'smoothstep',
      });
    }
  }

  return layoutGraph(rfNodes, rfEdges);
}

// ─── Inner component (needs ReactFlowProvider context for useReactFlow) ───────

function RQTGraphInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [topicCount, setTopicCount] = useState(0);

  const { fitView } = useReactFlow();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const graph = await fetchROSGraph();
      const { nodes: laidNodes, edges: laidEdges } = rosGraphToFlow(graph);
      setNodes(laidNodes);
      setEdges(laidEdges);
      setNodeCount(graph.nodes.length);
      setTopicCount(graph.topics.length);
      setLastRefresh(new Date());
      // Fit after next paint
      requestAnimationFrame(() => fitView({ padding: 0.12, duration: 300 }));
    } finally {
      setLoading(false);
    }
  }, [fitView, setNodes, setEdges]);

  // Initial fetch + 5-second poll
  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)' }}>
      {/* ── Toolbar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '6px 10px',
          background: 'var(--bg-surface-1)',
          borderBottom: '1px solid var(--border-default)',
          flexShrink: 0,
        }}
      >
        <span style={{ color: 'var(--text-accent)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>
          RQT GRAPH
        </span>

        <div style={{ flex: 1 }} />

        {/* Stats */}
        <span style={{ color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
          {nodeCount} nodes · {topicCount} topics
        </span>

        {lastRefresh && (
          <span style={{ color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
            {formatTime(lastRefresh)}
          </span>
        )}

        {/* Refresh button */}
        <button
          onClick={refresh}
          disabled={loading}
          style={{
            background: loading ? 'var(--bg-surface-3)' : 'var(--bg-surface-2)',
            border: `1px solid ${loading ? 'var(--border-default)' : 'var(--border-active)'}`,
            borderRadius: 4,
            color: loading ? 'var(--text-muted)' : 'var(--text-accent)',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            padding: '3px 10px',
            letterSpacing: '0.04em',
          }}
        >
          {loading ? 'LOADING…' : 'REFRESH'}
        </button>
      </div>

      {/* ── Legend ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '4px 10px',
          background: 'var(--bg-surface-1)',
          borderBottom: '1px solid var(--border-default)',
          flexShrink: 0,
        }}
      >
        <LegendItem color="#ffaa00" label="Node" shape="rect" />
        <LegendItem color="#4499ff" label="Topic" shape="diamond" />
        <LegendItem color="#00cc66" label="Service" shape="hex" />
      </div>

      {/* ── ReactFlow canvas ── */}
      <div style={{ flex: 1, position: 'relative' }}>
        {nodes.length === 0 && !loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              zIndex: 5,
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: 24, opacity: 0.3 }}>⬡</span>
            <span>No ROS2 graph data</span>
            <span style={{ fontSize: 10, opacity: 0.6 }}>rosbridge not connected or no nodes running</span>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          // READ-ONLY: draggable for repositioning, not connectable
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          panOnDrag={true}
          zoomOnScroll={true}
          fitView
          style={{ background: '#0a0a0a' }}
          proOptions={{ hideAttribution: true }}
        >
          <Controls
            style={{
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
            }}
          />
          <MiniMap
            style={{
              background: 'var(--bg-surface-1)',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
            }}
            maskColor="rgba(0,0,0,0.6)"
            nodeColor={(n) => {
              if (n.type === 'ros-node')    return '#ffaa00';
              if (n.type === 'ros-topic')   return '#4499ff';
              if (n.type === 'ros-service') return '#00cc66';
              return '#555';
            }}
          />
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#1e1e1e"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

// ─── Legend helper ────────────────────────────────────────────────────────────

function LegendItem({
  color,
  label,
  shape,
}: {
  color: string;
  label: string;
  shape: 'rect' | 'diamond' | 'hex';
}) {
  const shapeEl = (() => {
    if (shape === 'rect') {
      return (
        <div
          style={{
            width: 12,
            height: 8,
            border: `1.5px solid ${color}`,
            borderRadius: 2,
            background: 'var(--bg-surface-2)',
          }}
        />
      );
    }
    if (shape === 'diamond') {
      return (
        <div
          style={{
            width: 8,
            height: 8,
            border: `1.5px solid ${color}`,
            background: 'var(--bg-surface-2)',
            transform: 'rotate(45deg)',
          }}
        />
      );
    }
    // hex — simplified with clip-path
    return (
      <div
        style={{
          width: 12,
          height: 12,
          background: color,
          clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
          opacity: 0.85,
        }}
      />
    );
  })();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {shapeEl}
      <span style={{ color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
        {label}
      </span>
    </div>
  );
}

// ─── Public export (wrapped in provider) ─────────────────────────────────────

export default function RQTGraphPanel() {
  return (
    <ReactFlowProvider>
      <RQTGraphInner />
    </ReactFlowProvider>
  );
}
