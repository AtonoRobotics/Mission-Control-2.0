// ============================================================
// Pipeline Operation Node — custom React Flow node for
// transform/operation steps in the Physical AI Pipeline DAG.
// ============================================================

import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';

export interface OperationNodeData {
  label: string;
  opType: string;
  status?: 'pending' | 'running' | 'complete' | 'failed';
  progress?: number; // 0-100
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#666666',
  running: 'var(--accent, #ffaa00)',
  complete: 'var(--success, #00cc66)',
  failed: 'var(--danger, #ff4444)',
};

const STATUS_BAR_COLORS: Record<string, string> = {
  pending: '#444444',
  running: 'var(--accent, #ffaa00)',
  complete: 'var(--success, #00cc66)',
  failed: 'var(--danger, #ff4444)',
};

const handleBase: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#ffffff',
  border: '1.5px solid #444',
};

export default memo(function OperationNode({ data, selected }: NodeProps<OperationNodeData>) {
  const borderColor = selected ? 'var(--accent, #ffaa00)' : '#444444';
  const barColor = STATUS_BAR_COLORS[data.status ?? 'pending'];

  return (
    <div
      style={{
        width: 170,
        background: 'var(--bg-surface-1, #111111)',
        border: `1px solid ${borderColor}`,
        borderRadius: 4,
        overflow: 'hidden',
        boxShadow: selected
          ? '0 0 10px var(--accent-glow, rgba(255,170,0,0.15))'
          : '0 2px 6px #00000060',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        position: 'relative',
      }}
    >
      {/* Target handle — top center */}
      <Handle type="target" position={Position.Top} style={handleBase} />

      {/* Top accent bar */}
      <div
        style={{
          height: 2,
          background: barColor,
          transition: 'background 0.3s',
        }}
      />

      {/* Content area */}
      <div style={{ padding: '8px 10px' }}>
        {/* Category label + status dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <span
            style={{
              fontSize: 8,
              fontFamily: 'var(--font-mono, monospace)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-muted, #666666)',
              lineHeight: 1,
            }}
          >
            OPERATION
          </span>
          {data.status && (
            <span
              style={{
                marginLeft: 'auto',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: STATUS_COLORS[data.status] ?? '#666',
                flexShrink: 0,
                boxShadow:
                  data.status === 'running'
                    ? '0 0 4px var(--accent, #ffaa00)'
                    : 'none',
              }}
            />
          )}
        </div>

        {/* Node label */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-primary, #e0e0e0)',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 5,
          }}
          title={data.label}
        >
          {data.label}
        </div>

        {/* Bottom row: op type badge + progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 9,
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--text-secondary, #888888)',
              background: 'rgba(255, 255, 255, 0.06)',
              borderRadius: 9,
              padding: '1px 7px',
              lineHeight: 1.5,
            }}
          >
            {data.opType}
          </span>
          {data.status === 'running' && data.progress != null && (
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 9,
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--accent, #ffaa00)',
                lineHeight: 1,
              }}
            >
              {Math.round(data.progress)}%
            </span>
          )}
        </div>
      </div>

      {/* Source handle — bottom center */}
      <Handle type="source" position={Position.Bottom} style={handleBase} />
    </div>
  );
});
