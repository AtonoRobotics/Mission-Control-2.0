/**
 * Latency Monitor Panel — per-topic message latency tracking.
 * Measures time between header stamp and receive time.
 */

import { useState, useEffect, useRef } from 'react';
import { useDataSource, useTopics } from '@/data-source/hooks';
import type { MessageEvent } from '@/data-source/types';

interface TopicLatency {
  topic: string;
  samples: number[];
  min: number;
  max: number;
  mean: number;
  p95: number;
  last: number;
}

export default function LatencyMonitorPanel(props: any) {
  const { config = {} } = props;
  const ds = useDataSource();
  const topics = useTopics();
  const [latencies, setLatencies] = useState<Map<string, TopicLatency>>(new Map());
  const [threshold, setThreshold] = useState((config.thresholdMs as number) || 100);
  const subsRef = useRef<Array<{ unsubscribe: () => void }>>([]);
  const dataRef = useRef<Map<string, number[]>>(new Map());

  useEffect(() => {
    subsRef.current.forEach((s) => s.unsubscribe());
    subsRef.current = [];
    dataRef.current.clear();

    for (const t of topics) {
      const sub = ds.subscribe(t.name, (event: MessageEvent) => {
        const msg = event.message as any;
        const stamp = msg?.header?.stamp;
        if (!stamp) return;

        const msgTimeMs = (stamp.sec ?? stamp.secs ?? 0) * 1000 + ((stamp.nanosec ?? stamp.nsecs ?? 0) / 1e6);
        if (msgTimeMs < 1e9) return; // invalid timestamp

        const latencyMs = event.receiveTime - msgTimeMs;
        if (latencyMs < 0 || latencyMs > 60000) return; // filter implausible

        let samples = dataRef.current.get(t.name) || [];
        samples.push(latencyMs);
        if (samples.length > 200) samples = samples.slice(-200);
        dataRef.current.set(t.name, samples);
      });
      subsRef.current.push(sub);
    }

    // Update display at 2Hz
    const interval = setInterval(() => {
      const map = new Map<string, TopicLatency>();
      dataRef.current.forEach((samples, topic) => {
        if (samples.length === 0) return;
        const sorted = [...samples].sort((a, b) => a - b);
        map.set(topic, {
          topic,
          samples,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          mean: samples.reduce((a, b) => a + b, 0) / samples.length,
          p95: sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1],
          last: samples[samples.length - 1],
        });
      });
      setLatencies(map);
    }, 500);

    return () => {
      clearInterval(interval);
      subsRef.current.forEach((s) => s.unsubscribe());
      subsRef.current = [];
    };
  }, [ds, topics.length]);

  const entries = Array.from(latencies.values()).sort((a, b) => b.p95 - a.p95);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--border-subtle, #333)', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary, #666)' }}>LATENCY (ms)</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-tertiary, #666)' }}>Alert:</span>
        <input
          type="number"
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          style={{ width: 50, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle, #333)', borderRadius: 3, fontSize: 11, padding: '2px 4px' }}
        />
        <span style={{ fontSize: 10, color: 'var(--text-tertiary, #666)' }}>ms</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', gap: 4, padding: '3px 8px', fontSize: 10, color: 'var(--text-tertiary, #666)', borderBottom: '1px solid var(--border-subtle, #333)' }}>
        <span style={{ flex: 1 }}>Topic</span>
        <span style={{ width: 50, textAlign: 'right' }}>Last</span>
        <span style={{ width: 50, textAlign: 'right' }}>Mean</span>
        <span style={{ width: 50, textAlign: 'right' }}>P95</span>
        <span style={{ width: 50, textAlign: 'right' }}>Max</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {entries.length === 0 && (
          <div style={{ padding: 16, color: 'var(--text-tertiary, #666)', fontSize: 12 }}>
            Waiting for messages with header timestamps...
          </div>
        )}
        {entries.map((e) => {
          const alert = e.p95 > threshold;
          return (
            <div
              key={e.topic}
              style={{
                display: 'flex',
                gap: 4,
                padding: '3px 8px',
                fontSize: 11,
                fontFamily: 'monospace',
                background: alert ? 'rgba(255,68,68,0.08)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
              }}
            >
              <span style={{ flex: 1, color: alert ? '#ff4444' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.topic}</span>
              <span style={{ width: 50, textAlign: 'right', color: 'var(--text-primary)' }}>{e.last.toFixed(1)}</span>
              <span style={{ width: 50, textAlign: 'right', color: 'var(--text-secondary)' }}>{e.mean.toFixed(1)}</span>
              <span style={{ width: 50, textAlign: 'right', color: alert ? '#ff4444' : 'var(--text-primary)' }}>{e.p95.toFixed(1)}</span>
              <span style={{ width: 50, textAlign: 'right', color: 'var(--text-tertiary, #666)' }}>{e.max.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
