import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/services/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Workflow {
  name: string;
  status: string;
  pool: string;
  submit_time: string;
  start_time: string | null;
  end_time: string | null;
  duration: number | null;
  queued_time: number | null;
  user: string;
  overview: string;
}

interface WorkflowDetail extends Workflow {
  uuid: string;
  groups: Array<{
    name: string;
    status: string;
    tasks: Array<{ name: string; status: string; node_name: string; exit_code: number | null }>;
  }>;
}

interface Pool {
  name: string;
  description: string;
  status: string;
  backend: string;
}

interface Template {
  id: string;
  name: string;
  resources: Record<string, any>;
  task_count: number;
}

type TabId = 'workflows' | 'pools' | 'templates';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(secs: number | null): string {
  if (secs == null) return '—';
  if (secs < 60) return `${secs.toFixed(1)}s`;
  return `${Math.floor(secs / 60)}m ${Math.floor(secs % 60)}s`;
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#00cc66',
  RUNNING: '#ffaa00',
  PENDING: '#888',
  INITIALIZING: '#888',
  FAILED: '#ff4444',
  FAILED_CANCELED: '#ff4444',
  FAILED_IMAGE_PULL: '#ff4444',
  CANCELED: '#ff8800',
  ONLINE: '#00cc66',
  OFFLINE: '#ff4444',
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || '#888';
  const isRunning = status === 'RUNNING';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: `${color}18`, color, border: `1px solid ${color}40`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: color,
        animation: isRunning ? 'pulse 1.5s infinite' : 'none',
      }} />
      {status}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function OSMOPage() {
  const [tab, setTab] = useState<TabId>('workflows');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [expandedWf, setExpandedWf] = useState<string | null>(null);
  const [wfDetail, setWfDetail] = useState<WorkflowDetail | null>(null);
  const [logModal, setLogModal] = useState<{ id: string; logs: string } | null>(null);
  const [submitModal, setSubmitModal] = useState<{ pool: string } | null>(null);
  const [submitYaml, setSubmitYaml] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch ──

  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await api.get('/osmo/workflows?limit=50');
      setWorkflows(res.data.workflows || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPools = useCallback(async () => {
    try {
      const res = await api.get('/osmo/pools');
      const poolMap = res.data.pools || {};
      setPools(Object.values(poolMap));
    } catch (e: any) {
      setError(e.message || 'Failed to load pools');
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await api.get('/osmo/templates');
      setTemplates(res.data.templates || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load templates');
    }
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    try {
      const res = await api.get(`/osmo/workflows/${id}`);
      setWfDetail(res.data);
    } catch { /* ignore */ }
  }, []);

  const fetchLogs = useCallback(async (id: string) => {
    try {
      const res = await api.get(`/osmo/workflows/${id}/logs`);
      setLogModal({ id, logs: res.data.logs || 'No logs available' });
    } catch (e: any) {
      setLogModal({ id, logs: `Error: ${e.message}` });
    }
  }, []);

  // ── Actions ──

  const cancelWorkflow = useCallback(async (id: string) => {
    try {
      await api.post(`/osmo/workflows/${id}/cancel`);
      fetchWorkflows();
    } catch { /* ignore */ }
  }, [fetchWorkflows]);

  const submitWorkflow = useCallback(async () => {
    if (!submitModal || !submitYaml.trim()) return;
    setSubmitting(true);
    try {
      const blob = new Blob([submitYaml], { type: 'text/yaml' });
      const formData = new FormData();
      formData.append('file', blob, 'workflow.yaml');
      await api.post(`/osmo/workflows/yaml?pool=${submitModal.pool}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSubmitModal(null);
      setSubmitYaml('');
      fetchWorkflows();
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setSubmitting(false);
    }
  }, [submitModal, submitYaml, fetchWorkflows]);

  const submitTemplate = useCallback(async (templateId: string, pool: string) => {
    try {
      await api.post(`/osmo/templates/${templateId}/submit?pool=${pool}`);
      setTab('workflows');
      fetchWorkflows();
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    }
  }, [fetchWorkflows]);

  // ── Effects ──

  useEffect(() => {
    setLoading(true);
    fetchWorkflows();
    fetchPools();
    fetchTemplates();
  }, [fetchWorkflows, fetchPools, fetchTemplates]);

  useEffect(() => {
    if (tab === 'workflows') {
      intervalRef.current = setInterval(fetchWorkflows, 10000);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }
  }, [tab, fetchWorkflows]);

  useEffect(() => {
    if (expandedWf) fetchDetail(expandedWf);
  }, [expandedWf, fetchDetail]);

  // ── Render ──

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'workflows', label: 'Workflows', count: workflows.length },
    { id: 'pools', label: 'Pools', count: pools.length },
    { id: 'templates', label: 'Templates', count: templates.length },
  ];

  return (
    <div style={{ padding: '20px 24px', height: '100%', overflowY: 'auto', background: 'var(--bg-base)' }}>
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
          OSMO Workflows
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" onClick={() => setSubmitModal({ pool: 'default' })}
            style={{ fontSize: 12, padding: '6px 12px' }}>
            + Submit Workflow
          </button>
          <button className="btn-secondary" onClick={fetchWorkflows}
            style={{ fontSize: 12, padding: '6px 12px' }}>
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #222', marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 500,
            color: tab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
          }}>
            {t.label}
            {t.count != null && <span style={{ marginLeft: 6, opacity: 0.5 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 4, fontSize: 12,
          background: '#ff444418', color: '#ff4444', border: '1px solid #ff444440' }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Loading...</div>}

      {/* Tab Content */}
      {!loading && tab === 'workflows' && (
        <WorkflowsTab
          workflows={workflows}
          expandedWf={expandedWf}
          wfDetail={wfDetail}
          onExpand={id => setExpandedWf(expandedWf === id ? null : id)}
          onLogs={fetchLogs}
          onCancel={cancelWorkflow}
        />
      )}

      {!loading && tab === 'pools' && (
        <PoolsTab pools={pools} onSubmit={pool => setSubmitModal({ pool })} />
      )}

      {!loading && tab === 'templates' && (
        <TemplatesTab templates={templates} pools={pools} onSubmit={submitTemplate} />
      )}

      {/* Log Modal */}
      {logModal && (
        <Modal title={`Logs: ${logModal.id}`} onClose={() => setLogModal(null)}>
          <pre style={{
            margin: 0, padding: 12, background: '#000', borderRadius: 4,
            fontSize: 11, fontFamily: 'monospace', color: '#ccc',
            maxHeight: 500, overflow: 'auto', whiteSpace: 'pre-wrap',
          }}>
            {logModal.logs}
          </pre>
        </Modal>
      )}

      {/* Submit Modal */}
      {submitModal && (
        <Modal title={`Submit Workflow → ${submitModal.pool}`} onClose={() => setSubmitModal(null)}>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Pool
            </label>
            <select className="input" value={submitModal.pool}
              onChange={e => setSubmitModal({ pool: e.target.value })}
              style={{ width: '100%', fontSize: 12 }}>
              {pools.map(p => <option key={p.name} value={p.name}>{p.name} — {p.description}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Workflow YAML
            </label>
            <textarea className="input" value={submitYaml} onChange={e => setSubmitYaml(e.target.value)}
              placeholder={'workflow:\n  name: my-job\n  resources:\n    default:\n      cpu: 1\n      gpu: 1\n      memory: 4Gi\n      storage: 2Gi\n  tasks:\n  - name: task1\n    image: ubuntu:24.04\n    command: ["echo", "hello"]'}
              style={{ width: '100%', height: 300, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
            />
          </div>
          <button className="btn-primary" onClick={submitWorkflow} disabled={submitting || !submitYaml.trim()}
            style={{ width: '100%', fontSize: 13 }}>
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </Modal>
      )}
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function WorkflowsTab({ workflows, expandedWf, wfDetail, onExpand, onLogs, onCancel }: {
  workflows: Workflow[];
  expandedWf: string | null;
  wfDetail: WorkflowDetail | null;
  onExpand: (id: string) => void;
  onLogs: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  if (workflows.length === 0) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>No workflows yet</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 100px 120px 80px 100px', gap: 8, padding: '8px 12px',
        fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        <span>Name</span><span>Status</span><span>Pool</span><span>Submitted</span><span>Duration</span><span>Actions</span>
      </div>
      {/* Rows */}
      {workflows.map(wf => (
        <div key={wf.name}>
          <div onClick={() => onExpand(wf.name)} className="panel" style={{
            display: 'grid', gridTemplateColumns: '2fr 100px 100px 120px 80px 100px', gap: 8,
            padding: '10px 12px', cursor: 'pointer', alignItems: 'center',
            borderLeft: expandedWf === wf.name ? '2px solid var(--accent)' : '2px solid transparent',
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{wf.name}</span>
            <StatusBadge status={wf.status} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{wf.pool}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{relativeTime(wf.submit_time)}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDuration(wf.duration)}</span>
            <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => onLogs(wf.name)} style={{
                padding: '2px 8px', fontSize: 11, background: 'none', border: '1px solid #333',
                borderRadius: 3, color: 'var(--text-secondary)', cursor: 'pointer',
              }}>Logs</button>
              {(wf.status === 'RUNNING' || wf.status === 'PENDING') && (
                <button onClick={() => onCancel(wf.name)} style={{
                  padding: '2px 8px', fontSize: 11, background: 'none', border: '1px solid #ff444440',
                  borderRadius: 3, color: '#ff4444', cursor: 'pointer',
                }}>Cancel</button>
              )}
            </div>
          </div>
          {/* Expanded Detail */}
          {expandedWf === wf.name && wfDetail && (
            <div style={{ padding: '12px 16px', background: 'var(--bg-surface-1)', borderRadius: '0 0 6px 6px', marginTop: -1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                UUID: {wfDetail.uuid} | User: {wfDetail.user}
              </div>
              {wfDetail.groups?.map(g => (
                <div key={g.name} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    Group: {g.name} <StatusBadge status={g.status} />
                  </div>
                  {g.tasks?.map(t => (
                    <div key={t.name} style={{
                      display: 'flex', gap: 12, padding: '4px 8px', fontSize: 12, color: 'var(--text-secondary)',
                      background: '#0005', borderRadius: 3, marginBottom: 2,
                    }}>
                      <span style={{ flex: 1 }}>{t.name}</span>
                      <StatusBadge status={t.status} />
                      <span>{t.node_name || '—'}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PoolsTab({ pools, onSubmit }: { pools: Pool[]; onSubmit: (pool: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
      {pools.map(p => (
        <div key={p.name} className="panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</span>
            <StatusBadge status={p.status} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px' }}>{p.description || 'No description'}</p>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>Backend: {p.backend}</div>
          <button className="btn-primary" onClick={() => onSubmit(p.name)}
            style={{ width: '100%', fontSize: 12, padding: '6px 12px' }}>
            Submit Workflow
          </button>
        </div>
      ))}
    </div>
  );
}

function TemplatesTab({ templates, pools, onSubmit }: {
  templates: Template[];
  pools: Pool[];
  onSubmit: (templateId: string, pool: string) => void;
}) {
  const [selectedPool, setSelectedPool] = useState('default');

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Target Pool:</label>
        <select className="input" value={selectedPool} onChange={e => setSelectedPool(e.target.value)}
          style={{ fontSize: 12, padding: '4px 8px' }}>
          {pools.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {templates.map(t => {
          const res = t.resources?.default || {};
          return (
            <div key={t.id} className="panel" style={{ padding: '16px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{t.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {t.task_count} task{t.task_count !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                {res.cpu && <ResourceBadge label="CPU" value={res.cpu} />}
                {res.gpu && <ResourceBadge label="GPU" value={res.gpu} />}
                {res.memory && <ResourceBadge label="RAM" value={res.memory} />}
                {res.storage && <ResourceBadge label="Disk" value={res.storage} />}
              </div>
              <button className="btn-primary" onClick={() => onSubmit(t.id, selectedPool)}
                style={{ width: '100%', fontSize: 12, padding: '6px 12px' }}>
                Run on {selectedPool}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResourceBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <span style={{
      padding: '2px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
      background: '#ffaa0015', color: '#ffaa00', border: '1px solid #ffaa0030',
    }}>
      {label}: {value}
    </span>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-surface-1)', borderRadius: 8, padding: 20,
        width: '90%', maxWidth: 600, maxHeight: '80vh', overflow: 'auto',
        border: '1px solid #333',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-secondary)',
            fontSize: 18, cursor: 'pointer', padding: '0 4px',
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
