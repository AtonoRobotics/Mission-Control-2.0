/**
 * Robot List Panel — robot cards grid with selection.
 */

import { useEffect } from 'react';
import { useRobotStore } from '@/stores/robotStore';
import { SectionHeader, ErrorMessage, Spinner, EmptyState } from './shared';

export default function RobotListPanel() {
  const { robots, loading, error, selectedRobotId, fetchRobots, selectRobot } = useRobotStore();

  useEffect(() => { fetchRobots(); }, [fetchRobots]);

  return (
    <div style={{ padding: '16px 20px', height: '100%', overflowY: 'auto' }}>
      <SectionHeader
        title="Robot Assets"
        right={
          <button
            className="btn-primary"
            style={{ fontSize: 11, padding: '5px 14px' }}
            onClick={() => selectRobot(null)}
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
              onClick={() => selectRobot(r.robot_id)}
              style={{
                padding: '14px 16px',
                cursor: 'pointer',
                border: selectedRobotId === r.robot_id
                  ? '1px solid var(--accent)' : '1px solid var(--border-default)',
                transition: 'border-color 0.15s',
              }}
            >
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

              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
                {r.manufacturer || 'Unknown manufacturer'}
              </div>

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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
