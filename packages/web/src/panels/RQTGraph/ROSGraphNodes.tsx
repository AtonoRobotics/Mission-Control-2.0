import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';

// ─── Shared style helpers ────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  opacity: 0.55,
  marginBottom: 2,
  fontFamily: 'var(--font-mono)',
};

const nameStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 160,
};

const handleBaseStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  width: 8,
  height: 8,
};

// ─── ROS Node (rounded rectangle, amber border) ──────────────────────────────

export const RosNodeComponent = memo(({ data, selected }: NodeProps) => {
  const border = selected ? 'var(--accent)' : '#ffaa00';

  return (
    <div
      style={{
        background: 'var(--bg-surface-2)',
        border: `1.5px solid ${border}`,
        borderRadius: 6,
        padding: '6px 12px',
        minWidth: 140,
        maxWidth: 180,
        boxShadow: selected ? '0 0 0 2px var(--accent-glow)' : 'none',
        cursor: 'default',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ ...handleBaseStyle, left: -4 }}
      />

      <div style={labelStyle}>node</div>
      <div style={nameStyle} title={data.label as string}>
        {data.label as string}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ ...handleBaseStyle, right: -4 }}
      />
    </div>
  );
});
RosNodeComponent.displayName = 'RosNode';

// ─── ROS Topic (diamond / rotated square, blue border) ───────────────────────

export const RosTopicComponent = memo(({ data, selected }: NodeProps) => {
  const border = selected ? '#77bbff' : '#4499ff';

  return (
    <div
      style={{
        width: 140,
        height: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        cursor: 'default',
      }}
    >
      {/* Rotated square forming the diamond */}
      <div
        style={{
          position: 'absolute',
          width: 38,
          height: 38,
          background: 'var(--bg-surface-2)',
          border: `1.5px solid ${border}`,
          transform: 'rotate(45deg)',
          boxShadow: selected ? `0 0 0 2px rgba(68,153,255,0.2)` : 'none',
          left: 0,
        }}
      />

      {/* Text layer on top — not rotated */}
      <div
        style={{
          position: 'relative',
          marginLeft: 50,
          flex: 1,
          paddingRight: 4,
        }}
      >
        <div style={{ ...labelStyle, color: '#4499ff' }}>topic</div>
        <div style={nameStyle} title={data.label as string}>
          {data.label as string}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        style={{ ...handleBaseStyle, left: -4 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ ...handleBaseStyle, right: -4 }}
      />
    </div>
  );
});
RosTopicComponent.displayName = 'RosTopic';

// ─── ROS Service (hexagon, green border) ─────────────────────────────────────

/**
 * CSS-only hexagon: two pseudo-like divs stacked to form a 6-sided polygon.
 * We use clip-path for a clean hexagon without SVG overhead.
 */
export const RosServiceComponent = memo(({ data, selected }: NodeProps) => {
  const border = selected ? '#33ee88' : '#00cc66';
  // clip-path polygon — flat-top hexagon proportioned for 100×44
  const hex =
    'polygon(14% 0%, 86% 0%, 100% 50%, 86% 100%, 14% 100%, 0% 50%)';

  return (
    <div
      style={{
        width: 140,
        height: 50,
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        cursor: 'default',
      }}
    >
      {/* Hexagon border layer (slightly larger, border colour) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 3,
          width: 44,
          height: 44,
          background: border,
          clipPath: hex,
        }}
      />
      {/* Hexagon fill layer (inset by 1.5px — simulates a border) */}
      <div
        style={{
          position: 'absolute',
          left: 1.5,
          top: 4.5,
          width: 41,
          height: 41,
          background: 'var(--bg-surface-2)',
          clipPath: hex,
          boxShadow: selected ? `0 0 0 2px rgba(0,204,102,0.2)` : 'none',
        }}
      />

      {/* Text */}
      <div
        style={{
          position: 'relative',
          marginLeft: 54,
          flex: 1,
          paddingRight: 4,
        }}
      >
        <div style={{ ...labelStyle, color: '#00cc66' }}>service</div>
        <div style={nameStyle} title={data.label as string}>
          {data.label as string}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        style={{ ...handleBaseStyle, left: -4 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ ...handleBaseStyle, right: -4 }}
      />
    </div>
  );
});
RosServiceComponent.displayName = 'RosService';

// ─── nodeTypes map (pass directly to ReactFlow) ──────────────────────────────

export const nodeTypes = {
  'ros-node':    RosNodeComponent,
  'ros-topic':   RosTopicComponent,
  'ros-service': RosServiceComponent,
} as const;
