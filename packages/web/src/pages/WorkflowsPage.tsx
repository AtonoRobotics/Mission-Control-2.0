import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RunStatus = 'pending' | 'running' | 'completed' | 'failed';
type RunStatusFilter = 'all' | RunStatus;

interface WorkflowGraph {
  id: string;
  name: string;
  description: string;
  node_count: number;
  version: string;
  [key: string]: unknown;
}

interface WorkflowRun {
  id: string;
  graph_id: string;
  graph_name: string;
  status: RunStatus;
  duration_sec: number | null;
  started_at: string;
  node_results: unknown;
}

type TabId = 'graphs' | 'runs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runStatusBadgeClass(status: string): string {
  switch (status) {
    case 'pending': return 'badge badge-info';
    case 'running': return 'badge badge-warning';
    case 'completed': return 'badge badge-success';
    case 'failed': return 'badge badge-danger';
    default: return 'badge';
  }
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtDuration(sec: number | null): string {
  if (sec === null || sec === undefined) return '—';
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TabBar({
  tabs, active, onSelect,
}: {
  tabs: { id: TabId; label: string }[];
  active: TabId;
  onSelect: (id: TabId) => void;
}) {
  return (
    <div style={{
      display: 'flex', gap: 2,
      borderBottom: '1px solid var(--border-default)',
      marginBottom: 16,
    }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: active === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            color: active === t.id ? 'var(--accent)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: active === t.id ? 600 : 400,
            padding: '8px 16px',
            transition: 'color 0.15s, border-color 0.15s',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ErrorMessage({ msg }: { msg: string }) {
  return (
    <div style={{
      padding: '12px 16px',
      background: 'rgba(255, 68, 68, 0.08)',
      border: '1px solid rgba(255, 68, 68, 0.25)',
      borderRadius: 'var(--radius-md)',
      color: 'var(--danger)',
      fontSize: 12,
    }}>
      {msg}
    </div>
  );
}

function InlineError({ msg }: { msg: string }) {
  return (
    <div style={{
      padding: '6px 10px',
      background: 'rgba(255, 68, 68, 0.08)',
      border: '1px solid rgba(255, 68, 68, 0.2)',
      borderRadius: 'var(--radius-sm)',
      color: 'var(--danger)',
      fontSize: 11,
      marginTop: 6,
    }}>
      {msg}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      color: 'var(--text-muted)', fontSize: 12, padding: 24,
    }}>
      <div style={{
        width: 14, height: 14,
        border: '2px solid var(--border-default)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      Loading…
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{
      padding: '32px 0', textAlign: 'center',
      color: 'var(--text-muted)', fontSize: 12,
    }}>
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Graph Card
// ---------------------------------------------------------------------------

function GraphCard({
  graph,
  onNewRun,
}: {
  graph: WorkflowGraph;
  onNewRun: (graphId: string) => Promise<void>;
}) {
  const [jsonOpen, setJsonOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const handleNewRun = async () => {
    setLaunching(true);
    setLaunchError(null);
    try {
      await onNewRun(graph.id);
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : 'Launch failed');
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="panel" style={{ padding: '14px 16px' }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', flex: 1, marginRight: 8 }}>
          {graph.name}
        </span>
        <span className="badge badge-accent">{graph.version}</span>
      </div>

      {/* Description */}
      {graph.description && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
          {graph.description}
        </div>
      )}

      {/* Stats + actions */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        borderTop: '1px solid var(--border-default)', paddingTop: 10, marginTop: 4,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 11, color: 'var(--text-muted)',
        }}>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{graph.node_count}</span>
          <span>nodes</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            className="btn-secondary"
            style={{ fontSize: 10, padding: '3px 10px' }}
            onClick={() => setJsonOpen((v) => !v)}
          >
            {jsonOpen ? 'Hide JSON' : 'View JSON'}
          </button>
          <button
            className="btn-primary"
            style={{ fontSize: 10, padding: '3px 10px' }}
            disabled={launching}
            onClick={handleNewRun}
          >
            {launching ? '…' : 'New Run'}
          </button>
        </div>
      </div>

      {launchError && <InlineError msg={launchError} />}

      {/* JSON viewer */}
      {jsonOpen && (
        <div style={{ marginTop: 10 }}>
          <pre style={{
            margin: 0, padding: '10px 12px',
            background: 'var(--bg-base)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 10, color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            overflowX: 'auto', maxHeight: 240,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {JSON.stringify(graph, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Graphs Tab
// ---------------------------------------------------------------------------

function GraphsTab({
  graphs,
  loading,
  error,
  onNewRun,
}: {
  graphs: WorkflowGraph[];
  loading: boolean;
  error: string | null;
  onNewRun: (graphId: string) => Promise<void>;
}) {
  return (
    <div>
      {error && <ErrorMessage msg={error} />}
      {loading && <Spinner />}
      {!loading && !error && graphs.length === 0 && <EmptyState label="No workflow graphs found." />}

      {!loading && graphs.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12,
        }}>
          {graphs.map((g) => (
            <GraphCard key={g.id} graph={g} onNewRun={onNewRun} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Runs Tab
// ---------------------------------------------------------------------------

function RunsTab({
  graphs,
}: {
  graphs: WorkflowGraph[];
}) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graphFilter, setGraphFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<RunStatusFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/workflows/runs', { params: { limit: 50 } });
      setRuns(data.runs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load runs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const filtered = runs.filter((r) => {
    if (graphFilter !== 'all' && r.graph_id !== graphFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  });

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <select
          className="input"
          value={graphFilter}
          onChange={(e) => setGraphFilter(e.target.value)}
        >
          <option value="all">All Graphs</option>
          {graphs.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <select
          className="input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as RunStatusFilter)}
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {filtered.length} run{filtered.length !== 1 ? 's' : ''}
        </span>
        <button className="btn-secondary" onClick={load} style={{ fontSize: 11 }}>Refresh</button>
      </div>

      {error && <ErrorMessage msg={error} />}
      {loading && <Spinner />}
      {!loading && !error && filtered.length === 0 && <EmptyState label="No runs match filters." />}

      {!loading && filtered.length > 0 && (
        <div className="panel" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                {['Run ID', 'Graph', 'Status', 'Duration', 'Started'].map((h, i) => (
                  <th key={i} style={{
                    padding: '8px 12px', textAlign: 'left',
                    color: 'var(--text-muted)', fontWeight: 500, fontSize: 11,
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <>
                  <tr
                    key={r.id}
                    onClick={() => toggleExpand(r.id)}
                    style={{
                      borderBottom: expanded.has(r.id) ? 'none' : '1px solid var(--border-default)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-surface-2)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background =
                        expanded.has(r.id) ? 'var(--bg-surface-2)' : 'transparent';
                    }}
                  >
                    <td style={{ padding: '8px 12px' }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>
                        {shortId(r.id)}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontSize: 11 }}>
                      {r.graph_name}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {r.status === 'running' && (
                          <span
                            className="status-dot status-dot-live"
                            style={{ background: 'var(--warning)' }}
                          />
                        )}
                        <span className={runStatusBadgeClass(r.status)}>{r.status}</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 11 }}>
                      {fmtDuration(r.duration_sec)}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {fmtDate(r.started_at)}
                    </td>
                  </tr>
                  {expanded.has(r.id) && (
                    <tr key={`${r.id}-detail`} style={{ borderBottom: '1px solid var(--border-default)' }}>
                      <td colSpan={5} style={{ padding: '0 12px 12px 12px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
                          NODE RESULTS
                        </div>
                        <pre style={{
                          margin: 0, padding: '10px 12px',
                          background: 'var(--bg-base)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 11, color: 'var(--text-secondary)',
                          fontFamily: 'var(--font-mono)',
                          overflowX: 'auto', maxHeight: 220,
                          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                        }}>
                          {JSON.stringify(r.node_results ?? {}, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const TABS: { id: TabId; label: string }[] = [
  { id: 'graphs', label: 'Graphs' },
  { id: 'runs', label: 'Runs' },
];

export default function WorkflowsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('graphs');
  const [graphs, setGraphs] = useState<WorkflowGraph[]>([]);
  const [graphsLoading, setGraphsLoading] = useState(true);
  const [graphsError, setGraphsError] = useState<string | null>(null);

  const loadGraphs = useCallback(async () => {
    setGraphsLoading(true);
    setGraphsError(null);
    try {
      const { data } = await api.get('/workflows/graphs');
      setGraphs(Array.isArray(data) ? data : []);
    } catch (e) {
      setGraphsError(e instanceof Error ? e.message : 'Failed to load graphs');
    } finally {
      setGraphsLoading(false);
    }
  }, []);

  useEffect(() => { loadGraphs(); }, [loadGraphs]);

  const handleNewRun = useCallback(async (graphId: string) => {
    await api.post('/workflows/runs', { graph_id: graphId });
  }, []);

  return (
    <div style={{
      padding: '20px 24px',
      height: '100%',
      overflowY: 'auto',
      background: 'var(--bg-base)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{
          margin: 0, fontSize: 16, fontWeight: 600,
          color: 'var(--text-primary)', letterSpacing: 0.3,
        }}>
          Workflows
        </h1>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          Agent workflow graphs and execution runs
        </div>
      </div>

      <TabBar tabs={TABS} active={activeTab} onSelect={setActiveTab} />

      {activeTab === 'graphs' && (
        <GraphsTab
          graphs={graphs}
          loading={graphsLoading}
          error={graphsError}
          onNewRun={handleNewRun}
        />
      )}
      {activeTab === 'runs' && (
        <RunsTab graphs={graphs} />
      )}

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
