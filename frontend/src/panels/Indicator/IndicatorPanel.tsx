/**
 * Indicator Panel — Boolean/threshold status light.
 * Displays a large colored circle with a label.
 * Green/red based on boolean truthiness or numeric threshold comparison.
 */

import { useState } from 'react';
import { useTopics, useSubscription } from '@/data-source/hooks';

function resolveField(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur ?? null;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-surface-2)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle, #333)',
  borderRadius: 3,
  fontSize: 11,
  padding: '2px 6px',
  fontFamily: 'monospace',
};

const COLOR_GREEN = '#00cc66';
const COLOR_RED = '#ff4444';
const COLOR_STALE = '#666';

export default function IndicatorPanel(props: any) {
  const { config = {}, onConfigChange = () => {} } = props;
  const topics = useTopics();

  const selectedTopic = (config.topic as string) || '';
  const field = (config.field as string) || '';
  const mode: 'boolean' | 'threshold' = (config.mode as 'boolean' | 'threshold') || 'boolean';
  const threshold = (config.threshold as number) ?? 0;
  const labels = (config.labels as Record<string, string>) || {};

  const [showSettings, setShowSettings] = useState(false);

  const latestEvent = useSubscription(selectedTopic);
  const rawValue = latestEvent && field ? resolveField(latestEvent.message, field) : null;

  // Determine state
  let color = COLOR_STALE;
  let statusLabel = 'No Data';
  const hasData = latestEvent !== undefined && rawValue !== null;

  if (hasData) {
    if (mode === 'boolean') {
      const truthy = !!rawValue;
      color = truthy ? COLOR_GREEN : COLOR_RED;
      statusLabel = truthy
        ? (labels.true || 'Active')
        : (labels.false || 'Inactive');
    } else {
      // threshold mode
      const numVal = typeof rawValue === 'number' ? rawValue : null;
      if (numVal !== null) {
        const above = numVal >= threshold;
        color = above ? COLOR_GREEN : COLOR_RED;
        statusLabel = above
          ? (labels.above || 'OK')
          : (labels.below || 'Low');
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          borderBottom: '1px solid var(--border-subtle, #333)',
          flexShrink: 0,
        }}
      >
        <select
          value={selectedTopic}
          onChange={(e) => onConfigChange({ topic: e.target.value })}
          style={{ ...inputStyle, flex: 1 }}
        >
          <option value="">Select topic...</option>
          {topics.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={field}
          onChange={(e) => onConfigChange({ field: e.target.value })}
          placeholder="field.path"
          style={{ ...inputStyle, width: 90 }}
        />

        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            background: showSettings ? 'var(--accent)' : 'var(--bg-surface-2)',
            color: showSettings ? '#000' : 'var(--text-secondary)',
            border: '1px solid var(--border-subtle, #333)',
            borderRadius: 3,
            fontSize: 11,
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          Settings
        </button>
      </div>

      {/* Expanded settings */}
      {showSettings && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 8px',
            borderBottom: '1px solid var(--border-subtle, #333)',
            flexShrink: 0,
            flexWrap: 'wrap',
            fontSize: 11,
          }}
        >
          <label style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            Mode
            <select
              value={mode}
              onChange={(e) => onConfigChange({ mode: e.target.value })}
              style={inputStyle}
            >
              <option value="boolean">Boolean</option>
              <option value="threshold">Threshold</option>
            </select>
          </label>

          {mode === 'threshold' && (
            <label style={{ color: 'var(--text-secondary)' }}>
              Threshold
              <input
                type="number"
                value={threshold}
                onChange={(e) => onConfigChange({ threshold: Number(e.target.value) })}
                style={{ ...inputStyle, width: 60, marginLeft: 4 }}
              />
            </label>
          )}

          {mode === 'boolean' ? (
            <>
              <label style={{ color: 'var(--text-secondary)' }}>
                True
                <input
                  type="text"
                  value={labels.true || ''}
                  onChange={(e) => onConfigChange({ labels: { ...labels, true: e.target.value } })}
                  placeholder="Active"
                  style={{ ...inputStyle, width: 60, marginLeft: 4 }}
                />
              </label>
              <label style={{ color: 'var(--text-secondary)' }}>
                False
                <input
                  type="text"
                  value={labels.false || ''}
                  onChange={(e) => onConfigChange({ labels: { ...labels, false: e.target.value } })}
                  placeholder="Inactive"
                  style={{ ...inputStyle, width: 60, marginLeft: 4 }}
                />
              </label>
            </>
          ) : (
            <>
              <label style={{ color: 'var(--text-secondary)' }}>
                Above
                <input
                  type="text"
                  value={labels.above || ''}
                  onChange={(e) => onConfigChange({ labels: { ...labels, above: e.target.value } })}
                  placeholder="OK"
                  style={{ ...inputStyle, width: 60, marginLeft: 4 }}
                />
              </label>
              <label style={{ color: 'var(--text-secondary)' }}>
                Below
                <input
                  type="text"
                  value={labels.below || ''}
                  onChange={(e) => onConfigChange({ labels: { ...labels, below: e.target.value } })}
                  placeholder="Low"
                  style={{ ...inputStyle, width: 60, marginLeft: 4 }}
                />
              </label>
            </>
          )}
        </div>
      )}

      {/* Indicator display */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          gap: 12,
          padding: 16,
        }}
      >
        {/* Status light */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: color,
            boxShadow: hasData ? `0 0 16px ${color}80, 0 0 4px ${color}40` : 'none',
            transition: 'background 0.3s, box-shadow 0.3s',
            flexShrink: 0,
          }}
        />

        {/* Status label */}
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 14,
            fontWeight: 600,
            color: hasData ? 'var(--text-primary)' : 'var(--text-tertiary, #666)',
            textAlign: 'center',
          }}
        >
          {statusLabel}
        </span>

        {/* Raw value (for threshold mode, show numeric value) */}
        {hasData && mode === 'threshold' && typeof rawValue === 'number' && (
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              color: 'var(--text-tertiary, #666)',
            }}
          >
            {rawValue.toFixed(2)} {threshold !== 0 && `/ ${threshold}`}
          </span>
        )}

        {!selectedTopic && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary, #666)' }}>
            Select a topic to monitor
          </span>
        )}
      </div>
    </div>
  );
}
