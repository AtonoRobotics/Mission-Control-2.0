import { useState, useEffect } from 'react';
import { useRobotStore } from '@/stores/robotStore';
import api from '@/services/api';
import Viewport3D from '@/panels/Viewport3D/Viewport3D';
import RQTGraphPanel from '@/panels/RQTGraph/RQTGraphPanel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RobotsTabId = 'list' | 'config' | 'isaac' | 'real';

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

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

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

function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 12,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
      {right}
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

function TabBar({
  tabs, active, onSelect,
}: {
  tabs: { id: RobotsTabId; label: string }[];
  active: RobotsTabId;
  onSelect: (id: RobotsTabId) => void;
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

// ---------------------------------------------------------------------------
// Sub-tab 1: Robot List
// ---------------------------------------------------------------------------

function RobotListTab({ onNavigate }: { onNavigate: (tab: RobotsTabId) => void }) {
  const { robots, loading, error, selectedRobotId, fetchRobots, selectRobot } = useRobotStore();

  useEffect(() => { fetchRobots(); }, [fetchRobots]);

  const handleSelect = (robotId: string) => {
    selectRobot(robotId);
    onNavigate('config');
  };

  return (
    <div>
      <SectionHeader
        title="Robot Assets"
        right={
          <button
            className="btn-primary"
            style={{ fontSize: 11, padding: '5px 14px' }}
            onClick={() => { selectRobot(null); onNavigate('config'); }}
          >
            + New Robot
          </button>
        }
      />

      {error && <ErrorMessage msg={error} />}
      {loading && <Spinner />}
      {!loading && !error && robots.length === 0 && <EmptyState label="No robots registered." />}

      {!loading && robots.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}>
          {robots.map((r) => (
            <div
              key={r.robot_id}
              className="panel"
              onClick={() => handleSelect(r.robot_id)}
              style={{
                padding: '14px 16px',
                cursor: 'pointer',
                border: selectedRobotId === r.robot_id
                  ? '1px solid var(--accent)' : '1px solid var(--border-default)',
                transition: 'border-color 0.15s',
              }}
            >
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'flex-start',
                justifyContent: 'space-between', marginBottom: 6,
              }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                  {r.name}
                </span>
                <span className="badge badge-accent" style={{ marginLeft: 8, flexShrink: 0 }}>
                  {r.model || 'Robot'}
                </span>
              </div>

              {/* Manufacturer */}
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
                {r.manufacturer || 'Unknown manufacturer'}
              </div>

              {/* Stats */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
                borderTop: '1px solid var(--border-default)', paddingTop: 10,
              }}>
                {[
                  { label: 'DOF', value: r.dof ?? '—' },
                  { label: 'Reach', value: r.reach_mm ? `${r.reach_mm}mm` : '—' },
                  { label: 'Payload', value: r.payload_kg ? `${r.payload_kg}kg` : '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Pipeline badges */}
              <div style={{
                display: 'flex', gap: 6, marginTop: 10,
                borderTop: '1px solid var(--border-default)', paddingTop: 8,
              }}>
                <span style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: 3,
                  background: 'rgba(255, 170, 0, 0.12)', color: 'var(--accent)',
                  fontWeight: 600, letterSpacing: 0.5,
                }}>
                  ISAAC
                </span>
                <span style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: 3,
                  background: 'rgba(0, 200, 120, 0.12)', color: 'var(--success)',
                  fontWeight: 600, letterSpacing: 0.5,
                }}>
                  REAL
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
// Sub-tab 2: Robot Config
// ---------------------------------------------------------------------------

function RobotConfigTab() {
  const {
    selectedRobotId, robots, joints, links, sensors, spheres,
    specsLoading, selectRobot, fetchRobots,
  } = useRobotStore();

  const robot = robots.find((r) => r.robot_id === selectedRobotId);
  const isCreate = !selectedRobotId;

  // Form state for create mode
  const [form, setForm] = useState({
    robot_id: '', name: '', manufacturer: '', model: '',
    dof: '', payload_kg: '', reach_mm: '', description: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Build actions
  const [buildStatus, setBuildStatus] = useState<string | null>(null);

  const handleCreate = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        robot_id: form.robot_id,
        name: form.name,
        manufacturer: form.manufacturer || null,
        model: form.model || null,
        dof: form.dof ? parseInt(form.dof) : null,
        payload_kg: form.payload_kg ? parseFloat(form.payload_kg) : null,
        reach_mm: form.reach_mm ? parseFloat(form.reach_mm) : null,
        description: form.description || null,
      };
      const { data: created } = await api.post('/registry/robots', body);
      await fetchRobots();
      selectRobot(created.robot_id);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const triggerBuild = async (process: string) => {
    if (!selectedRobotId) return;
    setBuildStatus(`Starting ${process}…`);
    try {
      await api.post('/builds', { robot_id: selectedRobotId, process });
      setBuildStatus(`${process} build created`);
    } catch (e) {
      setBuildStatus(`Error: ${e instanceof Error ? e.message : 'Build failed'}`);
    }
  };

  if (isCreate) {
    return (
      <div>
        <SectionHeader title="Register New Robot" />
        <div className="panel" style={{ padding: 16, maxWidth: 520 }}>
          {saveError && <ErrorMessage msg={saveError} />}
          <div style={{ display: 'grid', gap: 12, marginTop: saveError ? 12 : 0 }}>
            {[
              { key: 'robot_id', label: 'Robot ID', placeholder: 'e.g. dobot_cr10' },
              { key: 'name', label: 'Name', placeholder: 'e.g. Dobot CR10' },
              { key: 'manufacturer', label: 'Manufacturer', placeholder: 'e.g. Dobot' },
              { key: 'model', label: 'Model', placeholder: 'e.g. CR10' },
              { key: 'dof', label: 'DOF', placeholder: '6' },
              { key: 'payload_kg', label: 'Payload (kg)', placeholder: '10' },
              { key: 'reach_mm', label: 'Reach (mm)', placeholder: '1525' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  {label}
                </label>
                <input
                  className="input"
                  style={{ width: '100%' }}
                  value={form[key as keyof typeof form]}
                  placeholder={placeholder}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Description
              </label>
              <textarea
                className="input"
                style={{ width: '100%', minHeight: 60, resize: 'vertical' }}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={saving || !form.robot_id || !form.name}
              style={{ justifySelf: 'start', padding: '6px 20px', fontSize: 12 }}
            >
              {saving ? 'Saving…' : 'Register Robot'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Edit / view mode
  return (
    <div>
      {!robot && <EmptyState label="Select a robot from the Robot List tab." />}
      {robot && (
        <>
          {/* Robot identity */}
          <SectionHeader title={robot.name} right={
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {robot.robot_id}
            </span>
          } />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* Info card */}
            <div className="panel" style={{ padding: 16 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
                ROBOT INFO
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                {[
                  ['Manufacturer', robot.manufacturer],
                  ['Model', robot.model],
                  ['DOF', robot.dof],
                  ['Payload', robot.payload_kg ? `${robot.payload_kg} kg` : null],
                  ['Reach', robot.reach_mm ? `${robot.reach_mm} mm` : null],
                  ['Created', fmtDate(robot.created_at)],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
                    <div style={{ color: value ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {value ?? '—'}
                    </div>
                  </div>
                ))}
              </div>
              {robot.description && (
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {robot.description}
                </div>
              )}
            </div>

            {/* Build actions */}
            <div className="panel" style={{ padding: 16 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12, fontWeight: 600 }}>
                BUILD ACTIONS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Build URDF', process: 'urdf_build' },
                  { label: 'Convert to USD', process: 'usd_conversion' },
                  { label: 'Generate cuRobo Config', process: 'curobo_config' },
                  { label: 'Generate Launch Files', process: 'launch_gen' },
                ].map(({ label, process }) => (
                  <button
                    key={process}
                    className="btn-secondary"
                    style={{ fontSize: 11, padding: '6px 14px', textAlign: 'left' }}
                    onClick={() => triggerBuild(process)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {buildStatus && (
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
                  {buildStatus}
                </div>
              )}
            </div>
          </div>

          {/* Specs tables */}
          {specsLoading && <Spinner />}

          {!specsLoading && joints.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <SectionHeader title="Joint Specs" right={
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{joints.length} joints</span>
              } />
              <div className="panel" style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                      {['Joint', 'Type', 'Parent → Child', 'Lower', 'Upper', 'Vel Limit', 'Effort'].map((h) => (
                        <th key={h} style={{
                          padding: '7px 10px', textAlign: 'left',
                          color: 'var(--text-muted)', fontWeight: 500, fontSize: 10,
                          whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {joints.map((j) => (
                      <tr key={j.joint_name} style={{ borderBottom: '1px solid var(--border-default)' }}>
                        <td style={{ padding: '6px 10px', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                          {j.joint_name}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>
                          {j.joint_type ?? '—'}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>
                          {j.parent_link ?? '?'} → {j.child_link ?? '?'}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {j.lower_limit != null ? j.lower_limit.toFixed(4) : <NullBadge />}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {j.upper_limit != null ? j.upper_limit.toFixed(4) : <NullBadge />}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {j.velocity_limit != null ? j.velocity_limit.toFixed(4) : <NullBadge />}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {j.effort_limit != null ? j.effort_limit.toFixed(1) : <NullBadge />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!specsLoading && links.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <SectionHeader title="Link Specs" right={
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{links.length} links</span>
              } />
              <div className="panel" style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                      {['Link', 'Mass (kg)', 'Ixx', 'Iyy', 'Izz', 'Visual Mesh'].map((h) => (
                        <th key={h} style={{
                          padding: '7px 10px', textAlign: 'left',
                          color: 'var(--text-muted)', fontWeight: 500, fontSize: 10,
                          whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((l) => (
                      <tr key={l.link_name} style={{ borderBottom: '1px solid var(--border-default)' }}>
                        <td style={{ padding: '6px 10px', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                          {l.link_name}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {l.mass != null ? l.mass.toFixed(3) : <NullBadge />}
                        </td>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                          {l.inertia_ixx != null ? l.inertia_ixx.toExponential(2) : <NullBadge />}
                        </td>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                          {l.inertia_iyy != null ? l.inertia_iyy.toExponential(2) : <NullBadge />}
                        </td>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                          {l.inertia_izz != null ? l.inertia_izz.toExponential(2) : <NullBadge />}
                        </td>
                        <td style={{
                          padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 10,
                          color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {l.visual_mesh ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!specsLoading && sensors.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <SectionHeader title="Sensors" right={
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sensors.length} sensors</span>
              } />
              <div className="panel" style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                      {['Sensor ID', 'Type', 'Model', 'Mount Link'].map((h) => (
                        <th key={h} style={{
                          padding: '7px 10px', textAlign: 'left',
                          color: 'var(--text-muted)', fontWeight: 500, fontSize: 10,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensors.map((s) => (
                      <tr key={s.sensor_id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                        <td style={{ padding: '6px 10px', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                          {s.sensor_id}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{s.sensor_type ?? '—'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>{s.model ?? '—'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                          {s.mount_link ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!specsLoading && spheres.length > 0 && (
            <div>
              <SectionHeader title="Collision Spheres" right={
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{spheres.length} spheres</span>
              } />
              <div className="panel" style={{ padding: 14 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {/* Group by link */}
                  {Object.entries(
                    spheres.reduce<Record<string, number>>((acc, s) => {
                      acc[s.link_name] = (acc[s.link_name] || 0) + 1;
                      return acc;
                    }, {})
                  ).map(([link, count]) => (
                    <span key={link} style={{
                      fontSize: 10, padding: '3px 10px', borderRadius: 3,
                      background: 'var(--bg-surface-2)', color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {link}: {count}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NullBadge() {
  return (
    <span style={{
      fontSize: 9, padding: '1px 6px', borderRadius: 3,
      background: 'rgba(255, 68, 68, 0.1)', color: 'var(--danger)',
      fontWeight: 600, letterSpacing: 0.3,
    }}>
      NULL
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sub-tab 3: Isaac Pipeline
// ---------------------------------------------------------------------------

function IsaacPipelineTab() {
  const { selectedRobotId, robots } = useRobotStore();
  const robot = robots.find((r) => r.robot_id === selectedRobotId);

  // Build history for this robot
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
    return <EmptyState label="Select a robot from the Robot List tab to view its Isaac pipeline." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {/* Top section: Sim Config + Training Runs */}
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

        {/* Training Runs */}
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
                api.post('/builds', { robot_id: selectedRobotId, process: 'isaac_training' });
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

      {/* Bottom section: Viewport + ROS Graph side by side */}
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
// Sub-tab 4: Real Robot
// ---------------------------------------------------------------------------

function RealRobotTab() {
  const { selectedRobotId, robots, joints } = useRobotStore();
  const robot = robots.find((r) => r.robot_id === selectedRobotId);

  // Simulated joint state (would come from roslib subscription in production)
  const [jointStates, setJointStates] = useState<Record<string, number>>({});

  if (!robot) {
    return <EmptyState label="Select a robot from the Robot List tab to view real robot status." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {/* Top section: Connection + Joint States */}
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
              No joint data. Load robot specs in Config tab.
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

      {/* Bottom section: Viewport + ROS Graph side by side */}
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
// Page
// ---------------------------------------------------------------------------

const TABS: { id: RobotsTabId; label: string }[] = [
  { id: 'list', label: 'Robot List' },
  { id: 'config', label: 'Robot Config' },
  { id: 'isaac', label: 'Isaac Pipeline' },
  { id: 'real', label: 'Real Robot' },
];

export default function RobotsPage() {
  const [activeTab, setActiveTab] = useState<RobotsTabId>('list');
  const selectedRobotId = useRobotStore((s) => s.selectedRobotId);

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
            Robots
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
          Robot asset management, simulation pipelines, and live monitoring
        </div>
      </div>

      <TabBar tabs={TABS} active={activeTab} onSelect={setActiveTab} />

      <div style={{ flex: 1, minHeight: 0 }}>
        {activeTab === 'list' && <RobotListTab onNavigate={setActiveTab} />}
        {activeTab === 'config' && <RobotConfigTab />}
        {activeTab === 'isaac' && <IsaacPipelineTab />}
        {activeTab === 'real' && <RealRobotTab />}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
