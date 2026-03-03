/**
 * Log Viewer Panel — Streaming ROS log viewer with severity filtering,
 * node name filter, keyword search, and color-coded rows.
 * Subscribes to /rosout by default (configurable via config.topic).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTopics, useDataSource } from '@/data-source/hooks';
import type { MessageEvent } from '@/data-source/types';

type Severity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

interface LogEntry {
  id: number;
  timestamp: number;
  severity: Severity;
  node: string;
  message: string;
}

const SEVERITY_LEVELS: Record<number, Severity> = {
  1: 'DEBUG',
  2: 'INFO',
  4: 'WARN',
  8: 'ERROR',
  16: 'FATAL',
};

const SEVERITY_COLORS: Record<Severity, { color: string; fontWeight?: string }> = {
  DEBUG: { color: '#888' },
  INFO: { color: 'var(--text-primary)' },
  WARN: { color: '#ff8800' },
  ERROR: { color: '#ff4444' },
  FATAL: { color: '#ff4444', fontWeight: 'bold' },
};

const SEVERITY_BADGE_BG: Record<Severity, string> = {
  DEBUG: 'rgba(136,136,136,0.15)',
  INFO: 'rgba(255,255,255,0.08)',
  WARN: 'rgba(255,136,0,0.15)',
  ERROR: 'rgba(255,68,68,0.15)',
  FATAL: 'rgba(255,68,68,0.25)',
};

const MAX_ENTRIES = 500;
let entryIdCounter = 0;

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-surface-2)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle, #333)',
  borderRadius: 3,
  fontSize: 11,
  padding: '3px 6px',
};

export default function LogViewerPanel(props: any) {
  const { config = {}, onConfigChange = () => {} } = props;
  const topics = useTopics();
  const ds = useDataSource();
  const selectedTopic = (config.topic as string) || '/rosout';

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [enabledSeverities, setEnabledSeverities] = useState<Set<Severity>>(
    new Set(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']),
  );
  const [nodeFilter, setNodeFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [isPaused, setIsPaused] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;

  // Subscribe to the selected topic
  useEffect(() => {
    if (!selectedTopic) return;

    const sub = ds.subscribe(selectedTopic, (event: MessageEvent) => {
      const msg = event.message as Record<string, unknown>;

      const levelNum = typeof msg.level === 'number' ? msg.level : 2;
      const severity = SEVERITY_LEVELS[levelNum] || 'INFO';
      const node = typeof msg.name === 'string' ? msg.name : String(msg.name ?? '');
      const text = typeof msg.msg === 'string' ? msg.msg : JSON.stringify(msg);

      const entry: LogEntry = {
        id: ++entryIdCounter,
        timestamp: event.timestamp,
        severity,
        node,
        message: text,
      };

      setEntries((prev) => {
        const next = [...prev, entry];
        if (next.length > MAX_ENTRIES) {
          return next.slice(next.length - MAX_ENTRIES);
        }
        return next;
      });
    });

    return () => sub.unsubscribe();
  }, [ds, selectedTopic]);

  // Auto-scroll to bottom unless paused
  useEffect(() => {
    if (!isPausedRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  const handleMouseEnter = useCallback(() => setIsPaused(true), []);
  const handleMouseLeave = useCallback(() => {
    setIsPaused(false);
    // Scroll to bottom on resume
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  const toggleSeverity = useCallback((sev: Severity) => {
    setEnabledSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) {
        next.delete(sev);
      } else {
        next.add(sev);
      }
      return next;
    });
  }, []);

  const clearLogs = useCallback(() => setEntries([]), []);

  // Filter entries
  const nodeLower = nodeFilter.toLowerCase();
  const keyLower = keyword.toLowerCase();
  const filtered = entries.filter((e) => {
    if (!enabledSeverities.has(e.severity)) return false;
    if (nodeLower && !e.node.toLowerCase().includes(nodeLower)) return false;
    if (keyLower && !e.message.toLowerCase().includes(keyLower)) return false;
    return true;
  });

  const formatTimestamp = (ms: number): string => {
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const ms3 = String(d.getMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${ms3}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          borderBottom: '1px solid var(--border-subtle, #333)',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <select
          value={selectedTopic}
          onChange={(e) => onConfigChange({ topic: e.target.value })}
          style={{ ...inputStyle, minWidth: 120 }}
        >
          <option value="/rosout">/rosout</option>
          {topics
            .filter((t) => t.name !== '/rosout')
            .map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
        </select>

        {/* Severity checkboxes */}
        {(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'] as Severity[]).map((sev) => (
          <label
            key={sev}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              color: SEVERITY_COLORS[sev].color,
              fontWeight: SEVERITY_COLORS[sev].fontWeight as any,
              cursor: 'pointer',
              opacity: enabledSeverities.has(sev) ? 1 : 0.35,
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={enabledSeverities.has(sev)}
              onChange={() => toggleSeverity(sev)}
              style={{ accentColor: 'var(--accent)', width: 12, height: 12 }}
            />
            {sev}
          </label>
        ))}

        <input
          type="text"
          value={nodeFilter}
          onChange={(e) => setNodeFilter(e.target.value)}
          placeholder="Node filter..."
          style={{ ...inputStyle, width: 100 }}
        />

        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Search..."
          style={{ ...inputStyle, width: 100 }}
        />

        <button
          onClick={clearLogs}
          style={{
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border-subtle, #333)',
            color: 'var(--text-secondary)',
            borderRadius: 3,
            fontSize: 11,
            padding: '3px 8px',
            cursor: 'pointer',
          }}
          title="Clear all log entries"
        >
          Clear
        </button>

        {isPaused && (
          <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 'auto' }}>
            Paused
          </span>
        )}
      </div>

      {/* Log rows */}
      <div
        ref={scrollRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ flex: 1, overflow: 'auto', minHeight: 0 }}
      >
        {filtered.length === 0 && (
          <div style={{ padding: 16, color: 'var(--text-tertiary, #666)', fontSize: 12 }}>
            {entries.length === 0
              ? `Waiting for messages on ${selectedTopic}...`
              : 'No entries match current filters.'}
          </div>
        )}
        {filtered.map((entry) => {
          const style = SEVERITY_COLORS[entry.severity];
          return (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                gap: 0,
                fontFamily: 'monospace',
                fontSize: 11,
                lineHeight: '20px',
                color: style.color,
                fontWeight: style.fontWeight as any,
                borderBottom: '1px solid rgba(255,255,255,0.03)',
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 95,
                  padding: '0 6px',
                  color: 'var(--text-tertiary, #666)',
                  fontWeight: 'normal',
                }}
              >
                {formatTimestamp(entry.timestamp)}
              </span>
              <span
                style={{
                  flexShrink: 0,
                  width: 50,
                  padding: '0 4px',
                  textAlign: 'center',
                  background: SEVERITY_BADGE_BG[entry.severity],
                  borderRadius: 2,
                }}
              >
                {entry.severity}
              </span>
              <span
                style={{
                  flexShrink: 0,
                  width: 140,
                  padding: '0 6px',
                  color: 'var(--text-secondary)',
                  fontWeight: 'normal',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={entry.node}
              >
                {entry.node}
              </span>
              <span
                style={{
                  flex: 1,
                  padding: '0 6px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {entry.message}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
