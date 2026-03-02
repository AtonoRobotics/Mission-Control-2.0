// ============================================================
// Action Graph — Custom Node Components
// Four node variants: publisher, subscriber, transform, topic.
// Handles are color-coded by port type with explicit IDs so
// connections can be validated by type in ActionGraphPanel.
// ============================================================

import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { PORT_TYPE_COLORS } from './nodeTemplates';
import type { PortDef, NodeVariant } from './nodeTemplates';

// ── Node border colors by variant ────────────────────────────
const VARIANT_COLORS: Record<NodeVariant, string> = {
  'publisher-node': '#ffaa00',
  'subscriber-node': '#00cc66',
  'transform-node': '#4499ff',
  'topic-node': '#666666',
};

const VARIANT_LABELS: Record<NodeVariant, string> = {
  'publisher-node': 'PUB',
  'subscriber-node': 'SUB',
  'transform-node': 'XFMR',
  'topic-node': 'TOPIC',
};

// ── Shared node data shape ────────────────────────────────────
export interface ActionNodeData {
  label: string;
  description?: string;
  variant: NodeVariant;
  ports: PortDef[];
  running?: boolean;
}

// ── Handle component with label ───────────────────────────────
interface TypedHandleProps {
  port: PortDef;
  index: number;
  total: number;
}

function TypedHandle({ port, index, total }: TypedHandleProps) {
  const isInput = port.direction === 'in';
  const color = PORT_TYPE_COLORS[port.portType];

  // Distribute handles evenly along the node edge
  const topPct = total === 1 ? 50 : 20 + (index / (total - 1)) * 60;

  const handleStyle: React.CSSProperties = {
    background: color,
    border: `1.5px solid ${color}`,
    width: 9,
    height: 9,
    borderRadius: 2,
    top: `${topPct}%`,
    // Offset slightly outward so the label doesn't overlap
    [isInput ? 'left' : 'right']: -5,
  };

  const labelStyle: React.CSSProperties = {
    position: 'absolute',
    top: `${topPct}%`,
    transform: 'translateY(-50%)',
    [isInput ? 'left' : 'right']: 14,
    fontSize: 9,
    lineHeight: 1,
    color: '#999',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    fontFamily: 'monospace',
  };

  return (
    <>
      <Handle
        type={isInput ? 'target' : 'source'}
        position={isInput ? Position.Left : Position.Right}
        id={port.id}
        style={handleStyle}
        title={`${port.label} (${port.portType})`}
      />
      <span style={labelStyle}>{port.label}</span>
    </>
  );
}

// ── Port type legend dot ───────────────────────────────────────
function PortLegendDot({ portType }: { portType: PortDef['portType'] }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: 1,
        background: PORT_TYPE_COLORS[portType],
        marginRight: 3,
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    />
  );
}

// ── Base node shell ────────────────────────────────────────────
interface BaseNodeShellProps {
  data: ActionNodeData;
  selected: boolean;
  children?: React.ReactNode;
}

function BaseNodeShell({ data, selected, children }: BaseNodeShellProps) {
  const borderColor = VARIANT_COLORS[data.variant];
  const badgeLabel = VARIANT_LABELS[data.variant];

  const inputs = data.ports.filter((p) => p.direction === 'in');
  const outputs = data.ports.filter((p) => p.direction === 'out');
  const maxPorts = Math.max(inputs.length, outputs.length, 1);

  // Minimum height so handles don't crowd
  const minHeight = Math.max(64, 24 + maxPorts * 20);

  return (
    <div
      style={{
        background: '#151515',
        border: `1.5px solid ${selected ? '#fff' : borderColor}`,
        borderRadius: 4,
        minWidth: 180,
        minHeight,
        position: 'relative',
        boxShadow: selected
          ? `0 0 0 1px ${borderColor}44`
          : `0 2px 8px #00000080`,
        transition: 'border-color 0.1s, box-shadow 0.1s',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          background: `${borderColor}18`,
          borderBottom: `1px solid ${borderColor}44`,
          borderRadius: '3px 3px 0 0',
          padding: '4px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minHeight: 26,
        }}
      >
        {/* Type badge */}
        <span
          style={{
            fontSize: 8,
            fontFamily: 'monospace',
            color: borderColor,
            background: `${borderColor}22`,
            border: `1px solid ${borderColor}55`,
            borderRadius: 2,
            padding: '1px 4px',
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}
        >
          {badgeLabel}
        </span>

        {/* Label */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#e0e0e0',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data.label}
        </span>

        {/* Running indicator */}
        {data.running && (
          <span
            style={{
              marginLeft: 'auto',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#00cc66',
              flexShrink: 0,
              boxShadow: '0 0 4px #00cc6688',
            }}
          />
        )}
      </div>

      {/* Body */}
      <div
        style={{
          padding: '6px 8px',
          paddingLeft: inputs.length ? 20 : 8,
          paddingRight: outputs.length ? 20 : 8,
          position: 'relative',
          minHeight: minHeight - 26,
        }}
      >
        {/* Description */}
        {data.description && (
          <div
            style={{
              fontSize: 9,
              color: '#666',
              lineHeight: 1.4,
              marginBottom: 4,
              maxWidth: 160,
            }}
          >
            {data.description}
          </div>
        )}

        {/* Port type legend strip */}
        {data.ports.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '2px 8px',
              marginTop: 2,
            }}
          >
            {Array.from(new Set(data.ports.map((p) => p.portType))).map((pt) => (
              <span
                key={pt}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 8,
                  color: PORT_TYPE_COLORS[pt],
                  fontFamily: 'monospace',
                }}
              >
                <PortLegendDot portType={pt} />
                {pt}
              </span>
            ))}
          </div>
        )}

        {children}
      </div>

      {/* Input handles */}
      {inputs.map((port, i) => (
        <TypedHandle key={port.id} port={port} index={i} total={inputs.length} />
      ))}

      {/* Output handles */}
      {outputs.map((port, i) => (
        <TypedHandle key={port.id} port={port} index={i} total={outputs.length} />
      ))}
    </div>
  );
}

// ── Concrete node components (each registered by type key) ────

export const PublisherNode = memo(({ data, selected }: NodeProps<ActionNodeData>) => (
  <BaseNodeShell data={{ ...data, variant: 'publisher-node' }} selected={selected} />
));

export const SubscriberNode = memo(({ data, selected }: NodeProps<ActionNodeData>) => (
  <BaseNodeShell data={{ ...data, variant: 'subscriber-node' }} selected={selected} />
));

export const TransformNode = memo(({ data, selected }: NodeProps<ActionNodeData>) => (
  <BaseNodeShell data={{ ...data, variant: 'transform-node' }} selected={selected} />
));

// Topic node is a minimal passthrough with one in + one out
export const TopicNode = memo(({ data, selected }: NodeProps<ActionNodeData>) => (
  <BaseNodeShell data={{ ...data, variant: 'topic-node' }} selected={selected}>
    <div
      style={{
        marginTop: 4,
        fontSize: 9,
        color: '#555',
        fontFamily: 'monospace',
        textAlign: 'center',
      }}
    >
      passthrough
    </div>
  </BaseNodeShell>
));

PublisherNode.displayName = 'PublisherNode';
SubscriberNode.displayName = 'SubscriberNode';
TransformNode.displayName = 'TransformNode';
TopicNode.displayName = 'TopicNode';

// ── nodeTypes map for ReactFlow ───────────────────────────────
export const NODE_TYPES = {
  'publisher-node': PublisherNode,
  'subscriber-node': SubscriberNode,
  'transform-node': TransformNode,
  'topic-node': TopicNode,
} as const;
