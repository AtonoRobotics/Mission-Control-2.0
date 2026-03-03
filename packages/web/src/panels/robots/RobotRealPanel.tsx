/**
 * Robot Real Panel — real robot connection status + live joint states.
 */

import { useState } from 'react';
import { useRobotStore } from '@/stores/robotStore';
import { SectionHeader, StatusDot, EmptyState } from './shared';

export default function RobotRealPanel() {
  const { selectedRobotId, robots, joints } = useRobotStore();
  const robot = robots.find((r) => r.robot_id === selectedRobotId);

  const [jointStates] = useState<Record<string, number>>({});

  if (!robot) {
    return (
      <div style={{ padding: '16px 20px' }}>
        <EmptyState label="Select a robot from the Robot List panel to view real robot status." />
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionHeader title={`Real Robot — ${robot.name}`} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
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

        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>
            JOINT STATES
          </div>
          {joints.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              No joint data. Load robot specs in Config panel.
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
                      display: 'grid', gridTemplateColumns: '100px 1fr 60px', gap: 8, alignItems: 'center',
                    }}>
                      <span style={{
                        fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {j.joint_name}
                      </span>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-surface-3)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`,
                          background: 'var(--accent)', borderRadius: 3, transition: 'width 0.1s',
                        }} />
                      </div>
                      <span style={{
                        fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textAlign: 'right',
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
    </div>
  );
}
