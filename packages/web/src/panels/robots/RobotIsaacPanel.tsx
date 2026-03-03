/**
 * Robot Isaac Panel — simulation config + build history.
 */

import { useState, useEffect } from 'react';
import { useRobotStore } from '@/stores/robotStore';
import { SectionHeader, StatusDot, Spinner, EmptyState, fmtDate, buildStatusBadge } from './shared';

interface Build {
  id: string;
  robot_id: string | null;
  process: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  created_at: string;
}

export default function RobotIsaacPanel() {
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
    return (
      <div style={{ padding: '16px 20px' }}>
        <EmptyState label="Select a robot from the Robot List panel to view its Isaac pipeline." />
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionHeader title={`Isaac Pipeline — ${robot.name}`} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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

        <div className="panel" style={{ padding: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>BUILD HISTORY</span>
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
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>No builds yet.</div>
          )}
          {builds.map((b) => (
            <div key={b.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '5px 0', borderBottom: '1px solid var(--border-default)', fontSize: 11,
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
