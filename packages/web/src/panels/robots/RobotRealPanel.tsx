/**
 * Robot Real Panel — stub driver connection, live joint states, joint command sliders.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRobotStore } from '@/stores/robotStore';
import { SectionHeader, StatusDot, EmptyState } from './shared';

interface DriverStatus {
  connected: boolean;
  mode: string;
  positions: number[];
  timestamp: number;
  ip: string;
}

const JOINT_LABELS = ['joint1', 'joint2', 'joint3', 'joint4', 'joint5', 'joint6'];

export default function RobotRealPanel() {
  const { selectedRobotId, robots, joints } = useRobotStore();
  const robot = robots.find((r) => r.robot_id === selectedRobotId);

  const [status, setStatus] = useState<DriverStatus | null>(null);
  const [sliderValues, setSliderValues] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [connecting, setConnecting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slidersInitialized = useRef(false);

  // Poll stub driver status
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch('/mc/api/stub-driver/status');
        if (res.ok && active) {
          const data: DriverStatus = await res.json();
          setStatus(data);
          // Sync sliders to actual positions on first connected poll
          if (data.connected && !slidersInitialized.current && data.positions.length === 6) {
            setSliderValues([...data.positions]);
            slidersInitialized.current = true;
          }
        }
      } catch { /* backend unreachable */ }
    };
    poll();
    const id = setInterval(poll, 500);
    return () => { active = false; clearInterval(id); };
  }, []);

  // Reset slider init flag on disconnect
  useEffect(() => {
    if (status && !status.connected) slidersInitialized.current = false;
  }, [status?.connected]);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      await fetch('/mc/api/stub-driver/connect', { method: 'POST' });
    } catch { /* ignore */ }
    setConnecting(false);
  }, []);

  const handleDisconnect = useCallback(async () => {
    try {
      await fetch('/mc/api/stub-driver/disconnect', { method: 'POST' });
    } catch { /* ignore */ }
    slidersInitialized.current = false;
  }, []);

  const sendCommand = useCallback(async (positions: number[]) => {
    try {
      await fetch('/mc/api/stub-driver/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions }),
      });
    } catch { /* ignore */ }
  }, []);

  const handleSlider = useCallback((index: number, value: number) => {
    setSliderValues((prev) => {
      const next = [...prev];
      next[index] = value;
      // Debounce command
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => sendCommand(next), 100);
      return next;
    });
  }, [sendCommand]);

  if (!robot) {
    return (
      <div style={{ padding: '16px 20px' }}>
        <EmptyState label="Select a robot from the Robot List panel to view real robot status." />
      </div>
    );
  }

  const connected = status?.connected ?? false;
  const mode = status?.mode ?? 'UNKNOWN';
  const positions = status?.positions ?? [0, 0, 0, 0, 0, 0];

  const connStatus = connected ? 'connected' : 'disconnected';
  const modeStatus = mode === 'READY' ? 'connected' : mode === 'MOVING' ? 'running' : 'disconnected';

  // Map joints from store for limits (filter to revolute only)
  const revoluteJoints = joints.filter((j) => j.joint_type !== 'fixed');

  return (
    <div style={{ padding: '16px 20px', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionHeader
        title={`Real Robot — ${robot.name}`}
        right={
          connected ? (
            <button onClick={handleDisconnect} style={btnStyle('var(--danger)')}>Disconnect</button>
          ) : (
            <button onClick={handleConnect} disabled={connecting} style={btnStyle('var(--accent)')}>
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          )
        }
      />

      {/* Connection status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>
            CONNECTION
          </div>
          <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
            <StatusRow status={connStatus} label="Stub driver" />
            <StatusRow status={connected ? 'connected' : 'disconnected'} label="rosbridge:9090" />
            <StatusRow status="disconnected" label="Safety enforcer" />
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
              Mode: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{mode}</span>
              {status?.ip && <span> · {status.ip}</span>}
            </div>
          </div>
        </div>

        {/* Live joint positions */}
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>
            JOINT POSITIONS
          </div>
          {!connected ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Connect to view live joint states.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {JOINT_LABELS.map((name, i) => {
                const joint = revoluteJoints.find((j) => j.joint_name === name);
                const value = positions[i] ?? 0;
                const min = joint?.lower_limit ?? -3.14;
                const max = joint?.upper_limit ?? 3.14;
                const range = max - min;
                const pct = range > 0 ? ((value - min) / range) * 100 : 50;

                return (
                  <div key={name} style={{
                    display: 'grid', gridTemplateColumns: '80px 1fr 55px', gap: 8, alignItems: 'center',
                  }}>
                    <span style={{
                      fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {name}
                    </span>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-surface-3)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`,
                        background: modeStatus === 'running' ? 'var(--warning)' : 'var(--accent)',
                        borderRadius: 3, transition: 'width 0.15s',
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

      {/* Joint command sliders */}
      {connected && (
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12, fontWeight: 600 }}>
            JOINT COMMAND
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {JOINT_LABELS.map((name, i) => {
              const joint = revoluteJoints.find((j) => j.joint_name === name);
              const min = joint?.lower_limit ?? -3.14;
              const max = joint?.upper_limit ?? 3.14;

              return (
                <div key={name} style={{
                  display: 'grid', gridTemplateColumns: '80px 1fr 55px', gap: 8, alignItems: 'center',
                }}>
                  <span style={{
                    fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
                  }}>
                    {name}
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={0.01}
                    value={sliderValues[i]}
                    onChange={(e) => handleSlider(i, parseFloat(e.target.value))}
                    style={{
                      width: '100%', height: 6, appearance: 'none', background: 'var(--bg-surface-3)',
                      borderRadius: 3, outline: 'none', cursor: 'pointer',
                    }}
                  />
                  <span style={{
                    fontSize: 10, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', textAlign: 'right',
                  }}>
                    {(sliderValues[i] * 180 / Math.PI).toFixed(1)}°
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusRow({ status, label }: { status: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <StatusDot status={status} />
      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{label}</span>
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: '4px 12px', fontSize: 11, fontWeight: 600, border: 'none',
    borderRadius: 4, background: bg, color: '#000', cursor: 'pointer',
  };
}
