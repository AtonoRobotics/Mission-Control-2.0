// ============================================================
// Pipeline Asset Node — custom React Flow node for data/asset
// nodes in the Physical AI Pipeline bipartite DAG.
// ============================================================

import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';

export interface AssetNodeData {
  label: string;
  assetType: string;
  status?: 'pending' | 'running' | 'complete' | 'failed';
  version?: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#666666',
  running: 'var(--accent, #ffaa00)',
  complete: 'var(--success, #00cc66)',
  failed: 'var(--danger, #ff4444)',
};

const handleBase: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: 'var(--accent, #ffaa00)',
  border: '1.5px solid var(--border-default, #2a2a2a)',
};

export default memo(function AssetNode({ data, selected }: NodeProps<AssetNodeData>) {
  const borderColor = selected
    ? 'var(--accent, #ffaa00)'
    : 'var(--border-default, #2a2a2a)';

  return (
    <div
      style={{
        width: 160,
        padding: '8px 10px',
        background: 'var(--bg-surface-1, #111111)',
        border: `1px solid ${borderColor}`,
        borderLeft: '3px solid var(--accent, #ffaa00)',
        borderRadius: 8,
        boxShadow: selected
          ? '0 0 10px var(--accent-glow, rgba(255,170,0,0.15))'
          : '0 2px 6px #00000060',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        position: 'relative',
      }}
    >
      {/* Target handle — top center */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          ...handleBase,
          border: `1.5px solid ${borderColor}`,
        }}
      />

      {/* Category label + status dot row */}
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
          ASSET
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
                  : data.status === 'complete'
                    ? '0 0 4px var(--success, #00cc66)'
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

      {/* Type badge row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            fontSize: 9,
            fontFamily: 'var(--font-mono, monospace)',
            textTransform: 'lowercase',
            color: 'var(--accent, #ffaa00)',
            background: 'rgba(255, 170, 0, 0.12)',
            borderRadius: 9,
            padding: '1px 7px',
            lineHeight: 1.5,
          }}
        >
          {data.assetType}
        </span>
        {data.version && (
          <span
            style={{
              fontSize: 8,
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--text-muted, #666666)',
            }}
          >
            v{data.version}
          </span>
        )}
      </div>

      {/* Source handle — bottom center */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          ...handleBase,
          border: `1.5px solid ${borderColor}`,
        }}
      />
    </div>
  );
});
