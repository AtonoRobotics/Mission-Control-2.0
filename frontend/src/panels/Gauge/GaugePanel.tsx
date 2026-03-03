/**
 * Gauge Panel — SVG arc gauge for a single numeric value.
 * Color zones: green (normal), orange (warn), red (critical).
 * Configurable topic, field path, min/max, thresholds, label, unit.
 */

import { useState } from 'react';
import { useTopics, useSubscription } from '@/data-source/hooks';
import { resolveField } from '@/message-path';

/** Convert polar to SVG cartesian coordinates */
function polarToXY(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** Build an SVG arc path from startAngle to endAngle (degrees) */
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const [x1, y1] = polarToXY(cx, cy, r, startDeg);
  const [x2, y2] = polarToXY(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
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

export default function GaugePanel(props: any) {
  const { config = {}, onConfigChange = () => {} } = props;
  const topics = useTopics();

  const selectedTopic = (config.topic as string) || '';
  const field = (config.field as string) || '';
  const min = (config.min as number) ?? 0;
  const max = (config.max as number) ?? 100;
  const warnThreshold = (config.warnThreshold as number) ?? 70;
  const critThreshold = (config.critThreshold as number) ?? 90;
  const label = (config.label as string) || '';
  const unit = (config.unit as string) || '';

  const [showSettings, setShowSettings] = useState(false);

  const latestEvent = useSubscription(selectedTopic);
  const resolved = latestEvent && field ? resolveField(latestEvent.message, field) : undefined;
  const rawValue = typeof resolved === 'number' ? resolved : null;

  // Clamp value for arc positioning, keep raw for display
  const value = rawValue !== null ? Math.max(min, Math.min(max, rawValue)) : null;

  // Arc geometry: 240 degree sweep, centered at bottom
  // Start at 210 degrees (bottom-left), end at 450 (=90, bottom-right)
  const SWEEP = 240;
  const START_ANGLE = 150; // degrees from 12 o'clock (SVG: 0=top)
  const END_ANGLE = START_ANGLE + SWEEP;

  const cx = 100;
  const cy = 100;
  const r = 75;
  const strokeWidth = 12;

  // Map a value in [min, max] to an angle in [START_ANGLE, END_ANGLE]
  function valueToAngle(v: number): number {
    const t = (v - min) / (max - min);
    return START_ANGLE + t * SWEEP;
  }

  // Build colored zone arcs
  const warnAngle = valueToAngle(Math.max(min, Math.min(max, warnThreshold)));
  const critAngle = valueToAngle(Math.max(min, Math.min(max, critThreshold)));

  const zones: Array<{ start: number; end: number; color: string }> = [
    { start: START_ANGLE, end: warnAngle, color: '#00cc66' },
    { start: warnAngle, end: critAngle, color: '#ff8800' },
    { start: critAngle, end: END_ANGLE, color: '#ff4444' },
  ];

  // Needle angle
  const needleAngle = value !== null ? valueToAngle(value) : null;

  // Determine current color for value display
  let valueColor = 'var(--text-tertiary, #666)';
  if (rawValue !== null) {
    if (rawValue >= critThreshold) valueColor = '#ff4444';
    else if (rawValue >= warnThreshold) valueColor = '#ff8800';
    else valueColor = '#00cc66';
  }

  const displayValue = rawValue !== null ? (Number.isInteger(rawValue) ? rawValue : rawValue.toFixed(2)) : '--';

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
            gap: 6,
            padding: '4px 8px',
            borderBottom: '1px solid var(--border-subtle, #333)',
            flexShrink: 0,
            flexWrap: 'wrap',
            fontSize: 11,
          }}
        >
          <label style={{ color: 'var(--text-secondary)' }}>
            Min
            <input
              type="number"
              value={min}
              onChange={(e) => onConfigChange({ min: Number(e.target.value) })}
              style={{ ...inputStyle, width: 50, marginLeft: 4 }}
            />
          </label>
          <label style={{ color: 'var(--text-secondary)' }}>
            Max
            <input
              type="number"
              value={max}
              onChange={(e) => onConfigChange({ max: Number(e.target.value) })}
              style={{ ...inputStyle, width: 50, marginLeft: 4 }}
            />
          </label>
          <label style={{ color: 'var(--text-secondary)' }}>
            Warn
            <input
              type="number"
              value={warnThreshold}
              onChange={(e) => onConfigChange({ warnThreshold: Number(e.target.value) })}
              style={{ ...inputStyle, width: 50, marginLeft: 4 }}
            />
          </label>
          <label style={{ color: 'var(--text-secondary)' }}>
            Crit
            <input
              type="number"
              value={critThreshold}
              onChange={(e) => onConfigChange({ critThreshold: Number(e.target.value) })}
              style={{ ...inputStyle, width: 50, marginLeft: 4 }}
            />
          </label>
          <label style={{ color: 'var(--text-secondary)' }}>
            Label
            <input
              type="text"
              value={label}
              onChange={(e) => onConfigChange({ label: e.target.value })}
              style={{ ...inputStyle, width: 70, marginLeft: 4 }}
            />
          </label>
          <label style={{ color: 'var(--text-secondary)' }}>
            Unit
            <input
              type="text"
              value={unit}
              onChange={(e) => onConfigChange({ unit: e.target.value })}
              style={{ ...inputStyle, width: 40, marginLeft: 4 }}
            />
          </label>
        </div>
      )}

      {/* Gauge SVG */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          padding: 8,
        }}
      >
        <svg viewBox="0 0 200 160" style={{ width: '100%', maxWidth: 240, maxHeight: '100%' }}>
          {/* Background track */}
          <path
            d={arcPath(cx, cy, r, START_ANGLE, END_ANGLE)}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Colored zone arcs */}
          {zones.map((zone, i) => {
            // Skip degenerate arcs
            if (zone.end - zone.start < 0.5) return null;
            return (
              <path
                key={i}
                d={arcPath(cx, cy, r, zone.start, zone.end)}
                fill="none"
                stroke={zone.color}
                strokeWidth={strokeWidth}
                strokeLinecap={i === 0 ? 'round' : 'butt'}
                opacity={0.3}
              />
            );
          })}

          {/* Active arc (filled up to current value) */}
          {needleAngle !== null && needleAngle > START_ANGLE + 0.5 && (
            <path
              d={arcPath(cx, cy, r, START_ANGLE, needleAngle)}
              fill="none"
              stroke={valueColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          )}

          {/* Needle indicator dot */}
          {needleAngle !== null && (() => {
            const [nx, ny] = polarToXY(cx, cy, r, needleAngle);
            return (
              <circle cx={nx} cy={ny} r={4} fill="#fff" stroke={valueColor} strokeWidth={2} />
            );
          })()}

          {/* Value text */}
          <text
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            fill={valueColor}
            fontFamily="monospace"
            fontWeight="bold"
            fontSize={24}
          >
            {displayValue}
          </text>

          {/* Label + unit */}
          <text
            x={cx}
            y={cy + 18}
            textAnchor="middle"
            fill="var(--text-secondary)"
            fontFamily="monospace"
            fontSize={11}
          >
            {label}{unit ? ` (${unit})` : ''}
          </text>

          {/* Min / Max labels */}
          {(() => {
            const [minX, minY] = polarToXY(cx, cy, r + 18, START_ANGLE);
            const [maxX, maxY] = polarToXY(cx, cy, r + 18, END_ANGLE);
            return (
              <>
                <text x={minX} y={minY} textAnchor="middle" fill="var(--text-tertiary, #666)" fontSize={9} fontFamily="monospace">
                  {min}
                </text>
                <text x={maxX} y={maxY} textAnchor="middle" fill="var(--text-tertiary, #666)" fontSize={9} fontFamily="monospace">
                  {max}
                </text>
              </>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}
