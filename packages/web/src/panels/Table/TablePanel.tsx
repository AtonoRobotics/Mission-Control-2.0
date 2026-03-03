/**
 * Table Panel — Tabular display for ROS messages.
 * Topic selector, sortable columns, flattened nested objects,
 * configurable visible fields, CSV export.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTopics, useDataSource } from '@/data-source/hooks';
import type { MessageEvent } from '@/data-source/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Flatten a nested object into dot-path key/value pairs */
function flattenObject(obj: unknown, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    if (prefix) result[prefix] = obj;
    return result;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      const key = prefix ? `${prefix}[${i}]` : `[${i}]`;
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        Object.assign(result, flattenObject(item, key));
      } else {
        result[key] = item;
      }
    });
    return result;
  }
  const record = obj as Record<string, unknown>;
  for (const k of Object.keys(record)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    const val = record[k];
    if (val !== null && typeof val === 'object') {
      Object.assign(result, flattenObject(val, fullKey));
    } else {
      result[fullKey] = val;
    }
  }
  return result;
}

/** Detect array fields and expand them into rows for joint-state style data */
function buildRows(
  message: unknown,
): { rows: Record<string, unknown>[]; columns: string[]; mode: 'array' | 'kv' } {
  if (message === null || message === undefined || typeof message !== 'object') {
    return { rows: [{ value: message }], columns: ['value'], mode: 'kv' };
  }

  const record = message as Record<string, unknown>;
  const keys = Object.keys(record);

  // Detect parallel arrays (like joint_states: name[], position[], velocity[])
  const arrayKeys = keys.filter((k) => Array.isArray(record[k]));
  if (arrayKeys.length > 0) {
    const maxLen = Math.max(...arrayKeys.map((k) => (record[k] as unknown[]).length));
    if (maxLen > 0) {
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < maxLen; i++) {
        const row: Record<string, unknown> = { '#': i };
        for (const ak of arrayKeys) {
          const arr = record[ak] as unknown[];
          row[ak] = i < arr.length ? arr[i] : null;
        }
        rows.push(row);
      }
      return { rows, columns: ['#', ...arrayKeys], mode: 'array' };
    }
  }

  // Fallback: flatten to key-value table
  const flat = flattenObject(message);
  const flatKeys = Object.keys(flat);
  const rows = flatKeys.map((k) => ({ key: k, value: flat[k] }));
  return { rows, columns: ['key', 'value'], mode: 'kv' };
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') return Number.isInteger(val) ? String(val) : val.toFixed(6);
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function downloadCsv(columns: string[], rows: Record<string, unknown>[], filename: string) {
  const header = columns.join(',');
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const v = formatValue(r[c]);
          return v.includes(',') || v.includes('"') || v.includes('\n')
            ? `"${v.replace(/"/g, '""')}"`
            : v;
        })
        .join(','),
    )
    .join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
  flex: 1,
  background: 'var(--bg-surface-2)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle, #333)',
  borderRadius: 3,
  fontSize: 11,
  padding: '3px 6px',
};

const buttonStyle: React.CSSProperties = {
  background: 'var(--bg-surface-2)',
  border: '1px solid var(--border-subtle, #333)',
  color: 'var(--text-secondary)',
  borderRadius: 3,
  fontSize: 11,
  padding: '3px 8px',
  cursor: 'pointer',
};

const thStyle: React.CSSProperties = {
  padding: '4px 8px',
  textAlign: 'left',
  fontFamily: 'monospace',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border-subtle, #333)',
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  background: 'var(--bg-surface-2)',
};

const tdStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontFamily: 'monospace',
  fontSize: 12,
  color: 'var(--text-primary)',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  whiteSpace: 'nowrap',
  maxWidth: 300,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function TablePanel(props: any) {
  const { config = {}, onConfigChange = () => {} } = props;
  const topics = useTopics();
  const ds = useDataSource();
  const selectedTopic = (config.topic as string) || '';
  const visibleFields: string[] | undefined = config.fields as string[] | undefined;

  const [latestEvent, setLatestEvent] = useState<MessageEvent | undefined>();
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const subRef = useRef<{ unsubscribe: () => void } | null>(null);

  // Subscribe to selected topic
  useEffect(() => {
    subRef.current?.unsubscribe();
    subRef.current = null;
    setLatestEvent(undefined);
    if (!selectedTopic) return;
    const sub = ds.subscribe(selectedTopic, (event: MessageEvent) => {
      setLatestEvent(event);
    });
    subRef.current = sub;
    return () => {
      sub.unsubscribe();
      subRef.current = null;
    };
  }, [ds, selectedTopic]);

  // Build table data
  const { rows, columns } = useMemo(() => {
    if (!latestEvent) return { rows: [], columns: [] };
    const built = buildRows(latestEvent.message);

    // Filter columns if config.fields is set
    let cols = built.columns;
    if (visibleFields && visibleFields.length > 0) {
      cols = cols.filter((c) => visibleFields.includes(c));
    }
    return { rows: built.rows, columns: cols };
  }, [latestEvent, visibleFields]);

  // Sorted rows
  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    const sorted = [...rows].sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return va - vb;
      return String(va).localeCompare(String(vb));
    });
    return sortAsc ? sorted : sorted.reverse();
  }, [rows, sortCol, sortAsc]);

  const handleSort = useCallback(
    (col: string) => {
      if (sortCol === col) {
        setSortAsc(!sortAsc);
      } else {
        setSortCol(col);
        setSortAsc(true);
      }
    },
    [sortCol, sortAsc],
  );

  const handleExport = useCallback(() => {
    if (sortedRows.length === 0) return;
    const topicSlug = selectedTopic.replace(/\//g, '_').replace(/^_/, '');
    downloadCsv(columns, sortedRows, `${topicSlug || 'table'}_${Date.now()}.csv`);
  }, [columns, sortedRows, selectedTopic]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={toolbarStyle}>
        <select
          value={selectedTopic}
          onChange={(e) => onConfigChange({ topic: e.target.value })}
          style={selectStyle}
        >
          <option value="">Select topic...</option>
          {topics.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>

        <button onClick={handleExport} style={buttonStyle} title="Export to CSV">
          CSV
        </button>

        <span style={{ fontSize: 10, color: 'var(--text-tertiary, #666)', whiteSpace: 'nowrap' }}>
          {sortedRows.length > 0 ? `${sortedRows.length} rows` : ''}
        </span>
      </div>

      {/* Table area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {!selectedTopic && (
          <div style={{ padding: 16, color: 'var(--text-tertiary, #666)', fontSize: 12 }}>
            Select a topic to display as a table.
          </div>
        )}
        {selectedTopic && !latestEvent && (
          <div style={{ padding: 16, color: 'var(--text-tertiary, #666)', fontSize: 12 }}>
            Waiting for messages on {selectedTopic}...
          </div>
        )}
        {sortedRows.length > 0 && (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'auto',
            }}
          >
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col} style={thStyle} onClick={() => handleSort(col)}>
                    {col}
                    {sortCol === col ? (sortAsc ? ' \u25B4' : ' \u25BE') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, ri) => (
                <tr
                  key={ri}
                  style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                >
                  {columns.map((col) => (
                    <td key={col} style={tdStyle} title={formatValue(row[col])}>
                      {formatValue(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
