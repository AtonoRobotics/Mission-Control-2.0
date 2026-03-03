/**
 * Diagnostics Panel — Component status viewer for /diagnostics topic.
 * Displays status table with expandable key-value detail rows,
 * color-coded status badges, filtering, and severity-based sorting.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useDataSource } from '@/data-source/hooks';
import type { MessageEvent } from '@/data-source/types';

type DiagStatus = 'OK' | 'WARN' | 'ERROR' | 'STALE';

interface KeyValue {
  key: string;
  value: string;
}

interface DiagComponent {
  name: string;
  status: DiagStatus;
  hardwareId: string;
  message: string;
  values: KeyValue[];
  lastUpdate: number;
}

const STATUS_LEVEL: Record<number, DiagStatus> = {
  0: 'OK',
  1: 'WARN',
  2: 'ERROR',
  3: 'STALE',
};

const STATUS_SORT_ORDER: Record<DiagStatus, number> = {
  ERROR: 0,
  WARN: 1,
  OK: 2,
  STALE: 3,
};

const STATUS_BADGE: Record<DiagStatus, { color: string; bg: string }> = {
  OK: { color: '#00cc66', bg: 'rgba(0,204,102,0.15)' },
  WARN: { color: '#ff8800', bg: 'rgba(255,136,0,0.15)' },
  ERROR: { color: '#ff4444', bg: 'rgba(255,68,68,0.15)' },
  STALE: { color: '#888', bg: 'rgba(136,136,136,0.15)' },
};

const STALE_TIMEOUT_MS = 10000;

export default function DiagnosticsPanel(props: any) {
  const { config = {} } = props;
  const ds = useDataSource();
  const selectedTopic = (config.topic as string) || '/diagnostics';

  const [components, setComponents] = useState<Map<string, DiagComponent>>(new Map());
  const [filter, setFilter] = useState('');
  const [expandedNames, setExpandedNames] = useState<Set<string>>(new Set());
  const staleTimerRef = useRef<ReturnType<typeof setInterval>>();

  // Subscribe to diagnostics topic
  useEffect(() => {
    if (!selectedTopic) return;

    const sub = ds.subscribe(selectedTopic, (event: MessageEvent) => {
      const msg = event.message as Record<string, unknown>;
      const statusArr = (msg.status ?? msg.diagnostics ?? []) as Array<Record<string, unknown>>;

      if (!Array.isArray(statusArr)) return;

      setComponents((prev) => {
        const next = new Map(prev);

        for (const entry of statusArr) {
          const name = String(entry.name ?? '');
          const levelNum = typeof entry.level === 'number' ? entry.level : 0;
          const status = STATUS_LEVEL[levelNum] ?? 'STALE';
          const hardwareId = String(entry.hardware_id ?? '');
          const message = String(entry.message ?? '');
          const rawValues = (entry.values ?? []) as Array<Record<string, unknown>>;

          const values: KeyValue[] = Array.isArray(rawValues)
            ? rawValues.map((v) => ({
                key: String(v.key ?? ''),
                value: String(v.value ?? ''),
              }))
            : [];

          next.set(name, {
            name,
            status,
            hardwareId,
            message,
            values,
            lastUpdate: Date.now(),
          });
        }

        return next;
      });
    });

    return () => sub.unsubscribe();
  }, [ds, selectedTopic]);

  // Mark stale components
  useEffect(() => {
    staleTimerRef.current = setInterval(() => {
      const now = Date.now();
      setComponents((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [name, comp] of next) {
          if (comp.status !== 'STALE' && now - comp.lastUpdate > STALE_TIMEOUT_MS) {
            next.set(name, { ...comp, status: 'STALE' });
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);

    return () => {
      if (staleTimerRef.current) clearInterval(staleTimerRef.current);
    };
  }, []);

  const toggleExpanded = useCallback((name: string) => {
    setExpandedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  // Filter and sort
  const filterLower = filter.toLowerCase();
  const sorted = Array.from(components.values())
    .filter((c) => {
      if (!filterLower) return true;
      return (
        c.name.toLowerCase().includes(filterLower) ||
        c.hardwareId.toLowerCase().includes(filterLower) ||
        c.status.toLowerCase().includes(filterLower)
      );
    })
    .sort((a, b) => STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status]);

  const counts = { OK: 0, WARN: 0, ERROR: 0, STALE: 0 };
  for (const c of components.values()) {
    counts[c.status]++;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          borderBottom: '1px solid var(--border-subtle, #333)',
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter components..."
          style={{
            flex: 1,
            background: 'var(--bg-surface-2)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle, #333)',
            borderRadius: 3,
            fontSize: 11,
            padding: '3px 6px',
          }}
        />

        {/* Summary badges */}
        {(['ERROR', 'WARN', 'OK', 'STALE'] as DiagStatus[]).map((s) =>
          counts[s] > 0 ? (
            <span
              key={s}
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 3,
                background: STATUS_BADGE[s].bg,
                color: STATUS_BADGE[s].color,
                fontFamily: 'monospace',
                fontWeight: 600,
              }}
            >
              {counts[s]} {s}
            </span>
          ) : null,
        )}
      </div>

      {/* Table header */}
      <div
        style={{
          display: 'flex',
          padding: '4px 8px',
          borderBottom: '1px solid var(--border-subtle, #333)',
          fontSize: 10,
          fontFamily: 'monospace',
          color: 'var(--text-tertiary, #666)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          flexShrink: 0,
        }}
      >
        <span style={{ width: 24 }} />
        <span style={{ flex: 1 }}>Component</span>
        <span style={{ width: 70, textAlign: 'center' }}>Status</span>
        <span style={{ width: 140 }}>Hardware ID</span>
      </div>

      {/* Component rows */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {sorted.length === 0 && (
          <div style={{ padding: 16, color: 'var(--text-tertiary, #666)', fontSize: 12 }}>
            {components.size === 0
              ? `Waiting for messages on ${selectedTopic}...`
              : 'No components match filter.'}
          </div>
        )}
        {sorted.map((comp) => {
          const badge = STATUS_BADGE[comp.status];
          const isExpanded = expandedNames.has(comp.name);

          return (
            <div key={comp.name}>
              {/* Main row */}
              <div
                onClick={() => toggleExpanded(comp.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '5px 8px',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
              >
                <span
                  style={{
                    width: 24,
                    flexShrink: 0,
                    color: 'var(--text-tertiary, #666)',
                    fontSize: 10,
                    userSelect: 'none',
                  }}
                >
                  {isExpanded ? '\u25BE' : '\u25B8'}
                </span>
                <span
                  style={{
                    flex: 1,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={comp.name}
                >
                  {comp.name}
                </span>
                <span
                  style={{
                    width: 70,
                    textAlign: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 10,
                      fontWeight: 600,
                      color: badge.color,
                      padding: '1px 8px',
                      borderRadius: 10,
                      background: badge.bg,
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: badge.color,
                        flexShrink: 0,
                      }}
                    />
                    {comp.status}
                  </span>
                </span>
                <span
                  style={{
                    width: 140,
                    flexShrink: 0,
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={comp.hardwareId}
                >
                  {comp.hardwareId || '\u2014'}
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div
                  style={{
                    padding: '6px 8px 8px 32px',
                    background: 'rgba(255,255,255,0.02)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  {comp.message && (
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: 'monospace',
                        color: 'var(--text-secondary)',
                        marginBottom: 6,
                        fontStyle: 'italic',
                      }}
                    >
                      {comp.message}
                    </div>
                  )}
                  {comp.values.length > 0 ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr',
                        gap: '2px 12px',
                        fontSize: 11,
                        fontFamily: 'monospace',
                      }}
                    >
                      {comp.values.map((kv, i) => (
                        <div key={i} style={{ display: 'contents' }}>
                          <span style={{ color: 'var(--text-tertiary, #666)' }}>{kv.key}</span>
                          <span style={{ color: 'var(--text-primary)' }}>{kv.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary, #666)' }}>
                      No diagnostic values reported.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
