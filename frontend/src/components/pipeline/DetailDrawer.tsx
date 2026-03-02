// ============================================================
// Pipeline Detail Drawer — right-side panel showing node details,
// config forms, logs, metrics, and status when a DAG node is selected.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PipelineNode, NodeResult } from '../../stores/pipelineStore';
import type { ScenePlacement } from '@/stores/sceneStore';

// --- Props ---

export interface DetailDrawerProps {
  node: PipelineNode | null;
  nodeResult?: NodeResult;
  onConfigChange: (nodeId: string, config: Record<string, unknown>) => void;
  onClose: () => void;
  scenePlacement?: ScenePlacement | null;
  onUpdateScenePlacement?: (id: string, updates: Partial<ScenePlacement>) => void;
  onRemoveScenePlacement?: (id: string) => void;
}

// --- Constants ---

const STATUS_COLORS: Record<string, string> = {
  pending: '#666666',
  running: '#ffaa00',
  complete: '#00cc66',
  failed: '#ff4444',
};

const DRAWER_WIDTH = 320;

const styles = {
  drawer: {
    width: DRAWER_WIDTH,
    minWidth: DRAWER_WIDTH,
    maxWidth: DRAWER_WIDTH,
    height: '100%',
    background: 'var(--bg-surface-1, #111111)',
    borderLeft: '1px solid var(--border-default, #2a2a2a)',
    padding: 12,
    overflowY: 'auto' as const,
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 0,
  },
  closeBtn: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 4,
    color: 'var(--text-muted, #666666)',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
  },
  sectionHeader: {
    fontSize: 10,
    fontFamily: 'var(--font-mono, monospace)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'var(--text-muted, #666666)',
    lineHeight: 1,
    paddingBottom: 6,
    borderBottom: '1px solid var(--border-default, #2a2a2a)',
    marginBottom: 8,
    marginTop: 14,
  },
  label: {
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--text-muted, #666666)',
    marginBottom: 3,
  },
  input: {
    width: '100%',
    background: '#0a0a0a',
    border: '1px solid #2a2a2a',
    borderRadius: 3,
    color: 'var(--text-primary, #e0e0e0)',
    fontSize: 11,
    fontFamily: 'var(--font-mono, monospace)',
    padding: '4px 6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  select: {
    width: '100%',
    background: '#0a0a0a',
    border: '1px solid #2a2a2a',
    borderRadius: 3,
    color: 'var(--text-primary, #e0e0e0)',
    fontSize: 11,
    fontFamily: 'var(--font-mono, monospace)',
    padding: '4px 6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    width: '100%',
    minHeight: 80,
    background: '#0a0a0a',
    border: '1px solid #2a2a2a',
    borderRadius: 3,
    color: 'var(--text-primary, #e0e0e0)',
    fontSize: 11,
    fontFamily: 'var(--font-mono, monospace)',
    padding: '4px 6px',
    outline: 'none',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  },
  badge: {
    fontSize: 9,
    fontFamily: 'var(--font-mono, monospace)',
    textTransform: 'lowercase' as const,
    borderRadius: 9,
    padding: '1px 7px',
    lineHeight: 1.5,
    display: 'inline-block' as const,
  },
  section: {
    borderBottom: '1px solid var(--border-default, #2a2a2a)',
    paddingBottom: 10,
  },
  kvRow: {
    display: 'flex',
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 4,
  },
  kvKey: {
    fontSize: 10,
    color: 'var(--text-muted, #666666)',
    fontFamily: 'var(--font-mono, monospace)',
    flexShrink: 0,
  },
  kvVal: {
    fontSize: 11,
    color: 'var(--text-primary, #e0e0e0)',
    fontFamily: 'var(--font-mono, monospace)',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
    textAlign: 'right' as const,
  },
} as const;

// --- Helpers ---

function formatTimestamp(ts?: string): string {
  if (!ts) return '--';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

// --- Sub-components ---

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div style={styles.sectionHeader}>{children}</div>;
}

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#666';
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        boxShadow: status === 'running' ? `0 0 5px ${color}` : 'none',
      }}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#666';
  return (
    <span
      style={{
        ...styles.badge,
        color,
        background: `${color}18`,
        border: `1px solid ${color}40`,
      }}
    >
      {status}
    </span>
  );
}

function TypeBadge({ type, variant }: { type: string; variant: 'asset' | 'operation' }) {
  const isAsset = variant === 'asset';
  return (
    <span
      style={{
        ...styles.badge,
        color: isAsset ? 'var(--accent, #ffaa00)' : 'var(--text-secondary, #888888)',
        background: isAsset ? 'rgba(255, 170, 0, 0.12)' : 'rgba(255, 255, 255, 0.06)',
      }}
    >
      {type}
    </span>
  );
}

// --- Field components for operation config ---

function NumberField({
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number | undefined;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={styles.label}>{label}</div>
      <input
        type="number"
        style={styles.input}
        value={value ?? ''}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = '#ffaa00'; }}
        onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = '#2a2a2a'; }}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={styles.label}>{label}</div>
      <input
        type="text"
        style={styles.input}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = '#ffaa00'; }}
        onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = '#2a2a2a'; }}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={styles.label}>{label}</div>
      <select
        style={styles.select}
        value={value ?? options[0] ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => { (e.target as HTMLSelectElement).style.borderColor = '#ffaa00'; }}
        onBlur={(e) => { (e.target as HTMLSelectElement).style.borderColor = '#2a2a2a'; }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean | undefined;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="checkbox"
        checked={checked ?? false}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: '#ffaa00' }}
      />
      <span style={{ ...styles.label, marginBottom: 0 }}>{label}</span>
    </div>
  );
}

// --- Asset detail view ---

function AssetDetail({
  node,
  nodeResult,
}: {
  node: PipelineNode;
  nodeResult?: NodeResult;
}) {
  const config = node.config;
  const fileId = config.file_id as string | undefined;
  const version = config.version as string | undefined;
  const source = config.source as string | undefined;

  // Collect other config entries not shown above
  const otherKeys = Object.keys(config).filter(
    (k) => k !== 'file_id' && k !== 'version' && k !== 'source',
  );

  return (
    <>
      {/* File ID */}
      {fileId && (
        <div style={{ marginBottom: 6 }}>
          <div style={styles.label}>File ID</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--text-primary, #e0e0e0)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 200,
              }}
              title={fileId}
            >
              {fileId}
            </span>
            {version && (
              <span
                style={{
                  ...styles.badge,
                  color: 'var(--text-muted, #666)',
                  background: 'rgba(255,255,255,0.06)',
                  fontSize: 8,
                }}
              >
                v{version}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Source */}
      {source && (
        <div style={{ marginBottom: 6 }}>
          <div style={styles.label}>Source</div>
          <span
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--text-primary, #e0e0e0)',
            }}
          >
            {source}
          </span>
        </div>
      )}

      {/* Other config entries */}
      {otherKeys.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {otherKeys.map((k) => (
            <div key={k} style={styles.kvRow}>
              <span style={styles.kvKey}>{k}</span>
              <span style={styles.kvVal as React.CSSProperties}>
                {String(config[k] ?? '--')}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Status */}
      {nodeResult && (
        <>
          <SectionHeader>Status</SectionHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <StatusDot status={nodeResult.status} />
            <span style={{ fontSize: 11, color: 'var(--text-primary, #e0e0e0)' }}>
              {nodeResult.status}
            </span>
          </div>
        </>
      )}
    </>
  );
}

// --- Operation config form ---

function OperationConfigForm({
  node,
  onConfigChange,
}: {
  node: PipelineNode;
  onConfigChange: (nodeId: string, config: Record<string, unknown>) => void;
}) {
  const config = node.config;

  const update = useCallback(
    (key: string, value: unknown) => {
      onConfigChange(node.id, { ...config, [key]: value });
    },
    [node.id, config, onConfigChange],
  );

  switch (node.type) {
    case 'usd_compose':
      return (
        <>
          <NumberField label="Physics DT" value={config.physics_dt as number | undefined} step={0.001} onChange={(v) => update('physics_dt', v)} />
          <NumberField label="Render DT" value={config.render_dt as number | undefined} step={0.001} onChange={(v) => update('render_dt', v)} />
        </>
      );

    case 'groot_finetune':
      return (
        <>
          <NumberField label="Epochs" value={config.epochs as number | undefined} min={1} onChange={(v) => update('epochs', v)} />
          <NumberField label="Batch Size" value={config.batch_size as number | undefined} min={1} onChange={(v) => update('batch_size', v)} />
          <NumberField label="Learning Rate" value={config.learning_rate as number | undefined} step={0.0001} min={0} onChange={(v) => update('learning_rate', v)} />
        </>
      );

    case 'isaac_lab_rl':
      return (
        <>
          <SelectField label="Algorithm" value={config.algorithm as string | undefined} options={['rsl_rl', 'rl_games', 'skrl']} onChange={(v) => update('algorithm', v)} />
          <NumberField label="Num Envs" value={config.num_envs as number | undefined} min={1} onChange={(v) => update('num_envs', v)} />
          <NumberField label="Max Iterations" value={config.max_iterations as number | undefined} min={1} onChange={(v) => update('max_iterations', v)} />
        </>
      );

    case 'cosmos_transfer':
      return (
        <SelectField label="Model Size" value={config.model_size as string | undefined} options={['2B', '14B']} onChange={(v) => update('model_size', v)} />
      );

    case 'cosmos_predict':
      return (
        <>
          <NumberField label="Prediction Horizon" value={config.prediction_horizon as number | undefined} min={1} onChange={(v) => update('prediction_horizon', v)} />
          <NumberField label="Scenarios" value={config.scenarios as number | undefined} min={1} onChange={(v) => update('scenarios', v)} />
        </>
      );

    case 'arena_eval':
      return (
        <NumberField label="Success Threshold" value={config.success_threshold as number | undefined} step={0.01} min={0} max={1} onChange={(v) => update('success_threshold', v)} />
      );

    case 'deploy':
      return (
        <TextField label="Target" value={config.target as string | undefined} onChange={(v) => update('target', v)} />
      );

    case 'groot_mimic':
      return (
        <NumberField label="Augmentation Factor" value={config.augmentation_factor as number | undefined} min={1} onChange={(v) => update('augmentation_factor', v)} />
      );

    case 'demo_record':
      return (
        <>
          <SelectField label="Format" value={config.format as string | undefined} options={['lerobot']} onChange={(v) => update('format', v)} />
          <NumberField label="Target Count" value={config.target_count as number | undefined} min={1} onChange={(v) => update('target_count', v)} />
        </>
      );

    case 'curobo_validate':
      return (
        <>
          <CheckboxField label="Check Singularity" checked={config.check_singularity as boolean | undefined} onChange={(v) => update('check_singularity', v)} />
          <CheckboxField label="Check Jerk" checked={config.check_jerk as boolean | undefined} onChange={(v) => update('check_jerk', v)} />
        </>
      );

    default:
      return <JsonConfigEditor node={node} onConfigChange={onConfigChange} />;
  }
}

// --- Fallback JSON editor ---

function JsonConfigEditor({
  node,
  onConfigChange,
}: {
  node: PipelineNode;
  onConfigChange: (nodeId: string, config: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(node.config, null, 2));
  const [error, setError] = useState<string | null>(null);

  // Sync when node changes externally
  useEffect(() => {
    setText(JSON.stringify(node.config, null, 2));
    setError(null);
  }, [node.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBlur = useCallback(() => {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      setError(null);
      onConfigChange(node.id, parsed);
    } catch {
      setError('Invalid JSON');
    }
  }, [text, node.id, onConfigChange]);

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={styles.label}>Config (JSON)</div>
      <textarea
        style={{
          ...styles.textarea,
          borderColor: error ? '#ff4444' : '#2a2a2a',
        }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = '#ffaa00'; }}
      />
      {error && (
        <div style={{ fontSize: 10, color: '#ff4444', marginTop: 2 }}>{error}</div>
      )}
    </div>
  );
}

// --- Log Viewer ---

function LogViewer({ logs }: { logs: string[] }) {
  const containerRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <pre
      ref={containerRef}
      style={{
        maxHeight: 200,
        overflowY: 'auto',
        background: '#0a0a0a',
        border: '1px solid #2a2a2a',
        borderRadius: 3,
        padding: 8,
        margin: 0,
        fontSize: 10,
        fontFamily: 'var(--font-mono, monospace)',
        color: 'var(--text-secondary, #888888)',
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      {logs.join('\n')}
    </pre>
  );
}

// --- Metrics grid ---

function MetricsGrid({ metrics }: { metrics: Record<string, unknown> }) {
  const entries = Object.entries(metrics);
  if (entries.length === 0) return null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '4px 12px',
      }}
    >
      {entries.map(([key, val]) => (
        <React.Fragment key={key}>
          <span style={styles.kvKey}>{key}</span>
          <span
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--accent, #ffaa00)',
              textAlign: 'right',
            }}
          >
            {typeof val === 'number' ? val.toLocaleString(undefined, { maximumFractionDigits: 6 }) : String(val ?? '--')}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

// --- Progress bar ---

function ProgressBar({ progress }: { progress: number }) {
  const pct = Math.min(100, Math.max(0, progress));
  return (
    <div
      style={{
        height: 4,
        background: '#2a2a2a',
        borderRadius: 2,
        overflow: 'hidden',
        marginTop: 6,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: 'var(--accent, #ffaa00)',
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  );
}

// --- Scene Placement detail view ---

function ScenePlacementDetail({
  placement,
  onUpdate,
  onRemove,
}: {
  placement: ScenePlacement;
  onUpdate: (id: string, updates: Partial<ScenePlacement>) => void;
  onRemove: (id: string) => void;
}) {
  const updatePosition = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      onUpdate(placement.id, { position: { ...placement.position, [axis]: value } });
    },
    [placement.id, placement.position, onUpdate],
  );

  const updateRotation = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      onUpdate(placement.id, { rotation: { ...placement.rotation, [axis]: value } });
    },
    [placement.id, placement.rotation, onUpdate],
  );

  const updateScale = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      onUpdate(placement.id, { scale: { ...placement.scale, [axis]: value } });
    },
    [placement.id, placement.scale, onUpdate],
  );

  return (
    <>
      {/* Header */}
      <div style={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--text-primary, #e0e0e0)',
                marginBottom: 6,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={placement.label}
            >
              {placement.label}
            </div>
            <TypeBadge type={placement.asset_type} variant="asset" />
          </div>
          <button
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 68, 68, 0.4)',
              borderRadius: 3,
              color: '#ff4444',
              fontSize: 10,
              fontFamily: 'var(--font-mono, monospace)',
              padding: '2px 8px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onClick={() => onRemove(placement.id)}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 68, 68, 0.12)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Transform */}
      <SectionHeader>Transform</SectionHeader>
      <div style={styles.section}>
        <div style={styles.label}>Position</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          <NumberField label="X" value={placement.position.x} step={0.01} onChange={(v) => updatePosition('x', v)} />
          <NumberField label="Y" value={placement.position.y} step={0.01} onChange={(v) => updatePosition('y', v)} />
          <NumberField label="Z" value={placement.position.z} step={0.01} onChange={(v) => updatePosition('z', v)} />
        </div>
        <div style={styles.label}>Rotation (&deg;)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          <NumberField label="X&deg;" value={placement.rotation.x} step={1} min={0} max={360} onChange={(v) => updateRotation('x', v)} />
          <NumberField label="Y&deg;" value={placement.rotation.y} step={1} min={0} max={360} onChange={(v) => updateRotation('y', v)} />
          <NumberField label="Z&deg;" value={placement.rotation.z} step={1} min={0} max={360} onChange={(v) => updateRotation('z', v)} />
        </div>
        <div style={styles.label}>Scale</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          <NumberField label="X" value={placement.scale.x} step={0.1} onChange={(v) => updateScale('x', v)} />
          <NumberField label="Y" value={placement.scale.y} step={0.1} onChange={(v) => updateScale('y', v)} />
          <NumberField label="Z" value={placement.scale.z} step={0.1} onChange={(v) => updateScale('z', v)} />
        </div>
      </div>

      {/* Physics */}
      <SectionHeader>Physics</SectionHeader>
      <div style={styles.section}>
        <CheckboxField
          label="Physics Enabled"
          checked={placement.physics_enabled}
          onChange={(v) => onUpdate(placement.id, { physics_enabled: v })}
        />
        <CheckboxField
          label="Is Global"
          checked={placement.is_global}
          onChange={(v) => onUpdate(placement.id, { is_global: v })}
        />
        <div style={{ fontSize: 9, color: 'var(--text-muted, #666666)', marginTop: -4, marginLeft: 22 }}>
          Shared across all environments (not cloned per env)
        </div>
      </div>

      {/* Info */}
      <SectionHeader>Info</SectionHeader>
      <div style={styles.section}>
        <div style={styles.kvRow}>
          <span style={styles.kvKey}>asset source</span>
          <span style={styles.kvVal as React.CSSProperties}>{placement.asset_source}</span>
        </div>
        <div style={styles.kvRow}>
          <span style={styles.kvKey}>asset id</span>
          <span
            style={{
              ...(styles.kvVal as React.CSSProperties),
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
            }}
            title={placement.asset_id}
          >
            {placement.asset_id}
          </span>
        </div>
      </div>
    </>
  );
}

// --- Main component ---

export default function DetailDrawer({
  node,
  nodeResult,
  onConfigChange,
  onClose,
  scenePlacement,
  onUpdateScenePlacement,
  onRemoveScenePlacement,
}: DetailDrawerProps) {
  // Show placement detail if a scene placement is selected (takes priority over node)
  if (scenePlacement && onUpdateScenePlacement && onRemoveScenePlacement) {
    return (
      <div style={styles.drawer}>
        <button
          style={styles.closeBtn}
          onClick={onClose}
          title="Close detail drawer"
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#e0e0e0'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted, #666666)'; }}
        >
          &#x2715;
        </button>
        <ScenePlacementDetail
          placement={scenePlacement}
          onUpdate={onUpdateScenePlacement}
          onRemove={onRemoveScenePlacement}
        />
      </div>
    );
  }

  if (!node) return null;

  const isAsset = node.category === 'asset';
  const categoryLabel = isAsset ? 'ASSET' : 'OPERATION';

  return (
    <div style={styles.drawer}>
      {/* Close button */}
      <button
        style={styles.closeBtn}
        onClick={onClose}
        title="Close detail drawer"
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#e0e0e0'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted, #666666)'; }}
      >
        &#x2715;
      </button>

      {/* Header */}
      <div style={styles.section}>
        <span
          style={{
            fontSize: 9,
            fontFamily: 'var(--font-mono, monospace)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted, #666666)',
          }}
        >
          {categoryLabel}
        </span>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-primary, #e0e0e0)',
            marginTop: 2,
            marginBottom: 6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            paddingRight: 24,
          }}
          title={node.label}
        >
          {node.label}
        </div>
        <TypeBadge type={node.type} variant={node.category} />
      </div>

      {/* Category-specific body */}
      {isAsset ? (
        <>
          <SectionHeader>Details</SectionHeader>
          <div style={styles.section}>
            <AssetDetail node={node} nodeResult={nodeResult} />
          </div>
        </>
      ) : (
        <>
          {/* Config form */}
          <SectionHeader>Configuration</SectionHeader>
          <div style={styles.section}>
            <OperationConfigForm node={node} onConfigChange={onConfigChange} />
          </div>

          {/* Log viewer */}
          {nodeResult?.logs && nodeResult.logs.length > 0 && (
            <>
              <SectionHeader>Logs</SectionHeader>
              <div style={styles.section}>
                <LogViewer logs={nodeResult.logs} />
              </div>
            </>
          )}

          {/* Metrics */}
          {nodeResult?.metrics && Object.keys(nodeResult.metrics).length > 0 && (
            <>
              <SectionHeader>Metrics</SectionHeader>
              <div style={styles.section}>
                <MetricsGrid metrics={nodeResult.metrics} />
              </div>
            </>
          )}

          {/* Status section */}
          {nodeResult && (
            <>
              <SectionHeader>Status</SectionHeader>
              <div style={styles.section}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <StatusBadge status={nodeResult.status} />
                </div>
                {nodeResult.progress != null && (
                  <ProgressBar progress={nodeResult.progress} />
                )}
                <div style={{ marginTop: 8 }}>
                  <div style={styles.kvRow}>
                    <span style={styles.kvKey}>started</span>
                    <span style={styles.kvVal as React.CSSProperties}>{formatTimestamp(nodeResult.started_at)}</span>
                  </div>
                  <div style={styles.kvRow}>
                    <span style={styles.kvKey}>completed</span>
                    <span style={styles.kvVal as React.CSSProperties}>{formatTimestamp(nodeResult.completed_at)}</span>
                  </div>
                </div>
                {nodeResult.error && (
                  <div
                    style={{
                      marginTop: 6,
                      padding: 6,
                      background: 'rgba(255, 68, 68, 0.08)',
                      border: '1px solid rgba(255, 68, 68, 0.25)',
                      borderRadius: 3,
                      fontSize: 10,
                      fontFamily: 'var(--font-mono, monospace)',
                      color: '#ff4444',
                      lineHeight: 1.4,
                      wordBreak: 'break-word',
                    }}
                  >
                    {nodeResult.error}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
