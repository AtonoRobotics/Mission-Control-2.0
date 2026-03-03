import { useState, useEffect } from 'react';
import api from '@/services/api';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function gaugeColor(pct: number): string {
  if (pct > 85) return 'var(--danger)';
  if (pct > 60) return 'var(--accent)';
  return 'var(--success)';
}

function tempColor(temp: number): string {
  if (temp > 75) return 'var(--danger)';
  if (temp > 60) return 'var(--warning)';
  return 'var(--success)';
}

function pct(used: number | null, total: number | null): number {
  if (used == null || total == null || total === 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface GaugeRowProps {
  label: string;
  used: number | null;
  total: number | null;
  unitSuffix?: string;
  forcePct?: number;
}

function GaugeRow({ label, used, total, unitSuffix = '', forcePct }: GaugeRowProps) {
  const percentage = forcePct != null ? forcePct : pct(used, total);
  const hasData = used != null && total != null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {hasData
            ? `${(used as number).toFixed(1)} / ${(total as number).toFixed(0)}${unitSuffix}`
            : '—'}
        </span>
      </div>
      <div
        style={{
          height: 5,
          borderRadius: 3,
          background: 'var(--bg-surface-3)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            background: hasData ? gaugeColor(percentage) : 'var(--bg-surface-3)',
            borderRadius: 3,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}

function MachineCard({ m }: { m: Machine }) {
  const isOnline = m.status === 'online';
  const gpuPct = m.gpu_util_pct ?? 0;
  const hasMetrics = m.gpu_util_pct != null || m.ram_used_gb != null || m.disk_used_gb != null;

  return (
    <div
      className="panel"
      style={{
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        borderColor: isOnline ? 'var(--border-default)' : 'rgba(255,68,68,0.2)',
      }}
    >
      {/* ── Header: name + status dot ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className={`status-dot ${isOnline ? 'status-dot-live' : ''}`}
            style={{ background: isOnline ? 'var(--success)' : 'var(--danger)', flexShrink: 0 }}
          />
          <span
            className="mono"
            style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}
          >
            {m.name}
          </span>
        </div>
        <span
          className={isOnline ? 'badge badge-success' : 'badge badge-danger'}
          style={{ fontSize: 10 }}
        >
          {m.status}
        </span>
      </div>

      {/* ── OS + arch badges ── */}
      <div style={{ display: 'flex', gap: 6 }}>
        {m.os && (
          <span className="badge badge-accent">{m.os}</span>
        )}
        {m.arch && (
          <span className="badge" style={{ background: 'var(--bg-surface-3)', color: 'var(--text-secondary)' }}>
            {m.arch}
          </span>
        )}
        {!m.os && !m.arch && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
        )}
      </div>

      {/* ── GPU model name ── */}
      <div>
        <span
          style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          GPU
        </span>
        <p
          className="mono"
          style={{
            margin: '3px 0 0',
            fontSize: 11,
            color: m.gpu_model ? 'var(--text-secondary)' : 'var(--text-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {m.gpu_model ?? 'Unknown'}
        </p>
      </div>

      {hasMetrics ? (
        <>
          {/* ── GPU temp: large display ── */}
          {m.gpu_temp_c != null && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1,
                  color: tempColor(m.gpu_temp_c),
                }}
              >
                {m.gpu_temp_c}°
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>GPU temp</span>
            </div>
          )}

          {/* ── Gauges ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <GaugeRow
              label="GPU Util"
              used={gpuPct}
              total={100}
              unitSuffix="%"
              forcePct={gpuPct}
            />
            <GaugeRow
              label="RAM"
              used={m.ram_used_gb}
              total={m.ram_total_gb}
              unitSuffix=" GB"
            />
            <GaugeRow
              label="Disk"
              used={m.disk_used_gb}
              total={m.disk_total_gb}
              unitSuffix=" GB"
            />
          </div>
        </>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          No metrics available
        </p>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FleetPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function fetchFleet() {
    try {
      const { data } = await api.get('/fleet');
      setMachines(data.machines ?? []);
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError('Failed to load fleet data');
    }
  }

  useEffect(() => {
    fetchFleet();
    const id = setInterval(fetchFleet, 15_000);
    return () => clearInterval(id);
  }, []);

  const onlineCount = machines.filter((m) => m.status === 'online').length;

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
      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Fleet</span>
          {error ? null : (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {onlineCount} of {machines.length} reporting
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            className="btn-secondary"
            onClick={fetchFleet}
            style={{ padding: '4px 12px', fontSize: 11 }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ── Error state ── */}
      {error && (
        <div
          className="panel"
          style={{
            padding: '16px 20px',
            borderColor: 'rgba(255,68,68,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            className="status-dot"
            style={{ background: 'var(--danger)', flexShrink: 0 }}
          />
          <span style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</span>
        </div>
      )}

      {/* ── Empty state ── */}
      {!error && machines.length === 0 && (
        <div
          className="panel"
          style={{ padding: '32px 20px', textAlign: 'center' }}
        >
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No machines found. Check that the fleet agent is running.
          </span>
        </div>
      )}

      {/* ── Machine cards grid ── */}
      {!error && machines.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
            alignItems: 'start',
          }}
        >
          {machines.map((m) => (
            <MachineCard key={m.name} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}
