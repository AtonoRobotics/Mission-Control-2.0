/**
 * Variable Slider Panel — interactive slider bound to a layout variable.
 * Other panels can reference layout variables in their config.
 */

import { useState, useCallback } from 'react';

export default function VariableSliderPanel(props: any) {
  const { config = {}, onConfigChange = () => {} } = props;
  const varName = (config.variableName as string) || 'myVar';
  const min = (config.min as number) ?? 0;
  const max = (config.max as number) ?? 100;
  const step = (config.step as number) ?? 1;
  const value = (config.value as number) ?? min;
  const [showSettings, setShowSettings] = useState(false);

  const handleChange = useCallback((newValue: number) => {
    onConfigChange({ ...config, value: newValue });
    // Also set layout variable via window event (layoutStore listens)
    window.dispatchEvent(new CustomEvent('layout-variable', { detail: { name: varName, value: newValue } }));
  }, [config, onConfigChange, varName]);

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-surface-2)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle, #333)',
    borderRadius: 3,
    fontSize: 11,
    padding: '3px 6px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--border-subtle, #333)', flexShrink: 0 }}>
        <span style={{ color: 'var(--accent)', fontFamily: 'monospace', fontSize: 12 }}>${varName}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle, #333)', color: 'var(--text-secondary)', borderRadius: 3, fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}
        >
          {showSettings ? '×' : '⚙'}
        </button>
      </div>

      {/* Slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px', flex: showSettings ? 0 : 1 }}>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary, #666)', fontFamily: 'monospace' }}>{min}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => handleChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--accent)' }}
        />
        <span style={{ fontSize: 10, color: 'var(--text-tertiary, #666)', fontFamily: 'monospace' }}>{max}</span>
      </div>

      {/* Settings */}
      {showSettings && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle, #333)', display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, flex: 1 }}>
          <label style={{ color: 'var(--text-secondary)' }}>
            Name <input type="text" value={varName} onChange={(e) => onConfigChange({ ...config, variableName: e.target.value })} style={{ ...inputStyle, width: 80, marginLeft: 4 }} />
          </label>
          <label style={{ color: 'var(--text-secondary)' }}>
            Min <input type="number" value={min} onChange={(e) => onConfigChange({ ...config, min: Number(e.target.value) })} style={{ ...inputStyle, width: 50, marginLeft: 4 }} />
          </label>
          <label style={{ color: 'var(--text-secondary)' }}>
            Max <input type="number" value={max} onChange={(e) => onConfigChange({ ...config, max: Number(e.target.value) })} style={{ ...inputStyle, width: 50, marginLeft: 4 }} />
          </label>
          <label style={{ color: 'var(--text-secondary)' }}>
            Step <input type="number" value={step} onChange={(e) => onConfigChange({ ...config, step: Number(e.target.value) })} style={{ ...inputStyle, width: 50, marginLeft: 4 }} step={0.1} />
          </label>
        </div>
      )}
    </div>
  );
}
