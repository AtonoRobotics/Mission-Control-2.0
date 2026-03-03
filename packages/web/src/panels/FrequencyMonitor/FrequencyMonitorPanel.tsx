/**
 * Frequency Monitor Panel — per-topic publish rate tracking.
 * Measures actual vs expected publish rates.
 */

import { useState, useEffect, useRef } from 'react';
import { useDataSource, useTopics } from '@/data-source/hooks';
import type { MessageEvent } from '@/data-source/types';

interface TopicFreq {
  topic: string;
  hz: number;
  expectedHz: number | null;
  messageCount: number;
  lastTime: number;
}

export default function FrequencyMonitorPanel(props: any) {
  const ds = useDataSource();
  const topics = useTopics();
  const [frequencies, setFrequencies] = useState<TopicFreq[]>([]);
  const [sortBy, setSortBy] = useState<'topic' | 'hz'>('hz');
  const countsRef = useRef<Map<string, { count: number; firstTime: number; lastTime: number }>>(new Map());
  const subsRef = useRef<Array<{ unsubscribe: () => void }>>([]);

  useEffect(() => {
    subsRef.current.forEach((s) => s.unsubscribe());
    subsRef.current = [];
    countsRef.current.clear();

    for (const t of topics) {
      const sub = ds.subscribe(t.name, (event: MessageEvent) => {
        const entry = countsRef.current.get(t.name) || { count: 0, firstTime: event.receiveTime, lastTime: event.receiveTime };
        entry.count++;
        entry.lastTime = event.receiveTime;
        countsRef.current.set(t.name, entry);
      });
      subsRef.current.push(sub);
    }

    // Update display at 2Hz
    const interval = setInterval(() => {
      const now = Date.now();
      const freqs: TopicFreq[] = [];
      countsRef.current.forEach((entry, topic) => {
        const elapsed = (entry.lastTime - entry.firstTime) / 1000;
        const hz = elapsed > 0 ? (entry.count - 1) / elapsed : 0;
        const stale = now - entry.lastTime > 5000;
        freqs.push({
          topic,
          hz: stale ? 0 : hz,
          expectedHz: null, // auto-detect: use peak rate
          messageCount: entry.count,
          lastTime: entry.lastTime,
        });
      });
      setFrequencies(freqs);
    }, 500);

    return () => {
      clearInterval(interval);
      subsRef.current.forEach((s) => s.unsubscribe());
      subsRef.current = [];
    };
  }, [ds, topics.length]);

  const sorted = [...frequencies].sort((a, b) =>
    sortBy === 'hz' ? b.hz - a.hz : a.topic.localeCompare(b.topic),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--border-subtle, #333)', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary, #666)' }}>FREQUENCY</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setSortBy(sortBy === 'hz' ? 'topic' : 'hz')}
          style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle, #333)', color: 'var(--text-secondary)', borderRadius: 3, fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}
        >
          Sort: {sortBy === 'hz' ? 'Rate' : 'Name'}
        </button>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary, #666)' }}>{frequencies.length} topics</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', gap: 4, padding: '3px 8px', fontSize: 10, color: 'var(--text-tertiary, #666)', borderBottom: '1px solid var(--border-subtle, #333)' }}>
        <span style={{ flex: 1 }}>Topic</span>
        <span style={{ width: 60, textAlign: 'right' }}>Hz</span>
        <span style={{ width: 60, textAlign: 'right' }}>Messages</span>
        <span style={{ width: 80 }}>Rate</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {sorted.length === 0 && (
          <div style={{ padding: 16, color: 'var(--text-tertiary, #666)', fontSize: 12 }}>
            Waiting for topic messages...
          </div>
        )}
        {sorted.map((f) => {
          const barWidth = Math.min(100, (f.hz / Math.max(...sorted.map((s) => s.hz), 1)) * 100);
          const stale = f.hz === 0 && f.messageCount > 0;
          return (
            <div
              key={f.topic}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                fontSize: 11,
                fontFamily: 'monospace',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
              }}
            >
              <span style={{ flex: 1, color: stale ? '#666' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.topic}</span>
              <span style={{ width: 60, textAlign: 'right', color: stale ? '#666' : f.hz > 0 ? 'var(--text-primary)' : 'var(--text-tertiary, #666)' }}>
                {f.hz.toFixed(1)}
              </span>
              <span style={{ width: 60, textAlign: 'right', color: 'var(--text-tertiary, #666)' }}>{f.messageCount}</span>
              <div style={{ width: 80, height: 8, background: 'var(--bg-surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${barWidth}%`, height: '100%', background: stale ? '#666' : 'var(--accent)', borderRadius: 4, transition: 'width 0.3s' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
