/**
 * State Transitions Panel — Canvas-based horizontal swim-lane timeline
 * for tracking string/enum field changes over time.
 * Each distinct value gets a unique color; hover shows tooltip.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTopics, useDataSource } from '@/data-source/hooks';
import type { MessageEvent } from '@/data-source/types';
import { resolveField } from '@/message-path';

// ── Constants ────────────────────────────────────────────────────────────────

const COLORS = ['#ffaa00', '#4fc3f7', '#81c784', '#e57373', '#ba68c8', '#ffb74d', '#4dd0e1', '#aed581'];
const MAX_TRANSITIONS = 1000;
const DEFAULT_WINDOW_SEC = 60;
const ROW_HEIGHT = 28;
const LABEL_WIDTH = 120;
const HEADER_HEIGHT = 20;

// ── Types ────────────────────────────────────────────────────────────────────

interface Transition {
  value: string;
  timestamp: number; // epoch ms
}

// ── Styles ───────────────────────────────────────────────────────────────────

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 8px',
  borderBottom: '1px solid var(--border-subtle, #333)',
  flexShrink: 0,
};

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-surface-2)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle, #333)',
  borderRadius: 3,
  fontSize: 11,
  padding: '3px 6px',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-surface-2)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle, #333)',
  borderRadius: 3,
  fontSize: 11,
  padding: '3px 6px',
  width: 120,
};

const tooltipStyle: React.CSSProperties = {
  position: 'absolute',
  pointerEvents: 'none',
  background: 'rgba(0,0,0,0.9)',
  border: '1px solid var(--border-subtle, #333)',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 11,
  fontFamily: 'monospace',
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
  zIndex: 10,
};

// ── Component ────────────────────────────────────────────────────────────────

export default function StateTransitionsPanel(props: any) {
  const { config = {}, onConfigChange = () => {} } = props;
  const topics = useTopics();
  const ds = useDataSource();

  const selectedTopic = (config.topic as string) || '';
  const fieldPath = (config.field as string) || '';
  const windowSec = (config.windowSec as number) || DEFAULT_WINDOW_SEC;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<{ unsubscribe: () => void } | null>(null);
  const transitionsRef = useRef<Transition[]>([]);
  const colorMapRef = useRef<Map<string, string>>(new Map());
  const animFrameRef = useRef<number>(0);

  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Get or assign a color for a value
  const getColor = useCallback((value: string): string => {
    const map = colorMapRef.current;
    if (map.has(value)) return map.get(value)!;
    const color = COLORS[map.size % COLORS.length];
    map.set(value, color);
    return color;
  }, []);

  // Subscribe to topic
  useEffect(() => {
    subRef.current?.unsubscribe();
    subRef.current = null;
    transitionsRef.current = [];
    colorMapRef.current.clear();

    if (!selectedTopic || !fieldPath) return;

    const sub = ds.subscribe(selectedTopic, (event: MessageEvent) => {
      const raw = resolveField(event.message, fieldPath) as string | number | boolean | null | undefined;
      if (raw === undefined || raw === null) return;
      const value = String(raw);
      const transitions = transitionsRef.current;
      const last = transitions.length > 0 ? transitions[transitions.length - 1] : null;

      // Only record when value changes (or first value)
      if (!last || last.value !== value) {
        transitions.push({ value, timestamp: event.timestamp });
        // Ring buffer trim
        if (transitions.length > MAX_TRANSITIONS) {
          transitions.splice(0, transitions.length - MAX_TRANSITIONS);
        }
        // Ensure color is assigned
        getColor(value);
      }
    });
    subRef.current = sub;

    return () => {
      sub.unsubscribe();
      subRef.current = null;
    };
  }, [ds, selectedTopic, fieldPath, getColor]);

  // Canvas rendering loop
  useEffect(() => {
    let running = true;

    function draw() {
      if (!running) return;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) {
        animFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const transitions = transitionsRef.current;
      const colorMap = colorMapRef.current;

      if (transitions.length === 0) {
        ctx.fillStyle = '#666';
        ctx.font = '12px sans-serif';
        ctx.fillText(
          selectedTopic && fieldPath
            ? 'Waiting for state transitions...'
            : 'Select a topic and field to track state transitions.',
          16,
          30,
        );
        animFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      const now = Date.now();
      const windowMs = windowSec * 1000;
      const timeStart = now - windowMs;
      const timeEnd = now;
      const timelineWidth = w - LABEL_WIDTH;

      // Build unique values in order of appearance
      const uniqueValues: string[] = [];
      for (const t of transitions) {
        if (!uniqueValues.includes(t.value)) uniqueValues.push(t.value);
      }

      const totalHeight = HEADER_HEIGHT + uniqueValues.length * ROW_HEIGHT;

      // Draw time axis header
      ctx.fillStyle = '#444';
      ctx.font = '10px monospace';
      const tickCount = 5;
      for (let i = 0; i <= tickCount; i++) {
        const frac = i / tickCount;
        const x = LABEL_WIDTH + frac * timelineWidth;
        const t = timeStart + frac * windowMs;
        const secsAgo = Math.round((now - t) / 1000);
        const label = secsAgo === 0 ? 'now' : `-${secsAgo}s`;
        ctx.fillText(label, x - 10, 14);
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.moveTo(x, HEADER_HEIGHT);
        ctx.lineTo(x, totalHeight);
        ctx.stroke();
      }

      // Draw swim lanes
      for (let vi = 0; vi < uniqueValues.length; vi++) {
        const value = uniqueValues[vi];
        const color = colorMap.get(value) || '#666';
        const y = HEADER_HEIGHT + vi * ROW_HEIGHT;

        // Label
        ctx.fillStyle = color;
        ctx.font = '11px monospace';
        const labelText =
          value.length > 14 ? value.slice(0, 13) + '\u2026' : value;
        ctx.fillText(labelText, 4, y + ROW_HEIGHT / 2 + 4);

        // Lane background
        ctx.fillStyle = 'rgba(255,255,255,0.02)';
        ctx.fillRect(LABEL_WIDTH, y, timelineWidth, ROW_HEIGHT);

        // Draw rectangles for periods where this value was active
        for (let ti = 0; ti < transitions.length; ti++) {
          if (transitions[ti].value !== value) continue;

          const start = transitions[ti].timestamp;
          // End is when a different value appears, or now
          let end = now;
          for (let j = ti + 1; j < transitions.length; j++) {
            if (transitions[j].value !== value) {
              end = transitions[j].timestamp;
              break;
            }
          }

          // Clip to visible window
          const visStart = Math.max(start, timeStart);
          const visEnd = Math.min(end, timeEnd);
          if (visStart >= visEnd) continue;

          const x1 = LABEL_WIDTH + ((visStart - timeStart) / windowMs) * timelineWidth;
          const x2 = LABEL_WIDTH + ((visEnd - timeStart) / windowMs) * timelineWidth;

          ctx.fillStyle = color;
          ctx.globalAlpha = 0.6;
          ctx.fillRect(x1, y + 3, Math.max(x2 - x1, 2), ROW_HEIGHT - 6);
          ctx.globalAlpha = 1.0;
        }

        // Lane border
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.beginPath();
        ctx.moveTo(LABEL_WIDTH, y + ROW_HEIGHT);
        ctx.lineTo(w, y + ROW_HEIGHT);
        ctx.stroke();
      }

      // Vertical separator
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(LABEL_WIDTH, 0);
      ctx.lineTo(LABEL_WIDTH, totalHeight);
      ctx.stroke();

      animFrameRef.current = requestAnimationFrame(draw);
    }

    animFrameRef.current = requestAnimationFrame(draw);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [selectedTopic, fieldPath, windowSec]);

  // Mouse hover for tooltip
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const transitions = transitionsRef.current;
      if (transitions.length === 0) {
        setTooltip(null);
        return;
      }

      const now = Date.now();
      const windowMs = windowSec * 1000;
      const timeStart = now - windowMs;
      const timelineWidth = rect.width - LABEL_WIDTH;

      // Which value row?
      const uniqueValues: string[] = [];
      for (const t of transitions) {
        if (!uniqueValues.includes(t.value)) uniqueValues.push(t.value);
      }

      const rowIdx = Math.floor((my - HEADER_HEIGHT) / ROW_HEIGHT);
      if (rowIdx < 0 || rowIdx >= uniqueValues.length || mx < LABEL_WIDTH) {
        setTooltip(null);
        return;
      }

      // What time does this X correspond to?
      const frac = (mx - LABEL_WIDTH) / timelineWidth;
      const hoverTime = timeStart + frac * windowMs;
      const date = new Date(hoverTime);
      const timeStr =
        date.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + '.' + String(date.getMilliseconds()).padStart(3, '0');

      // Find active value at this time
      let activeValue = '';
      for (let i = transitions.length - 1; i >= 0; i--) {
        if (transitions[i].timestamp <= hoverTime) {
          activeValue = transitions[i].value;
          break;
        }
      }

      setTooltip({
        x: mx + 12,
        y: my - 8,
        text: `${timeStr}  ${activeValue || '(none)'}`,
      });
    },
    [windowSec],
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={toolbarStyle}>
        <select
          value={selectedTopic}
          onChange={(e) => onConfigChange({ ...config, topic: e.target.value })}
          style={{ ...selectStyle, flex: 1 }}
        >
          <option value="">Topic...</option>
          {topics.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={fieldPath}
          onChange={(e) => onConfigChange({ ...config, field: e.target.value })}
          placeholder="field.path"
          style={inputStyle}
        />

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: 'var(--text-secondary)',
          }}
        >
          <span style={{ color: 'var(--text-tertiary, #666)' }}>Window:</span>
          <input
            type="number"
            value={windowSec}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v > 0) onConfigChange({ ...config, windowSec: v });
            }}
            min={5}
            max={600}
            style={{ ...inputStyle, width: 50, textAlign: 'right' }}
          />
          <span style={{ color: 'var(--text-tertiary, #666)' }}>s</span>
        </label>

        {/* Legend */}
        {Array.from(colorMapRef.current.entries()).map(([val, col]) => (
          <span
            key={val}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '1px 5px',
              borderRadius: 3,
              background: 'var(--bg-surface-2)',
              border: `1px solid ${col}`,
              color: col,
              fontSize: 10,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {val}
          </span>
        ))}
      </div>

      {/* Canvas area */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative', background: 'var(--bg-base, #0a0a0a)' }}>
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
        {tooltip && (
          <div style={{ ...tooltipStyle, left: tooltip.x, top: tooltip.y }}>
            {tooltip.text}
          </div>
        )}
      </div>
    </div>
  );
}
