import { useState, useEffect } from 'react';
import { useRobotStore } from '@/stores/robotStore';
import Viewport3D from '@/panels/Viewport3D/Viewport3D';
import RQTGraphPanel from '@/panels/RQTGraph/RQTGraphPanel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MonitorTabId = 'isaac' | 'real';

interface Build {
  id: string;
  robot_id: string | null;
  process: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'promoted': case 'complete': case 'connected': return 'var(--success)';
    case 'validated': case 'running': case 'connecting': return 'var(--warning)';
    case 'draft': case 'pending': return 'var(--accent)';
    case 'failed': case 'disconnected': return 'var(--danger)';
    default: return 'var(--text-muted)';
  }
}

function buildStatusBadge(status: string): string {
  switch (status) {
    case 'complete': return 'badge badge-success';
    case 'running': return 'badge badge-warning';
    case 'pending': return 'badge badge-info';
    case 'failed': return 'badge badge-danger';
    default: return 'badge';
  }
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

function StatusDot({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      backgroundColor: statusColor(status), marginRight: 6, flexShrink: 0,
    }} />
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
// Isaac Pipeline Panel
// ---------------------------------------------------------------------------

function IsaacPipelinePanel() {
  const { selectedRobotId, robots } = useRobotStore();
  const robot = robots.find((r) => r.robot_id === selectedRobotId);

  const [builds, setBuilds] = useState<Build[]>([]);
  const [buildsLoading, setBuildsLoading] = useState(false);

  useEffect(() => {
    if (!selectedRobotId) return;
    setBuildsLoading(true);
    fetch(`/mc/api/builds?robot_id=${selectedRobotId}&limit=10`)
      .then((r) => r.ok ? r.json() : { builds: [] })
      .then((data) => setBuilds(data.builds ?? []))
      .finally(() => setBuildsLoading(false));
  }, [selectedRobotId]);

  if (!robot) {
    return <EmptyState label="Select a robot from the Robots page to view its Isaac pipeline." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Sim Config */}
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>
            SIMULATION CONFIG
          </div>
          <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Robot:</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{robot.name}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Isaac Sim:</span>
              <StatusDot status="disconnected" />
              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Not running</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Isaac ROS:</span>
              <StatusDot status="disconnected" />
              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Not running</span>
            </div>
          </div>
        </div>

        {/* Build History */}
        <div className="panel" style={{ padding: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
              BUILD HISTORY
            </span>
            <button
              className="btn-secondary"
              style={{ fontSize: 10, padding: '3px 10px' }}
              onClick={() => {
                fetch('/mc/api/builds', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ robot_id: selectedRobotId, process: 'isaac_training' }),
                });
              }}
            >
              + New Run
            </button>
          </div>
          {buildsLoading && <Spinner />}
          {!buildsLoading && builds.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>
              No builds yet.
            </div>
          )}
          {builds.map((b) => (
            <div key={b.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '5px 0',
              borderBottom: '1px solid var(--border-default)',
              fontSize: 11,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={buildStatusBadge(b.status)}>{b.status}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{b.process}</span>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{fmtDate(b.created_at)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
        flex: 1, minHeight: 350,
      }}>
        <div className="panel" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            padding: '8px 12px', fontSize: 10, fontWeight: 600,
            color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)',
          }}>
            3D VIEWPORT — Isaac Sim
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <Viewport3D />
          </div>
        </div>
        <div className="panel" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            padding: '8px 12px', fontSize: 10, fontWeight: 600,
            color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)',
          }}>
            ROS GRAPH — Isaac Sim Topics
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <RQTGraphPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Real Robot Panel
// ---------------------------------------------------------------------------

function RealRobotPanel() {
  const { selectedRobotId, robots, joints } = useRobotStore();
  const robot = robots.find((r) => r.robot_id === selectedRobotId);

  const [jointStates] = useState<Record<string, number>>({});

  if (!robot) {
    return <EmptyState label="Select a robot from the Robots page to view real robot status." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
        {/* Connection status */}
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>
            CONNECTION
          </div>
          <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Robot:</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{robot.name}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusDot status="disconnected" />
              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>rosbridge:9090</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusDot status="disconnected" />
              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Robot driver</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusDot status="disconnected" />
              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Safety enforcer</span>
            </div>
          </div>
        </div>

        {/* Joint States */}
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>
            JOINT STATES
          </div>
          {joints.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              No joint data. Configure robot in Robots page first.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {joints
                .filter((j) => j.joint_type !== 'fixed')
                .map((j) => {
                  const value = jointStates[j.joint_name] ?? 0;
                  const min = j.lower_limit ?? -3.14;
                  const max = j.upper_limit ?? 3.14;
                  const range = max - min;
                  const pct = range > 0 ? ((value - min) / range) * 100 : 50;

                  return (
                    <div key={j.joint_name} style={{
                      display: 'grid', gridTemplateColumns: '100px 1fr 60px', gap: 8,
                      alignItems: 'center',
                    }}>
                      <span style={{
                        fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {j.joint_name}
                      </span>
                      <div style={{
                        height: 6, borderRadius: 3, background: 'var(--bg-surface-3)',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`,
                          background: 'var(--accent)', borderRadius: 3,
                          transition: 'width 0.1s',
                        }} />
                      </div>
                      <span style={{
                        fontSize: 10, color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)', textAlign: 'right',
                      }}>
                        {(value * 180 / Math.PI).toFixed(1)}°
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
        flex: 1, minHeight: 350,
      }}>
        <div className="panel" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            padding: '8px 12px', fontSize: 10, fontWeight: 600,
            color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)',
          }}>
            3D VIEWPORT — Real Robot
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <Viewport3D />
          </div>
        </div>
        <div className="panel" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            padding: '8px 12px', fontSize: 10, fontWeight: 600,
            color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)',
          }}>
            ROS GRAPH — Real Robot Topics
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <RQTGraphPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monitor Page
// ---------------------------------------------------------------------------

const TABS: { id: MonitorTabId; label: string }[] = [
  { id: 'isaac', label: 'Isaac Pipeline' },
  { id: 'real', label: 'Real Robot' },
];

export default function MonitorPage() {
  const [activeTab, setActiveTab] = useState<MonitorTabId>('isaac');
  const { selectedRobotId, fetchRobots } = useRobotStore();

  useEffect(() => { fetchRobots(); }, [fetchRobots]);

  return (
    <div style={{
      padding: '20px 24px',
      height: '100%',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-base)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{
            margin: 0, fontSize: 16, fontWeight: 600,
            color: 'var(--text-primary)', letterSpacing: 0.3,
          }}>
            Monitor
          </h1>
          {selectedRobotId && (
            <span style={{
              fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)',
              padding: '2px 10px', borderRadius: 3,
              background: 'rgba(255, 170, 0, 0.1)',
            }}>
              {selectedRobotId}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          Simulation pipelines and live robot monitoring
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 2, borderBottom: '1px solid var(--border-default)',
        paddingBottom: 0, marginBottom: 16,
      }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: activeTab === t.id ? 600 : 400,
              padding: '8px 16px',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'isaac' && <IsaacPipelinePanel />}
        {activeTab === 'real' && <RealRobotPanel />}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
