import { useState, useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Machine {
  name: string;
  status: string;
  gpu_util_pct: number | null;
  gpu_temp_c: number | null;
  ram_used_gb: number | null;
  ram_total_gb: number | null;
  disk_used_gb: number | null;
  disk_total_gb: number | null;
  gpu_model: string | null;
  os: string | null;
  arch: string | null;
}

interface AgentTask {
  id: string;
  title: string;
  status: string;
  agent_name: string;
  model: string;
  created_at: string;
}

interface Summary {
  machines_online: number;
  machines_total: number;
  models_loaded: number;
  active_tasks: number;
  open_incidents: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function gaugeColor(pct: number): string {
  if (pct > 85) return 'var(--danger)';
  if (pct > 60) return 'var(--accent)';
  return 'var(--success)';
}

function taskBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'running':
    case 'in_progress': return 'badge badge-info';
    case 'completed':
    case 'done':        return 'badge badge-success';
    case 'failed':
    case 'error':       return 'badge badge-danger';
    case 'pending':     return 'badge badge-warning';
    default:            return 'badge badge-accent';
  }
}

function relativeTime(iso: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return '—';
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div
      className="panel"
      style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      <span
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono)',
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {sub}
        </span>
      )}
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</span>
    </div>
  );
}

function GaugeBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div
      style={{
        height: 4,
        borderRadius: 2,
        background: 'var(--bg-surface-3)',
        overflow: 'hidden',
        flex: 1,
        minWidth: 60,
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: '100%',
          background: gaugeColor(clamped),
          borderRadius: 2,
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  );
}

function MachineRow({ m }: { m: Machine }) {
  const isOnline = m.status === 'online';
  const gpuPct = m.gpu_util_pct ?? 0;
  const ramPct = m.ram_total_gb ? Math.round(((m.ram_used_gb ?? 0) / m.ram_total_gb) * 100) : 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 0',
        borderBottom: '1px solid var(--border-default)',
      }}
    >
      {/* Status dot */}
      <span
        className={`status-dot ${isOnline ? 'status-dot-live' : ''}`}
        style={{ background: isOnline ? 'var(--success)' : 'var(--text-muted)', flexShrink: 0 }}
      />

      {/* Name */}
      <span
        className="mono"
        style={{ fontSize: 12, color: 'var(--text-primary)', width: 130, flexShrink: 0 }}
      >
        {m.name}
      </span>

      {/* GPU util */}
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 46, flexShrink: 0 }}>
        {m.gpu_util_pct != null ? `${m.gpu_util_pct}%` : '—'}
      </span>

      {/* GPU gauge */}
      <GaugeBar pct={gpuPct} />

      {/* GPU temp */}
      <span
        style={{
          fontSize: 11,
          color:
            m.gpu_temp_c != null && m.gpu_temp_c > 75
              ? 'var(--danger)'
              : m.gpu_temp_c != null && m.gpu_temp_c > 60
              ? 'var(--warning)'
              : 'var(--text-secondary)',
          width: 46,
          flexShrink: 0,
          textAlign: 'right',
        }}
      >
        {m.gpu_temp_c != null ? `${m.gpu_temp_c}°C` : '—'}
      </span>

      {/* RAM label */}
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 70, flexShrink: 0 }}>
        {m.ram_used_gb != null && m.ram_total_gb != null
          ? `${m.ram_used_gb.toFixed(1)}/${m.ram_total_gb}GB`
          : '—'}
      </span>

      {/* RAM gauge */}
      <GaugeBar pct={ramPct} />
    </div>
  );
}

function TaskRow({ t }: { t: AgentTask }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 0',
        borderBottom: '1px solid var(--border-default)',
      }}
    >
      {/* Title */}
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {t.title}
      </span>

      {/* Status badge */}
      <span className={taskBadgeClass(t.status)} style={{ flexShrink: 0 }}>
        {t.status}
      </span>

      {/* Agent */}
      <span
        style={{
          fontSize: 11,
          color: 'var(--text-secondary)',
          width: 80,
          flexShrink: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {t.agent_name}
      </span>

      {/* Time */}
      <span
        className="mono"
        style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, width: 52, textAlign: 'right' }}
      >
        {relativeTime(t.created_at)}
      </span>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel" style={{ padding: '16px 20px' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <span style={{ fontSize: 12, color: 'var(--danger)' }}>{msg}</span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);

  const [summaryErr, setSummaryErr] = useState<string | null>(null);
  const [fleetErr, setFleetErr] = useState<string | null>(null);
  const [tasksErr, setTasksErr] = useState<string | null>(null);

  async function fetchAll() {
    // Summary
    try {
      const res = await fetch('/api/summary');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSummary(data);
      setSummaryErr(null);
    } catch {
      setSummaryErr('Failed to load summary');
    }

    // Fleet
    try {
      const res = await fetch('/api/fleet');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMachines(data.machines ?? []);
      setFleetErr(null);
    } catch {
      setFleetErr('Failed to load fleet');
    }

    // Tasks
    try {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTasks(data.tasks ?? []);
      setTasksErr(null);
    } catch {
      setTasksErr('Failed to load tasks');
    }
  }

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 10_000);
    return () => clearInterval(id);
  }, []);

  const recentTasks = [...tasks]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <div
      style={{
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        overflowY: 'auto',
        height: '100%',
        background: 'var(--bg-base)',
      }}
    >
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Overview</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>system health at a glance</span>
      </div>

      {/* ── Metrics row ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        {summaryErr ? (
          <div className="panel" style={{ padding: '18px 20px', gridColumn: '1 / -1' }}>
            <ErrorMsg msg={summaryErr} />
          </div>
        ) : (
          <>
            <StatCard
              label="Machines Online"
              value={summary ? `${summary.machines_online}/${summary.machines_total}` : '—'}
            />
            <StatCard
              label="Models Loaded"
              value={summary?.models_loaded ?? '—'}
            />
            <StatCard
              label="Active Tasks"
              value={summary?.active_tasks ?? '—'}
            />
            <StatCard
              label="Open Incidents"
              value={summary?.open_incidents ?? '—'}
              sub={
                summary && summary.open_incidents > 0
                  ? `${summary.open_incidents} need attention`
                  : undefined
              }
            />
          </>
        )}
      </div>

      {/* ── Bottom two-column layout ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* Fleet Health */}
        <SectionCard title="Fleet Health">
          {fleetErr ? (
            <ErrorMsg msg={fleetErr} />
          ) : machines.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No machines reporting.</span>
          ) : (
            <>
              {/* Column headers */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  paddingBottom: 6,
                  borderBottom: '1px solid var(--border-default)',
                  marginBottom: 2,
                }}
              >
                <span style={{ width: 8, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 130, flexShrink: 0 }}>
                  MACHINE
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 46, flexShrink: 0 }}>
                  GPU%
                </span>
                <span style={{ flex: 1, fontSize: 10, color: 'var(--text-muted)' }}>UTIL</span>
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    width: 46,
                    flexShrink: 0,
                    textAlign: 'right',
                  }}
                >
                  TEMP
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 70, flexShrink: 0 }}>
                  RAM
                </span>
                <span style={{ flex: 1, fontSize: 10, color: 'var(--text-muted)' }}>RAM%</span>
              </div>
              {machines.map((m) => (
                <MachineRow key={m.name} m={m} />
              ))}
            </>
          )}
        </SectionCard>

        {/* Recent Tasks */}
        <SectionCard title="Recent Tasks">
          {tasksErr ? (
            <ErrorMsg msg={tasksErr} />
          ) : recentTasks.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No tasks found.</span>
          ) : (
            <>
              {/* Column headers */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  paddingBottom: 6,
                  borderBottom: '1px solid var(--border-default)',
                  marginBottom: 2,
                }}
              >
                <span style={{ flex: 1, fontSize: 10, color: 'var(--text-muted)' }}>TASK</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 64, flexShrink: 0 }}>
                  STATUS
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 80, flexShrink: 0 }}>
                  AGENT
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    width: 52,
                    flexShrink: 0,
                    textAlign: 'right',
                  }}
                >
                  TIME
                </span>
              </div>
              {recentTasks.map((t) => (
                <TaskRow key={t.id} t={t} />
              ))}
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
