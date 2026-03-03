// ============================================================
// Action Graph Panel — READ-WRITE visual node graph editor
// Wires ROS2 publishers, subscribers, transforms, and topic
// passthrough nodes. Validates connections by port type before
// accepting them. Serializes to launch-file-ready JSON.
// ============================================================

import 'reactflow/dist/style.css';

import { useCallback, useRef, useState, useEffect } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type OnConnectStartParams,
  MarkerType,
} from 'reactflow';

import { NODE_TYPES } from './ActionGraphNodes';
import type { ActionNodeData } from './ActionGraphNodes';
import {
  NODE_TEMPLATES,
  TEMPLATE_CATEGORIES,
  getTemplatesByCategory,
  PORT_TYPE_COLORS,
} from './nodeTemplates';
import type { NodeTemplate, NodeCategory, PortType } from './nodeTemplates';
import { useActionGraphStore } from '@/stores/actionGraphStore';

// ── Helpers ───────────────────────────────────────────────────

let _nodeCounter = 1;
function newNodeId(): string {
  return `node-${Date.now()}-${_nodeCounter++}`;
}

/** Extract the portType for a given handle within a node's port list. */
function getPortType(node: Node<ActionNodeData>, handleId: string | null): PortType | null {
  if (!handleId || !node.data?.ports) return null;
  const port = node.data.ports.find((p) => p.id === handleId);
  return port?.portType ?? null;
}

/** Returns true when source and target port types are wiring-compatible. */
function arePortsCompatible(
  sourceType: PortType | null,
  targetType: PortType | null,
): boolean {
  if (!sourceType || !targetType) return false;
  // Exact match required — a msg port cannot connect to a tf port, etc.
  return sourceType === targetType;
}

/** Build a human-readable launch-file JSON payload from the current graph. */
function serializeToLaunchConfig(nodes: Node<ActionNodeData>[], edges: Edge[]) {
  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.data.label,
      description: n.data.description,
      ports: n.data.ports,
      position: n.position,
    })),
    connections: edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
      targetHandle: e.targetHandle,
    })),
  };
}

// ── Panel ─────────────────────────────────────────────────────

export default function ActionGraphPanel() {
  const store = useActionGraphStore();
  const activeGraph = store.activeGraph();
  const graphId = activeGraph?.id ?? null;

  const [nodes, setNodes, onNodesChange] = useNodesState<ActionNodeData>(
    activeGraph?.nodes ?? [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(activeGraph?.edges ?? []);

  // Sync local state → store on every change
  useEffect(() => {
    if (graphId) store.updateNodes(graphId, nodes);
  }, [nodes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (graphId) store.updateEdges(graphId, edges);
  }, [edges]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load saved state when active graph changes
  useEffect(() => {
    if (activeGraph) {
      setNodes(activeGraph.nodes);
      setEdges(activeGraph.edges);
    }
  }, [activeGraph?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Connection validation ────────────────────────────────────
  const connectStartRef = useRef<OnConnectStartParams | null>(null);

  const onConnectStart = useCallback(
    (_: React.MouseEvent | React.TouchEvent, params: OnConnectStartParams) => {
      connectStartRef.current = params;
    },
    [],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      // Retrieve source & target nodes from current state
      setNodes((nds) => {
        const sourceNode = nds.find((n) => n.id === connection.source);
        const targetNode = nds.find((n) => n.id === connection.target);

        if (!sourceNode || !targetNode) return nds;

        const sourcePortType = getPortType(sourceNode as Node<ActionNodeData>, connection.sourceHandle);
        const targetPortType = getPortType(targetNode as Node<ActionNodeData>, connection.targetHandle);

        if (!arePortsCompatible(sourcePortType, targetPortType)) {
          // Incompatible — show brief flash and reject
          setConnectionError(
            `Cannot connect: "${sourcePortType ?? '?'}" → "${targetPortType ?? '?'}"`,
          );
          setTimeout(() => setConnectionError(null), 2500);
          return nds; // no state change
        }

        // Accept connection
        const edgeColor = PORT_TYPE_COLORS[sourcePortType!];
        setEdges((eds) =>
          addEdge(
            {
              ...connection,
              id: `edge-${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}`,
              type: 'smoothstep',
              animated: false,
              style: { stroke: edgeColor, strokeWidth: 1.5 },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: edgeColor,
                width: 12,
                height: 12,
              },
            },
            eds,
          ),
        );
        return nds;
      });
    },
    [setEdges, setNodes],
  );

  // ── Drag-from-sidebar ────────────────────────────────────────
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReturnType<typeof useNodesState>[2] | null>(null);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const templateId = e.dataTransfer.getData('application/action-graph-template');
      if (!templateId) return;

      const template = NODE_TEMPLATES.find((t) => t.id === templateId);
      if (!template) return;

      // Convert screen coords to flow coords
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds || !rfInstance) return;

      // rfInstance here is the reactflow instance from onInit
      const position = (rfInstance as any).screenToFlowPosition({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      });

      const newNode: Node<ActionNodeData> = {
        id: newNodeId(),
        type: template.type,
        position,
        data: {
          label: template.name,
          description: template.description,
          variant: template.type,
          ports: template.ports,
          running: false,
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [rfInstance, setNodes],
  );

  // ── Sidebar state ─────────────────────────────────────────────
  const [expandedCategories, setExpandedCategories] = useState<Set<NodeCategory>>(
    new Set(TEMPLATE_CATEGORIES),
  );

  const toggleCategory = (cat: NodeCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const onTemplateDragStart = (e: React.DragEvent, template: NodeTemplate) => {
    e.dataTransfer.setData('application/action-graph-template', template.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // ── Error / status state ──────────────────────────────────────
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [deployOutput, setDeployOutput] = useState<string | null>(null);

  // ── Graph management ──────────────────────────────────────────
  const [newGraphName, setNewGraphName] = useState('');
  const [showGraphList, setShowGraphList] = useState(false);

  const handleDeploy = () => {
    const payload = serializeToLaunchConfig(nodes, edges);
    setDeployOutput(JSON.stringify(payload, null, 2));
  };

  const handleClear = () => {
    if (!graphId) return;
    if (!window.confirm('Clear all nodes and connections from this canvas?')) return;
    store.clearCanvas(graphId);
    setNodes([]);
    setEdges([]);
  };

  const handleSave = () => {
    if (!graphId) return;
    store.updateNodes(graphId, nodes);
    store.updateEdges(graphId, edges);
  };

  const handleLoad = (id: string) => {
    store.setActiveGraph(id);
    setShowGraphList(false);
  };

  const handleNewGraph = () => {
    if (!newGraphName.trim()) return;
    store.createGraph(newGraphName.trim());
    setNewGraphName('');
    setShowGraphList(false);
  };

  // ── Styles (inline to avoid Tailwind conflicts) ───────────────
  const panelBg = '#0a0a0a';
  const surface1 = '#111111';
  const surface2 = '#171717';
  const surface3 = '#1e1e1e';
  const accent = '#ffaa00';
  const textPrimary = '#e0e0e0';
  const textMuted = '#666666';
  const borderDefault = '#2a2a2a';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: panelBg,
        color: textPrimary,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        position: 'relative',
      }}
    >
      {/* ── Top toolbar ─────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderBottom: `1px solid ${borderDefault}`,
          background: surface1,
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        {/* Graph selector */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowGraphList((v) => !v)}
            style={toolbarButtonStyle(surface2, borderDefault, textPrimary)}
            title="Switch graph"
          >
            {activeGraph?.name ?? 'No graph'}
            <span style={{ marginLeft: 4, fontSize: 9, color: textMuted }}>▼</span>
          </button>

          {showGraphList && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                background: surface2,
                border: `1px solid ${borderDefault}`,
                borderRadius: 4,
                zIndex: 999,
                minWidth: 200,
                padding: 6,
                marginTop: 2,
                boxShadow: '0 4px 16px #000a',
              }}
            >
              {Object.values(store.graphs).map((g) => (
                <div
                  key={g.id}
                  onClick={() => handleLoad(g.id)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 3,
                    cursor: 'pointer',
                    background: g.id === graphId ? `${accent}22` : 'transparent',
                    color: g.id === graphId ? accent : textPrimary,
                    fontSize: 11,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = `${accent}18`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      g.id === graphId ? `${accent}22` : 'transparent';
                  }}
                >
                  {g.name}
                </div>
              ))}
              <hr style={{ border: 'none', borderTop: `1px solid ${borderDefault}`, margin: '4px 0' }} />
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  style={{
                    flex: 1,
                    background: surface3,
                    border: `1px solid ${borderDefault}`,
                    borderRadius: 3,
                    color: textPrimary,
                    fontSize: 11,
                    padding: '3px 6px',
                    outline: 'none',
                  }}
                  placeholder="New graph name..."
                  value={newGraphName}
                  onChange={(e) => setNewGraphName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNewGraph()}
                />
                <button
                  onClick={handleNewGraph}
                  style={toolbarButtonStyle(accent + '22', accent + '55', accent)}
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 18, background: borderDefault, flexShrink: 0 }} />

        {/* Node count badge */}
        <span style={{ fontSize: 10, color: textMuted, fontFamily: 'monospace' }}>
          {nodes.length} nodes · {edges.length} edges
        </span>

        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        <button
          onClick={handleSave}
          style={toolbarButtonStyle(surface2, borderDefault, textPrimary)}
          title="Save graph state"
        >
          Save
        </button>
        <button
          onClick={handleClear}
          style={toolbarButtonStyle(surface2, '#5a2a2a', '#cc6666')}
          title="Clear all nodes and edges"
        >
          Clear
        </button>
        <button
          onClick={handleDeploy}
          style={toolbarButtonStyle(`${accent}22`, `${accent}55`, accent)}
          title="Serialize graph to launch config JSON"
        >
          Deploy
        </button>
      </div>

      {/* ── Main area: sidebar + canvas ───────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── Left sidebar: Node Library ──────────────────────── */}
        <div
          style={{
            width: 200,
            flexShrink: 0,
            borderRight: `1px solid ${borderDefault}`,
            background: surface1,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              padding: '6px 10px',
              fontSize: 10,
              fontWeight: 700,
              color: textMuted,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              borderBottom: `1px solid ${borderDefault}`,
              flexShrink: 0,
            }}
          >
            Node Library
          </div>

          {TEMPLATE_CATEGORIES.map((cat) => {
            const templates = getTemplatesByCategory(cat);
            const isOpen = expandedCategories.has(cat);

            return (
              <div key={cat}>
                {/* Category header */}
                <div
                  onClick={() => toggleCategory(cat)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '5px 10px',
                    cursor: 'pointer',
                    background: surface2,
                    borderBottom: `1px solid ${borderDefault}`,
                    userSelect: 'none',
                  }}
                >
                  <span style={{ fontSize: 9, color: textMuted, width: 10 }}>
                    {isOpen ? '▼' : '▶'}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {cat}
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 9,
                      color: textMuted,
                      background: surface3,
                      borderRadius: 8,
                      padding: '0 4px',
                    }}
                  >
                    {templates.length}
                  </span>
                </div>

                {/* Template items */}
                {isOpen &&
                  templates.map((tpl) => (
                    <TemplateItem
                      key={tpl.id}
                      template={tpl}
                      onDragStart={onTemplateDragStart}
                      surface3={surface3}
                      borderDefault={borderDefault}
                      textPrimary={textPrimary}
                      textMuted={textMuted}
                    />
                  ))}
              </div>
            );
          })}
        </div>

        {/* ── Canvas ─────────────────────────────────────────── */}
        <div ref={reactFlowWrapper} style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onInit={(instance) => setRfInstance(instance as any)}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={NODE_TYPES}
            nodesDraggable={true}
            nodesConnectable={true}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            deleteKeyCode="Delete"
            snapToGrid={true}
            snapGrid={[12, 12]}
            defaultEdgeOptions={{
              type: 'smoothstep',
              style: { stroke: '#555', strokeWidth: 1.5 },
            }}
            style={{ background: panelBg }}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="#2a2a2a"
            />
            <Controls
              style={{
                background: surface2,
                border: `1px solid ${borderDefault}`,
                borderRadius: 4,
              }}
            />
            <MiniMap
              style={{
                background: surface2,
                border: `1px solid ${borderDefault}`,
              }}
              nodeColor={(n: Node<ActionNodeData>) => {
                const variant = n.data?.variant ?? 'topic-node';
                const map: Record<string, string> = {
                  'publisher-node': '#ffaa00',
                  'subscriber-node': '#00cc66',
                  'transform-node': '#4499ff',
                  'topic-node': '#666666',
                };
                return map[variant] ?? '#444';
              }}
              maskColor="#0a0a0a88"
            />
          </ReactFlow>

          {/* Empty state hint */}
          {nodes.length === 0 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 28, opacity: 0.12 }}>⬡</div>
              <div style={{ fontSize: 12, color: '#333', textAlign: 'center', lineHeight: 1.6 }}>
                Drag nodes from the library to build your graph.
                <br />
                <span style={{ fontSize: 10, color: '#2a2a2a' }}>
                  Connect output → input handles of matching types.
                </span>
              </div>
            </div>
          )}

          {/* Connection type error toast */}
          {connectionError && (
            <div
              style={{
                position: 'absolute',
                bottom: 60,
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#3a1515',
                border: '1px solid #cc444444',
                borderRadius: 4,
                padding: '6px 14px',
                fontSize: 11,
                color: '#cc6666',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px #000a',
              }}
            >
              {connectionError}
            </div>
          )}
        </div>
      </div>

      {/* ── Deploy output modal ───────────────────────────────── */}
      {deployOutput && (
        <DeployModal
          output={deployOutput}
          onClose={() => setDeployOutput(null)}
          surface1={surface1}
          surface2={surface2}
          borderDefault={borderDefault}
          textPrimary={textPrimary}
          textMuted={textMuted}
          accent={accent}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

interface TemplateItemProps {
  template: NodeTemplate;
  onDragStart: (e: React.DragEvent, t: NodeTemplate) => void;
  surface3: string;
  borderDefault: string;
  textPrimary: string;
  textMuted: string;
}

function TemplateItem({
  template,
  onDragStart,
  surface3,
  borderDefault,
  textPrimary,
  textMuted,
}: TemplateItemProps) {
  const [hovered, setHovered] = useState(false);

  const inputCount = template.ports.filter((p) => p.direction === 'in').length;
  const outputCount = template.ports.filter((p) => p.direction === 'out').length;

  const variantColors: Record<string, string> = {
    'publisher-node': '#ffaa00',
    'subscriber-node': '#00cc66',
    'transform-node': '#4499ff',
    'topic-node': '#666666',
  };
  const accentColor = variantColors[template.type] ?? '#888';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, template)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '6px 10px',
        borderBottom: `1px solid ${borderDefault}`,
        cursor: 'grab',
        background: hovered ? `${accentColor}10` : 'transparent',
        transition: 'background 0.1s',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 1,
            background: accentColor,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 11, fontWeight: 600, color: textPrimary }}>
          {template.name}
        </span>
      </div>
      <div style={{ fontSize: 9, color: textMuted, lineHeight: 1.4, paddingLeft: 10 }}>
        {template.description}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 3, paddingLeft: 10 }}>
        {inputCount > 0 && (
          <span style={{ fontSize: 8, color: '#555', fontFamily: 'monospace' }}>
            ←{inputCount} in
          </span>
        )}
        {outputCount > 0 && (
          <span style={{ fontSize: 8, color: '#555', fontFamily: 'monospace' }}>
            {outputCount} out→
          </span>
        )}
      </div>
    </div>
  );
}

interface DeployModalProps {
  output: string;
  onClose: () => void;
  surface1: string;
  surface2: string;
  borderDefault: string;
  textPrimary: string;
  textMuted: string;
  accent: string;
}

function DeployModal({
  output,
  onClose,
  surface1,
  surface2,
  borderDefault,
  textPrimary,
  textMuted,
  accent,
}: DeployModalProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(output).catch(() => undefined);
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#000000bb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: surface1,
          border: `1px solid ${borderDefault}`,
          borderRadius: 6,
          width: '60%',
          maxWidth: 640,
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px #000c',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 12px',
            borderBottom: `1px solid ${borderDefault}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: accent }}>
            Launch Config JSON
          </span>
          <span style={{ fontSize: 10, color: textMuted, marginLeft: 8 }}>
            — copy to launch file builder
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleCopy}
            style={toolbarButtonStyle(surface2, borderDefault, textPrimary)}
          >
            Copy
          </button>
          <button
            onClick={onClose}
            style={{ ...toolbarButtonStyle(surface2, borderDefault, '#888'), marginLeft: 4 }}
          >
            ✕
          </button>
        </div>

        {/* JSON output */}
        <pre
          style={{
            flex: 1,
            overflowY: 'auto',
            margin: 0,
            padding: '10px 12px',
            fontSize: 10,
            fontFamily: 'monospace',
            color: '#ccc',
            background: '#0c0c0c',
            lineHeight: 1.5,
          }}
        >
          {output}
        </pre>
      </div>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────

function toolbarButtonStyle(
  bg: string,
  border: string,
  color: string,
): React.CSSProperties {
  return {
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 3,
    color,
    fontSize: 11,
    padding: '3px 9px',
    cursor: 'pointer',
    outline: 'none',
    fontFamily: 'system-ui, sans-serif',
    whiteSpace: 'nowrap',
  };
}
