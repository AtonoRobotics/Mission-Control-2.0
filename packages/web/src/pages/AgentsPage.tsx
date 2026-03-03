import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentSummary {
  agent_name: string;
  total_runs: number;
  success_rate: number;
  avg_duration_sec: number;
}

interface AgentLog {
  id: number;
  agent_name: string;
  task_type: string;
  status: 'success' | 'failed' | 'in_progress' | string;
  duration_sec: number | null;
  build_id: string | null;
  created_at: string;
  input_params: Record<string, unknown> | string | null;
  output: Record<string, unknown> | string | null;
}

interface AgentLogsResponse {
  logs: AgentLog[];
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'success':     return 'badge badge-success';
    case 'failed':      return 'badge badge-danger';
    case 'in_progress': return 'badge badge-warning';
    default:            return 'badge badge-info';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'success':     return 'Success';
    case 'failed':      return 'Failed';
    case 'in_progress': return 'In Progress';
    default:            return status;
  }
}

function formatDuration(sec: number | null): string {
  if (sec === null || sec === undefined) return '—';
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function parseJsonField(raw: Record<string, unknown> | string | null): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SummaryCardProps {
  summary: AgentSummary;
}

function SummaryCard({ summary }: SummaryCardProps) {
  const rateColor =
    summary.success_rate >= 90 ? 'var(--success)' :
    summary.success_rate >= 70 ? 'var(--warning)' :
    'var(--danger)';

  return (
    <div
      className="panel"
      style={{ padding: '14px 16px', minWidth: 160, flex: '1 1 160px' }}
    >
      <div style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {summary.agent_name}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Runs</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)' }}>
            {summary.total_runs}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Success</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: rateColor,
            fontFamily: 'var(--font-mono)' }}>
            {summary.success_rate.toFixed(1)}%
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Avg</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {formatDuration(summary.avg_duration_sec)}
          </span>
        </div>
      </div>

      {/* Success rate bar */}
      <div style={{ marginTop: 10, height: 3, background: 'var(--bg-surface-3)',
        borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, summary.success_rate))}%`,
          background: rateColor, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

interface LogRowProps {
  log: AgentLog;
  expanded: boolean;
  onToggle: () => void;
}

function LogRow({ log, expanded, onToggle }: LogRowProps) {
  const inputParsed = parseJsonField(log.input_params);
  const outputParsed = parseJsonField(log.output);

  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          cursor: 'pointer',
          borderBottom: '1px solid var(--border-default)',
          background: expanded ? 'var(--accent-dim)' : 'transparent',
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => {
          if (!expanded) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-surface-2)';
        }}
        onMouseLeave={(e) => {
          if (!expanded) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
        }}
      >
        {/* Expand indicator */}
        <td style={{ padding: '8px 10px', width: 24, color: 'var(--text-muted)', fontSize: 10 }}>
          {expanded ? '▾' : '▸'}
        </td>

        <td style={{ padding: '8px 10px', color: 'var(--accent)', fontSize: 12, fontWeight: 500 }}>
          {log.agent_name}
        </td>

        <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontSize: 11 }}>
          {log.task_type}
        </td>

        <td style={{ padding: '8px 10px' }}>
          <span className={statusBadgeClass(log.status)}>
            {statusLabel(log.status)}
          </span>
        </td>

        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: 11,
          fontFamily: 'var(--font-mono)' }}>
          {formatDuration(log.duration_sec)}
        </td>

        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: 11,
          fontFamily: 'var(--font-mono)' }}>
          {log.build_id ? log.build_id.slice(0, 8) : '—'}
        </td>

        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: 11 }}>
          {formatDate(log.created_at)}
        </td>
      </tr>

      {expanded && (
        <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
          <td colSpan={7} style={{ padding: '0 10px 12px 34px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Input Params
                </div>
                <pre
                  className="mono"
                  style={{
                    background: 'var(--bg-surface-3)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 4, padding: '8px 10px', margin: 0,
                    fontSize: 11, color: 'var(--text-secondary)',
                    overflowX: 'auto', maxHeight: 180, overflowY: 'auto',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}
                >
                  {inputParsed === null
                    ? '(none)'
                    : JSON.stringify(inputParsed, null, 2)}
                </pre>
              </div>

              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Output
                </div>
                <pre
                  className="mono"
                  style={{
                    background: 'var(--bg-surface-3)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 4, padding: '8px 10px', margin: 0,
                    fontSize: 11, color: 'var(--text-secondary)',
                    overflowX: 'auto', maxHeight: 180, overflowY: 'auto',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}
                >
                  {outputParsed === null
                    ? '(none)'
                    : JSON.stringify(outputParsed, null, 2)}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [summaries, setSummaries] = useState<AgentSummary[]>([]);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsError, setLogsError] = useState<string | null>(null);

  const [filterAgent, setFilterAgent] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [page, setPage] = useState(0);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const fetchSummaries = useCallback(async () => {
    try {
      const res = await fetch('/mc/api/agents/summary');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AgentSummary[] = await res.json();
      setSummaries(data);
      setSummaryError(null);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Failed to load summaries');
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (filterAgent)  params.set('agent_name', filterAgent);
      if (filterStatus) params.set('status', filterStatus);

      const res = await fetch(`/mc/api/agents/logs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AgentLogsResponse = await res.json();
      setLogs(data.logs ?? []);
      setLogsTotal(data.total ?? 0);
      setLogsError(null);
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : 'Failed to load logs');
    }
  }, [page, filterAgent, filterStatus]);

  // Initial + auto-refresh
  useEffect(() => {
    fetchSummaries();
    const timer = setInterval(fetchSummaries, 30_000);
    return () => clearInterval(timer);
  }, [fetchSummaries]);

  useEffect(() => {
    fetchLogs();
    const timer = setInterval(fetchLogs, 30_000);
    return () => clearInterval(timer);
  }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
    setExpandedRows(new Set());
  }, [filterAgent, filterStatus]);

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(logsTotal / PAGE_SIZE));
  const agentNames = Array.from(new Set(summaries.map((s) => s.agent_name)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%',
      overflowY: 'auto', padding: '16px 20px', gap: 16 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600,
          color: 'var(--text-primary)' }}>
          Pipeline Agents
        </h1>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          auto-refresh 30s
        </span>
      </div>

      {/* Summary cards */}
      {summaryError ? (
        <div className="panel" style={{ padding: '12px 16px', color: 'var(--danger)', fontSize: 12 }}>
          Summary error: {summaryError}
        </div>
      ) : summaries.length === 0 ? (
        <div className="panel" style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
          No agent summary data.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {summaries.map((s) => (
            <SummaryCard key={s.agent_name} summary={s} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="panel" style={{ padding: '10px 14px', display: 'flex',
        alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Filter
        </span>

        <select
          className="input"
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          style={{ minWidth: 140 }}
        >
          <option value="">All agents</option>
          {agentNames.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>

        <select
          className="input"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ minWidth: 140 }}
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="in_progress">In Progress</option>
        </select>

        {(filterAgent || filterStatus) && (
          <button
            className="btn-secondary"
            onClick={() => { setFilterAgent(''); setFilterStatus(''); }}
          >
            Clear
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
          {logsTotal} total
        </span>
      </div>

      {/* Logs table */}
      <div className="panel" style={{ overflow: 'hidden' }}>
        {logsError ? (
          <div style={{ padding: '12px 16px', color: 'var(--danger)', fontSize: 12 }}>
            Logs error: {logsError}
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                    {/* expand col */}
                    <th style={{ width: 24 }} />
                    {['Agent', 'Type', 'Status', 'Duration', 'Build ID', 'Created'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '8px 10px', textAlign: 'left',
                          fontSize: 10, fontWeight: 600,
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '20px 10px', textAlign: 'center',
                        color: 'var(--text-muted)', fontSize: 12 }}>
                        No log entries.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <LogRow
                        key={log.id}
                        log={log}
                        expanded={expandedRows.has(log.id)}
                        onToggle={() => toggleRow(log.id)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border-default)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Page {page + 1} of {totalPages}
              </span>
              <button
                className="btn-secondary"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{ opacity: page === 0 ? 0.4 : 1 }}
              >
                ← Prev
              </button>
              <button
                className="btn-secondary"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{ opacity: page >= totalPages - 1 ? 0.4 : 1 }}
              >
                Next →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
