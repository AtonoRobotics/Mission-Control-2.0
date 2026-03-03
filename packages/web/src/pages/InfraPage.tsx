import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContainerInfo {
  name: string;
  status: string;
  image: string;
  ports: string | string[] | null;
}

interface Ros2Status {
  connected: boolean;
  url: string;
}

interface Ros2Topic {
  name: string;
  type: string;
}

interface IsaacStatus {
  running: boolean;
  details: Record<string, unknown> | string | null;
}

type TabId = 'containers' | 'ros2' | 'isaac';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function containerBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === 'running')                       return 'badge badge-success';
  if (s === 'exited' || s === 'stopped')     return 'badge badge-danger';
  if (s === 'starting' || s === 'restarting') return 'badge badge-warning';
  if (s === 'paused')                        return 'badge badge-info';
  return 'badge badge-info';
}

function normalizePorts(ports: string | string[] | null): string {
  if (!ports) return '—';
  if (Array.isArray(ports)) return ports.join(', ') || '—';
  return ports || '—';
}

function parseJsonField(raw: Record<string, unknown> | string | null): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

// ─── Containers Tab ───────────────────────────────────────────────────────────

function ContainersTab() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const { data } = await api.get<ContainerInfo[]>('/containers');
      setContainers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load containers');
    }
  }, []);

  useEffect(() => {
    fetch_();
    const timer = setInterval(fetch_, 15_000);
    return () => clearInterval(timer);
  }, [fetch_]);

  if (error) {
    return (
      <div style={{ padding: '12px 0', color: 'var(--danger)', fontSize: 12 }}>
        Error: {error}
      </div>
    );
  }

  if (containers.length === 0) {
    return (
      <div style={{ padding: '20px 0', color: 'var(--text-muted)', fontSize: 12 }}>
        No containers found.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
      gap: 10, paddingTop: 4 }}>
      {containers.map((c) => {
        const isRunning = c.status.toLowerCase() === 'running';
        return (
          <div
            key={c.name}
            className="panel"
            style={{
              padding: '12px 14px',
              borderLeft: `3px solid ${isRunning ? 'var(--success)' : 'var(--border-default)'}`,
            }}
          >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {c.name}
              </span>
              <span className={containerBadgeClass(c.status)}>
                {c.status}
              </span>
            </div>

            {/* Image */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 40 }}>
                Image
              </span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.image || '—'}
              </span>
            </div>

            {/* Ports */}
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 40 }}>
                Ports
              </span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {normalizePorts(c.ports)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ROS2 Tab ─────────────────────────────────────────────────────────────────

function Ros2Tab() {
  const [status, setStatus]   = useState<Ros2Status | null>(null);
  const [topics, setTopics]   = useState<Ros2Topic[]>([]);
  const [nodes, setNodes]     = useState<string[]>([]);
  const [error, setError]     = useState<string | null>(null);

  const [topicFilter, setTopicFilter] = useState('');
  const [nodeFilter, setNodeFilter]   = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [sRes, tRes, nRes] = await Promise.all([
        api.get<Ros2Status>('/ros2/status'),
        api.get<Ros2Topic[]>('/ros2/topics'),
        api.get<string[]>('/ros2/nodes'),
      ]);

      setStatus(sRes.data);
      setTopics(tRes.data);
      setNodes(nRes.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ROS2 data');
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, 15_000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const filteredTopics = topics.filter(
    (t) => !topicFilter || t.name.toLowerCase().includes(topicFilter.toLowerCase())
  );
  const filteredNodes = nodes.filter(
    (n) => !nodeFilter || n.toLowerCase().includes(nodeFilter.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 12 }}>Error: {error}</div>
      )}

      {/* Connection status */}
      <div className="panel" style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          ROS Bridge Connection
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className={`status-dot${status?.connected ? ' status-dot-live' : ''}`}
            style={{ backgroundColor: status?.connected ? 'var(--success)' : 'var(--danger)' }}
          />
          <span style={{ fontSize: 13, fontWeight: 500,
            color: status?.connected ? 'var(--success)' : 'var(--danger)' }}>
            {status?.connected ? 'Connected' : status ? 'Disconnected' : 'Unknown'}
          </span>
          {status?.url && (
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {status.url}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Topics */}
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-default)',
            display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
              Topics
            </span>
            <span className="badge badge-accent">{filteredTopics.length}</span>
          </div>

          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-default)' }}>
            <input
              className="input"
              placeholder="Filter topics…"
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ overflowY: 'auto', maxHeight: 340 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  {['Name', 'Type'].map((h) => (
                    <th key={h} style={{ padding: '6px 12px', textAlign: 'left',
                      fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTopics.length === 0 ? (
                  <tr>
                    <td colSpan={2} style={{ padding: '16px 12px', textAlign: 'center',
                      color: 'var(--text-muted)', fontSize: 11 }}>
                      {topicFilter ? 'No matches.' : 'No topics.'}
                    </td>
                  </tr>
                ) : (
                  filteredTopics.map((t) => (
                    <tr key={t.name} style={{ borderBottom: '1px solid var(--border-default)' }}>
                      <td className="mono" style={{ padding: '6px 12px', fontSize: 11,
                        color: 'var(--accent)', maxWidth: 200, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.name}
                      </td>
                      <td className="mono" style={{ padding: '6px 12px', fontSize: 10,
                        color: 'var(--text-muted)' }}>
                        {t.type}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Nodes */}
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-default)',
            display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
              Nodes
            </span>
            <span className="badge badge-accent">{filteredNodes.length}</span>
          </div>

          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-default)' }}>
            <input
              className="input"
              placeholder="Filter nodes…"
              value={nodeFilter}
              onChange={(e) => setNodeFilter(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ overflowY: 'auto', maxHeight: 340, padding: '4px 0' }}>
            {filteredNodes.length === 0 ? (
              <div style={{ padding: '16px 14px', color: 'var(--text-muted)', fontSize: 11,
                textAlign: 'center' }}>
                {nodeFilter ? 'No matches.' : 'No nodes.'}
              </div>
            ) : (
              filteredNodes.map((n) => (
                <div
                  key={n}
                  className="mono"
                  style={{
                    padding: '5px 14px', fontSize: 11,
                    color: 'var(--text-secondary)',
                    borderBottom: '1px solid var(--border-default)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {n}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Isaac Tab ────────────────────────────────────────────────────────────────

function IsaacTab() {
  const [isaacStatus, setIsaacStatus] = useState<IsaacStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const { data } = await api.get<IsaacStatus>('/isaac/status');
      setIsaacStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Isaac status');
    }
  }, []);

  useEffect(() => {
    fetch_();
    const timer = setInterval(fetch_, 15_000);
    return () => clearInterval(timer);
  }, [fetch_]);

  const detailsParsed = isaacStatus ? parseJsonField(isaacStatus.details) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 12 }}>Error: {error}</div>
      )}

      {/* Status indicator */}
      <div className="panel" style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Isaac Sim Status
        </div>

        {isaacStatus === null ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              className={`status-dot${isaacStatus.running ? ' status-dot-live' : ''}`}
              style={{ backgroundColor: isaacStatus.running ? 'var(--success)' : 'var(--danger)' }}
            />
            <span style={{ fontSize: 15, fontWeight: 600,
              color: isaacStatus.running ? 'var(--success)' : 'var(--danger)' }}>
              {isaacStatus.running ? 'Running' : 'Not Running'}
            </span>
          </div>
        )}
      </div>

      {/* Details JSON viewer */}
      <div className="panel" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-default)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            Details
          </span>
        </div>
        <div style={{ padding: '12px 14px' }}>
          {detailsParsed === null ? (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No details available.</span>
          ) : (
            <pre
              className="mono"
              style={{
                margin: 0, padding: '10px 12px',
                background: 'var(--bg-surface-3)',
                border: '1px solid var(--border-default)',
                borderRadius: 4,
                fontSize: 12, color: 'var(--text-secondary)',
                overflowX: 'auto', overflowY: 'auto',
                maxHeight: 400,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}
            >
              {JSON.stringify(detailsParsed, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: 'containers', label: 'Containers' },
  { id: 'ros2',       label: 'ROS2' },
  { id: 'isaac',      label: 'Isaac' },
];

export default function InfraPage() {
  const [activeTab, setActiveTab] = useState<TabId>('containers');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%',
      overflowY: 'auto', padding: '16px 20px', gap: 14 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600,
          color: 'var(--text-primary)' }}>
          Infrastructure
        </h1>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          auto-refresh 15s
        </span>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border-default)',
        paddingBottom: 0 }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '7px 16px',
                fontSize: 12, fontWeight: 500,
                border: 'none',
                borderBottom: isActive
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
                background: 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'color 0.15s, border-color 0.15s',
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {activeTab === 'containers' && <ContainersTab />}
        {activeTab === 'ros2'       && <Ros2Tab />}
        {activeTab === 'isaac'      && <IsaacTab />}
      </div>
    </div>
  );
}
