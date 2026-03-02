import React, { useState, useEffect } from 'react';
import type { PipelineRun, PipelineNode, NodeResult } from '@/stores/pipelineStore';

interface RunBarProps {
  run: PipelineRun | null;
  nodes: PipelineNode[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#666',
  running: '#ffaa00',
  complete: '#22c55e',
  failed: '#ef4444',
};

function formatElapsed(startIso: string, endIso?: string | null): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const secs = Math.max(0, Math.floor((end - start) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'running': return 'Running';
    case 'complete': return 'Complete';
    case 'failed': return 'Failed';
    default: return 'Idle';
  }
}

const RunBar: React.FC<RunBarProps> = ({ run, nodes }) => {
  const [expanded, setExpanded] = useState(false);
  const [, setTick] = useState(0);

  // Tick every second while running so elapsed time updates
  useEffect(() => {
    if (!run || run.status !== 'running') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [run?.run_id, run?.status]);

  const nodeResults = run?.node_results ?? {};
  const completedCount = Object.values(nodeResults).filter(
    (r: NodeResult) => r.status === 'complete'
  ).length;
  const totalCount = nodes.length || Object.keys(nodeResults).length || 1;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#111',
        borderTop: '1px solid #333',
        zIndex: 1000,
        fontFamily: 'monospace',
        fontSize: 13,
        color: '#ccc',
      }}
    >
      {/* Collapsed bar */}
      <div
        onClick={() => run && setExpanded((e) => !e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          height: 48,
          padding: '0 20px',
          cursor: run ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        {!run ? (
          <span style={{ color: '#555' }}>No active run</span>
        ) : (
          <>
            {/* Status dot + label */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: STATUS_COLORS[run.status] ?? '#555',
                  display: 'inline-block',
                }}
              />
              <span style={{ color: STATUS_COLORS[run.status] ?? '#555', fontWeight: 600 }}>
                {getStatusLabel(run.status)}
              </span>
            </span>

            {/* Progress bar */}
            <div
              style={{
                flex: 1,
                maxWidth: 300,
                height: 6,
                background: '#333',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progressPct}%`,
                  height: '100%',
                  background: '#ffaa00',
                  borderRadius: 3,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>

            {/* Node count */}
            <span style={{ color: '#999' }}>
              {completedCount}/{totalCount} nodes complete
            </span>

            {/* Elapsed time */}
            <span style={{ color: '#777' }}>
              {formatElapsed(run.started_at, run.completed_at)}
            </span>

            {/* Expand indicator */}
            <span style={{ color: '#555', marginLeft: 'auto' }}>
              {expanded ? '\u25BC' : '\u25B2'}
            </span>
          </>
        )}
      </div>

      {/* Expanded node list */}
      {run && expanded && (
        <div
          style={{
            borderTop: '1px solid #222',
            maxHeight: 240,
            overflowY: 'auto',
            padding: '8px 20px',
          }}
        >
          {nodes.map((node) => {
            const result: NodeResult | undefined = nodeResults[node.id];
            const status = result?.status ?? 'pending';
            return (
              <div
                key={node.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '4px 0',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: STATUS_COLORS[status] ?? '#555',
                    flexShrink: 0,
                    display: 'inline-block',
                  }}
                />
                <span style={{ flex: 1, color: '#ddd' }}>{node.label}</span>
                <span style={{ color: '#777', fontSize: 12 }}>
                  {(status === 'running' || status === 'complete') && result?.started_at
                    ? formatElapsed(result.started_at, result.completed_at)
                    : status}
                </span>
              </div>
            );
          })}
          {nodes.length === 0 && (
            <span style={{ color: '#555' }}>No nodes in pipeline</span>
          )}
        </div>
      )}
    </div>
  );
};

export default RunBar;
