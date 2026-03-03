/**
 * Plot Panel — Time-series graphing with uPlot.
 * Multiple series, field selection via message path, auto-scale Y axis.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useTopics, useDataSource } from '@/data-source/hooks';
import type { MessageEvent } from '@/data-source/types';
import { resolveField } from '@/message-path';

interface SeriesConfig {
  topic: string;
  field: string; // message path syntax, e.g. "position[0].@degrees"
  color: string;
}

const COLORS = ['#ffaa00', '#4fc3f7', '#81c784', '#e57373', '#ba68c8', '#ffb74d', '#4dd0e1', '#aed581'];
const MAX_POINTS = 1000;
const DEFAULT_WINDOW_SEC = 30;

export default function PlotPanel(props: any) {
  const { config = {}, onConfigChange = () => {} } = props;
  const topics = useTopics();
  const ds = useDataSource();
  const chartRef = useRef<HTMLDivElement>(null!);
  const plotRef = useRef<uPlot | null>(null);
  const dataRef = useRef<number[][]>([[]]);
  const subsRef = useRef<Array<{ unsubscribe: () => void }>>([]);

  const seriesList: SeriesConfig[] = (config.series as SeriesConfig[]) || [];
  const windowSec = (config.windowSec as number) || DEFAULT_WINDOW_SEC;

  // New series input state
  const [newTopic, setNewTopic] = useState('');
  const [newField, setNewField] = useState('');

  // Initialize/update uPlot
  useEffect(() => {
    if (!chartRef.current) return;

    const opts: uPlot.Options = {
      width: chartRef.current.clientWidth,
      height: chartRef.current.clientHeight - 2,
      cursor: { show: true },
      scales: {
        x: { time: true },
        y: { auto: true },
      },
      axes: [
        {
          stroke: '#666',
          grid: { stroke: 'rgba(255,255,255,0.05)' },
          ticks: { stroke: '#444' },
        },
        {
          stroke: '#666',
          grid: { stroke: 'rgba(255,255,255,0.05)' },
          ticks: { stroke: '#444' },
        },
      ],
      series: [
        { label: 'Time' },
        ...seriesList.map((s, i) => ({
          label: `${s.topic}:${s.field}`,
          stroke: s.color || COLORS[i % COLORS.length],
          width: 1.5,
        })),
      ],
    };

    // Initialize data arrays: [timestamps, ...seriesValues]
    dataRef.current = Array.from({ length: seriesList.length + 1 }, () => []);

    const plot = new uPlot(opts, dataRef.current as uPlot.AlignedData, chartRef.current);
    plotRef.current = plot;

    // Handle resize
    const ro = new ResizeObserver(() => {
      if (chartRef.current) {
        plot.setSize({ width: chartRef.current.clientWidth, height: chartRef.current.clientHeight - 2 });
      }
    });
    ro.observe(chartRef.current);

    return () => {
      ro.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
  }, [seriesList.length]); // Rebuild on series count change

  // Manage subscriptions
  useEffect(() => {
    // Clean up old subscriptions
    subsRef.current.forEach((s) => s.unsubscribe());
    subsRef.current = [];

    seriesList.forEach((seriesCfg, idx) => {
      const sub = ds.subscribe(seriesCfg.topic, (event: MessageEvent) => {
        const resolved = resolveField(event.message, seriesCfg.field);
        const val = typeof resolved === 'number' ? resolved : null;
        if (val === null) return;

        const data = dataRef.current;
        const now = event.timestamp / 1000; // ms → sec for uPlot

        // Append to all arrays (fill null for other series)
        data[0].push(now);
        for (let i = 0; i < seriesList.length; i++) {
          if (i === idx) {
            data[i + 1].push(val);
          } else {
            data[i + 1].push(data[i + 1].length > 0 ? data[i + 1][data[i + 1].length - 1] : 0);
          }
        }

        // Trim to max points
        if (data[0].length > MAX_POINTS) {
          const excess = data[0].length - MAX_POINTS;
          data.forEach((arr) => arr.splice(0, excess));
        }

        // Update plot
        if (plotRef.current) {
          plotRef.current.setData(data as uPlot.AlignedData);
        }
      });
      subsRef.current.push(sub);
    });

    return () => {
      subsRef.current.forEach((s) => s.unsubscribe());
      subsRef.current = [];
    };
  }, [ds, seriesList]);

  const addSeries = useCallback(() => {
    if (!newTopic || !newField) return;
    const updated: SeriesConfig[] = [
      ...seriesList,
      { topic: newTopic, field: newField, color: COLORS[seriesList.length % COLORS.length] },
    ];
    onConfigChange({ series: updated });
    setNewTopic('');
    setNewField('');
  }, [newTopic, newField, seriesList, onConfigChange]);

  const removeSeries = useCallback(
    (idx: number) => {
      const updated = seriesList.filter((_, i) => i !== idx);
      onConfigChange({ series: updated });
    },
    [seriesList, onConfigChange],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Series config toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          borderBottom: '1px solid var(--border-subtle, #333)',
          flexShrink: 0,
          flexWrap: 'wrap',
          fontSize: 11,
        }}
      >
        {seriesList.map((s, i) => (
          <span
            key={i}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              borderRadius: 3,
              background: 'var(--bg-surface-2)',
              border: `1px solid ${s.color}`,
              color: s.color,
            }}
          >
            {s.field}
            <button
              onClick={() => removeSeries(i)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 10, padding: 0 }}
            >
              ×
            </button>
          </span>
        ))}

        <select
          value={newTopic}
          onChange={(e) => setNewTopic(e.target.value)}
          style={{
            background: 'var(--bg-surface-2)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle, #333)',
            borderRadius: 3,
            fontSize: 11,
            padding: '2px 4px',
          }}
        >
          <option value="">Topic...</option>
          {topics.map((t) => (
            <option key={t.name} value={t.name}>{t.name}</option>
          ))}
        </select>

        <input
          type="text"
          value={newField}
          onChange={(e) => setNewField(e.target.value)}
          placeholder="position[0]"
          style={{
            background: 'var(--bg-surface-2)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle, #333)',
            borderRadius: 3,
            fontSize: 11,
            padding: '2px 6px',
            width: 100,
          }}
          onKeyDown={(e) => e.key === 'Enter' && addSeries()}
        />

        <button
          onClick={addSeries}
          style={{
            background: 'var(--accent-dim)',
            color: 'var(--accent)',
            border: '1px solid var(--accent)',
            borderRadius: 3,
            fontSize: 11,
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          + Add
        </button>
      </div>

      {/* Chart area */}
      <div ref={chartRef} style={{ flex: 1, minHeight: 0, background: 'var(--bg-base, #0a0a0a)' }}>
        {seriesList.length === 0 && (
          <div style={{ padding: 16, color: 'var(--text-tertiary, #666)', fontSize: 12 }}>
            Add a series to start plotting. Select a topic and enter a field path (e.g. linear.x).
          </div>
        )}
      </div>
    </div>
  );
}
