import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FileStatus = 'draft' | 'validated' | 'promoted' | 'deprecated' | 'failed';
type FileTypeFilter = 'all' | 'URDF' | 'USD' | 'YAML' | 'Launch';
type FileStatusFilter = 'all' | FileStatus;

interface RegistryFile {
  id: string;
  file_path: string;
  file_type: string;
  robot_id: string | null;
  status: FileStatus;
  hash: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface Build {
  id: string;
  robot_id: string | null;
  process: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  created_at: string;
  steps: unknown[];
  null_report: unknown[];
}

interface Robot {
  id: string;
  name: string;
  manufacturer: string;
  type: string;
  dof: number;
  reach_mm: number;
  payload_kg: number;
}

interface Scene {
  id: string;
  name: string;
  description: string;
  usd_path: string;
}

type TabId = 'files' | 'builds' | 'robots' | 'scenes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileTypeBadgeClass(type: string): string {
  const t = type.toUpperCase();
  if (t === 'URDF') return 'badge badge-warning';
  if (t === 'USD') return 'badge badge-info';
  if (t.startsWith('YAML') || t === 'YAML') return 'badge badge-accent';
  if (t === 'LAUNCH') return 'badge badge-success';
  return 'badge';
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'promoted': return 'badge badge-success';
    case 'validated': return 'badge badge-info';
    case 'draft': return 'badge badge-accent';
    case 'deprecated': return 'badge';
    case 'failed': return 'badge badge-danger';
    case 'complete': return 'badge badge-success';
    case 'running': return 'badge badge-warning';
    case 'pending': return 'badge badge-info';
    default: return 'badge';
  }
}

function buildStatusBadgeClass(status: string): string {
  switch (status) {
    case 'complete': return 'badge badge-success';
    case 'running': return 'badge badge-warning';
    case 'pending': return 'badge badge-info';
    case 'failed': return 'badge badge-danger';
    default: return 'badge';
  }
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function shortHash(hash: string): string {
  return hash.slice(0, 8);
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

function normalizeFileType(type: string): string {
  const t = type.toLowerCase();
  if (t === 'urdf') return 'URDF';
  if (t === 'usd') return 'USD';
  if (t.includes('yaml')) return 'YAML';
  if (t === 'launch') return 'Launch';
  return type.toUpperCase();
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
      display: 'flex', gap: 2, borderBottom: '1px solid var(--border-default)',
      paddingBottom: 0, marginBottom: 16,
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

function Spinner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      color: 'var(--text-muted)', fontSize: 12, padding: 24,
    }}>
      <div style={{
        width: 14, height: 14, border: '2px solid var(--border-default)',
        borderTopColor: 'var(--accent)', borderRadius: '50%',
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
// Files Tab
// ---------------------------------------------------------------------------

function FilesTab() {
  const [files, setFiles] = useState<RegistryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FileStatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<FileTypeFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [promoting, setPromoting] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/registry/files', { params: { limit: 50 } });
      setFiles(data.files ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePromote = async (id: string) => {
    setPromoting((prev) => new Set(prev).add(id));
    try {
      await api.patch(`/registry/files/${id}/status`, { status: 'promoted' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Promote failed');
    } finally {
      setPromoting((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const filtered = files.filter((f) => {
    const normalized = normalizeFileType(f.file_type);
    if (statusFilter !== 'all' && f.status !== statusFilter) return false;
    if (typeFilter !== 'all' && normalized !== typeFilter) return false;
    return true;
  });

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <select
          className="input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FileStatusFilter)}
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="validated">Validated</option>
          <option value="promoted">Promoted</option>
          <option value="deprecated">Deprecated</option>
          <option value="failed">Failed</option>
        </select>
        <select
          className="input"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as FileTypeFilter)}
        >
          <option value="all">All Types</option>
          <option value="URDF">URDF</option>
          <option value="USD">USD</option>
          <option value="YAML">YAML</option>
          <option value="Launch">Launch</option>
        </select>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {filtered.length} file{filtered.length !== 1 ? 's' : ''}
        </span>
        <button className="btn-secondary" onClick={load} style={{ fontSize: 11 }}>Refresh</button>
      </div>

      {error && <ErrorMessage msg={error} />}
      {loading && <Spinner />}
      {!loading && !error && filtered.length === 0 && <EmptyState label="No files match filters." />}

      {!loading && filtered.length > 0 && (
        <div className="panel" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                {['Path', 'Type', 'Robot', 'Status', 'Hash', 'Created', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '8px 12px', textAlign: 'left',
                    color: 'var(--text-muted)', fontWeight: 500, fontSize: 11,
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <>
                  <tr
                    key={f.id}
                    onClick={() => toggleExpand(f.id)}
                    style={{
                      borderBottom: expanded.has(f.id) ? 'none' : '1px solid var(--border-default)',
                      cursor: 'pointer',
                      background: expanded.has(f.id) ? 'var(--bg-surface-2)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-surface-2)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background =
                        expanded.has(f.id) ? 'var(--bg-surface-2)' : 'transparent';
                    }}
                  >
                    <td style={{ padding: '8px 12px', maxWidth: 320 }}>
                      <span style={{
                        color: 'var(--text-primary)', fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }} title={f.file_path}>
                        {f.file_path}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={fileTypeBadgeClass(f.file_type)}>
                        {normalizeFileType(f.file_type)}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: 11 }}>
                      {f.robot_id ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={statusBadgeClass(f.status)}>{f.status}</span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {shortHash(f.hash)}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {fmtDate(f.created_at)}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {f.status === 'validated' && (
                        <button
                          className="btn-primary"
                          style={{ fontSize: 10, padding: '3px 10px' }}
                          disabled={promoting.has(f.id)}
                          onClick={(e) => { e.stopPropagation(); handlePromote(f.id); }}
                        >
                          {promoting.has(f.id) ? '…' : 'Promote'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded.has(f.id) && (
                    <tr key={`${f.id}-meta`} style={{ borderBottom: '1px solid var(--border-default)' }}>
                      <td colSpan={7} style={{ padding: '0 12px 12px 12px' }}>
                        <pre style={{
                          margin: 0, padding: '10px 12px',
                          background: 'var(--bg-base)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 11, color: 'var(--text-secondary)',
                          fontFamily: 'var(--font-mono)',
                          overflowX: 'auto', maxHeight: 200,
                        }}>
                          {JSON.stringify(f.metadata ?? {}, null, 2)}
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
// Builds Tab
// ---------------------------------------------------------------------------

function BuildsTab() {
  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get('/builds', { params: { limit: 50 } });
        setBuilds(data.builds ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load builds');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  return (
    <div>
      {error && <ErrorMessage msg={error} />}
      {loading && <Spinner />}
      {!loading && !error && builds.length === 0 && <EmptyState label="No builds found." />}

      {!loading && builds.length > 0 && (
        <div className="panel" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                {['Build ID', 'Robot', 'Process', 'Status', 'Created'].map((h, i) => (
                  <th key={i} style={{
                    padding: '8px 12px', textAlign: 'left',
                    color: 'var(--text-muted)', fontWeight: 500, fontSize: 11,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {builds.map((b) => (
                <>
                  <tr
                    key={b.id}
                    onClick={() => toggleExpand(b.id)}
                    style={{
                      borderBottom: expanded.has(b.id) ? 'none' : '1px solid var(--border-default)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-surface-2)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background =
                        expanded.has(b.id) ? 'var(--bg-surface-2)' : 'transparent';
                    }}
                  >
                    <td style={{ padding: '8px 12px' }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>
                        {shortId(b.id)}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: 11 }}>
                      {b.robot_id ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontSize: 11 }}>
                      {b.process}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={buildStatusBadgeClass(b.status)}>{b.status}</span>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {fmtDate(b.created_at)}
                    </td>
                  </tr>
                  {expanded.has(b.id) && (
                    <tr key={`${b.id}-detail`} style={{ borderBottom: '1px solid var(--border-default)' }}>
                      <td colSpan={5} style={{ padding: '0 12px 12px 12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
                              STEPS
                            </div>
                            <pre style={{
                              margin: 0, padding: '10px 12px',
                              background: 'var(--bg-base)',
                              border: '1px solid var(--border-default)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 11, color: 'var(--text-secondary)',
                              fontFamily: 'var(--font-mono)',
                              overflowX: 'auto', maxHeight: 180,
                            }}>
                              {JSON.stringify(b.steps ?? [], null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
                              NULL REPORT
                            </div>
                            <pre style={{
                              margin: 0, padding: '10px 12px',
                              background: 'var(--bg-base)',
                              border: '1px solid var(--border-default)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 11, color: 'var(--text-secondary)',
                              fontFamily: 'var(--font-mono)',
                              overflowX: 'auto', maxHeight: 180,
                            }}>
                              {JSON.stringify(b.null_report ?? [], null, 2)}
                            </pre>
                          </div>
                        </div>
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
// Robots Tab
// ---------------------------------------------------------------------------

function RobotsTab() {
  const [robots, setRobots] = useState<Robot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get('/registry/robots');
        setRobots(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load robots');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      {error && <ErrorMessage msg={error} />}
      {loading && <Spinner />}
      {!loading && !error && robots.length === 0 && <EmptyState label="No robots registered." />}

      {!loading && robots.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 12,
        }}>
          {robots.map((r) => (
            <div key={r.id} className="panel" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                  {r.name}
                </span>
                <span className="badge badge-accent" style={{ marginLeft: 8, flexShrink: 0 }}>
                  {r.type}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
                {r.manufacturer}
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
                borderTop: '1px solid var(--border-default)', paddingTop: 10,
              }}>
                {[
                  { label: 'DOF', value: r.dof },
                  { label: 'Reach', value: `${r.reach_mm}mm` },
                  { label: 'Payload', value: `${r.payload_kg}kg` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scenes Tab
// ---------------------------------------------------------------------------

function ScenesTab() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get('/registry/scenes');
        setScenes(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load scenes');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      {error && <ErrorMessage msg={error} />}
      {loading && <Spinner />}
      {!loading && !error && scenes.length === 0 && <EmptyState label="No scenes registered." />}

      {!loading && scenes.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}>
          {scenes.map((s) => (
            <div key={s.id} className="panel" style={{ padding: '14px 16px' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>
                {s.name}
              </div>
              {s.description && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
                  {s.description}
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 8, marginTop: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>USD Path</div>
                <span className="mono" style={{
                  fontSize: 10, color: 'var(--text-muted)',
                  display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }} title={s.usd_path}>
                  {s.usd_path}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const TABS: { id: TabId; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'builds', label: 'Builds' },
  { id: 'robots', label: 'Robots' },
  { id: 'scenes', label: 'Scenes' },
];

export default function RegistryPage() {
  const [activeTab, setActiveTab] = useState<TabId>('files');

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
          Registry
        </h1>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          File and configuration artifact management
        </div>
      </div>

      <TabBar tabs={TABS} active={activeTab} onSelect={setActiveTab} />

      {activeTab === 'files' && <FilesTab />}
      {activeTab === 'builds' && <BuildsTab />}
      {activeTab === 'robots' && <RobotsTab />}
      {activeTab === 'scenes' && <ScenesTab />}

      {/* Spinner keyframe — injected once */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
