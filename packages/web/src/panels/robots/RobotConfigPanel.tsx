/**
 * Robot Config Panel — robot specs viewer + create form + build actions.
 */

import { useState } from 'react';
import { useRobotStore } from '@/stores/robotStore';
import api from '@/services/api';
import {
  SectionHeader, ErrorMessage, Spinner, EmptyState, NullBadge, fmtDate,
} from './shared';

export default function RobotConfigPanel() {
  const {
    selectedRobotId, robots, joints, links, sensors, spheres,
    specsLoading, selectRobot, fetchRobots,
  } = useRobotStore();

  const robot = robots.find((r) => r.robot_id === selectedRobotId);
  const isCreate = !selectedRobotId;

  const [form, setForm] = useState({
    robot_id: '', name: '', manufacturer: '', model: '',
    dof: '', payload_kg: '', reach_mm: '', description: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
      <div style={{ padding: '16px 20px', height: '100%', overflowY: 'auto' }}>
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

  return (
    <div style={{ padding: '16px 20px', height: '100%', overflowY: 'auto' }}>
      {!robot && <EmptyState label="Select a robot from the Robot List panel." />}
      {robot && (
        <>
          <SectionHeader title={robot.name} right={
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {robot.robot_id}
            </span>
          } />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
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
                          color: 'var(--text-muted)', fontWeight: 500, fontSize: 10, whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {joints.map((j) => (
                      <tr key={j.joint_name} style={{ borderBottom: '1px solid var(--border-default)' }}>
                        <td style={{ padding: '6px 10px', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{j.joint_name}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{j.joint_type ?? '—'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{j.parent_link ?? '?'} → {j.child_link ?? '?'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{j.lower_limit != null ? j.lower_limit.toFixed(4) : <NullBadge />}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{j.upper_limit != null ? j.upper_limit.toFixed(4) : <NullBadge />}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{j.velocity_limit != null ? j.velocity_limit.toFixed(4) : <NullBadge />}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{j.effort_limit != null ? j.effort_limit.toFixed(1) : <NullBadge />}</td>
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
                        <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((l) => (
                      <tr key={l.link_name} style={{ borderBottom: '1px solid var(--border-default)' }}>
                        <td style={{ padding: '6px 10px', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{l.link_name}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{l.mass != null ? l.mass.toFixed(3) : <NullBadge />}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{l.inertia_ixx != null ? l.inertia_ixx.toExponential(2) : <NullBadge />}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{l.inertia_iyy != null ? l.inertia_iyy.toExponential(2) : <NullBadge />}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{l.inertia_izz != null ? l.inertia_izz.toExponential(2) : <NullBadge />}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.visual_mesh ?? '—'}</td>
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
                        <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: 10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensors.map((s) => (
                      <tr key={s.sensor_id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                        <td style={{ padding: '6px 10px', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{s.sensor_id}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{s.sensor_type ?? '—'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>{s.model ?? '—'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{s.mount_link ?? '—'}</td>
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
