/**
 * Teleop Panel — Virtual joystick + keyboard control for robot teleoperation.
 * Publishes geometry_msgs/Twist at 10Hz while active.
 * Dead-man switch: zero velocity on key/joystick release.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Topic } from 'roslib';
import { getRos } from '@/ros/connection';

interface TwistMessage {
  linear: { x: number; y: number; z: number };
  angular: { x: number; y: number; z: number };
}

const JOYSTICK_OUTER_R = 120;
const JOYSTICK_KNOB_R = 30;
const PUBLISH_RATE_MS = 100; // 10Hz

export default function TeleopPanel(props: any) {
  const { config = {}, onConfigChange = () => {} } = props;
  const topicName = (config.topic as string) || '/cmd_vel';
  const maxLinearVel = (config.maxLinearVel as number) ?? 0.5;
  const maxAngularVel = (config.maxAngularVel as number) ?? 1.0;
  const [showSettings, setShowSettings] = useState(false);

  // Current velocity command (from either joystick or keyboard)
  const linearRef = useRef(0);
  const angularRef = useRef(0);
  const activeRef = useRef(false);
  const publisherRef = useRef<Topic<TwistMessage> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keysRef = useRef(new Set<string>());

  // Joystick state for rendering
  const [knobX, setKnobX] = useState(0);
  const [knobY, setKnobY] = useState(0);
  const draggingRef = useRef(false);
  const joystickCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Create/update publisher when topic changes
  useEffect(() => {
    const ros = getRos();
    const topic = new Topic<TwistMessage>({
      ros,
      name: topicName,
      messageType: 'geometry_msgs/msg/Twist',
    });
    publisherRef.current = topic;

    return () => {
      // Publish zero before cleanup
      topic.publish({
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      });
    };
  }, [topicName]);

  // Publish loop: 10Hz while active
  const startPublishing = useCallback(() => {
    if (intervalRef.current) return;
    activeRef.current = true;
    intervalRef.current = setInterval(() => {
      if (!publisherRef.current) return;
      publisherRef.current.publish({
        linear: { x: linearRef.current, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: angularRef.current },
      });
    }, PUBLISH_RATE_MS);
  }, []);

  const stopPublishing = useCallback(() => {
    activeRef.current = false;
    linearRef.current = 0;
    angularRef.current = 0;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // Send zero velocity (dead-man switch)
    if (publisherRef.current) {
      publisherRef.current.publish({
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Update velocity from keyboard state
  const updateFromKeys = useCallback(() => {
    const keys = keysRef.current;
    let lin = 0;
    let ang = 0;

    if (keys.has('w') || keys.has('arrowup')) lin += 1;
    if (keys.has('s') || keys.has('arrowdown')) lin -= 1;
    if (keys.has('a') || keys.has('arrowleft')) ang += 1;
    if (keys.has('d') || keys.has('arrowright')) ang -= 1;

    linearRef.current = lin * maxLinearVel;
    angularRef.current = ang * maxAngularVel;

    if (lin !== 0 || ang !== 0) {
      startPublishing();
    } else if (!draggingRef.current) {
      stopPublishing();
    }
  }, [maxLinearVel, maxAngularVel, startPublishing, stopPublishing]);

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();
        keysRef.current.add(key);
        updateFromKeys();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysRef.current.delete(key);
      updateFromKeys();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [updateFromKeys]);

  // Joystick pointer handlers
  const handleJoystickPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.preventDefault();
      (e.target as SVGSVGElement).setPointerCapture?.(e.pointerId);
      draggingRef.current = true;
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      joystickCenterRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      updateJoystickFromPointer(e.clientX, e.clientY);
      startPublishing();
    },
    [startPublishing],
  );

  const updateJoystickFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const center = joystickCenterRef.current;
      let dx = clientX - center.x;
      let dy = clientY - center.y;

      // Clamp to outer circle
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = JOYSTICK_OUTER_R - JOYSTICK_KNOB_R;
      if (dist > maxDist) {
        dx = (dx / dist) * maxDist;
        dy = (dy / dist) * maxDist;
      }

      // Normalize to -1..1
      const normX = dx / maxDist; // left/right -> angular.z (inverted: left = positive)
      const normY = -dy / maxDist; // up/down -> linear.x (up = positive)

      setKnobX(dx);
      setKnobY(dy);
      linearRef.current = normY * maxLinearVel;
      angularRef.current = -normX * maxAngularVel;
    },
    [maxLinearVel, maxAngularVel],
  );

  const handleJoystickPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      updateJoystickFromPointer(e.clientX, e.clientY);
    },
    [updateJoystickFromPointer],
  );

  const handleJoystickPointerUp = useCallback(() => {
    draggingRef.current = false;
    setKnobX(0);
    setKnobY(0);
    if (keysRef.current.size === 0) {
      stopPublishing();
    }
  }, [stopPublishing]);

  // Style helpers
  const inputStyle = {
    background: 'var(--bg-surface-2)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle, #333)',
    borderRadius: 3,
    fontSize: 11,
    padding: '3px 6px',
    width: '100%',
  };

  const labelStyle = {
    fontSize: 11,
    color: 'var(--text-secondary)',
    marginBottom: 2,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          borderBottom: '1px solid var(--border-subtle, #333)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            color: 'var(--text-tertiary, #666)',
            flex: 1,
          }}
        >
          {topicName}
        </span>

        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            color: activeRef.current ? 'var(--accent)' : 'var(--text-tertiary, #666)',
          }}
        >
          lin: {linearRef.current.toFixed(2)} ang: {angularRef.current.toFixed(2)}
        </span>

        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            background: showSettings ? 'var(--accent)' : 'var(--bg-surface-2)',
            border: '1px solid var(--border-subtle, #333)',
            color: showSettings ? 'var(--bg-base, #0a0a0a)' : 'var(--text-secondary)',
            borderRadius: 3,
            fontSize: 11,
            padding: '3px 8px',
            cursor: 'pointer',
          }}
        >
          Settings
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid var(--border-subtle, #333)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <div>
            <div style={labelStyle}>Topic</div>
            <input
              type="text"
              value={topicName}
              onChange={(e) => onConfigChange({ ...config, topic: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>
              Max Linear Velocity: {maxLinearVel.toFixed(2)} m/s
            </div>
            <input
              type="range"
              min="0.1"
              max="2.0"
              step="0.1"
              value={maxLinearVel}
              onChange={(e) => onConfigChange({ ...config, maxLinearVel: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
          </div>
          <div>
            <div style={labelStyle}>
              Max Angular Velocity: {maxAngularVel.toFixed(2)} rad/s
            </div>
            <input
              type="range"
              min="0.1"
              max="3.0"
              step="0.1"
              value={maxAngularVel}
              onChange={(e) => onConfigChange({ ...config, maxAngularVel: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
          </div>
        </div>
      )}

      {/* Joystick area */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          background: 'var(--bg-base, #0a0a0a)',
          userSelect: 'none',
        }}
      >
        <svg
          width={JOYSTICK_OUTER_R * 2 + 20}
          height={JOYSTICK_OUTER_R * 2 + 20}
          viewBox={`${-JOYSTICK_OUTER_R - 10} ${-JOYSTICK_OUTER_R - 10} ${JOYSTICK_OUTER_R * 2 + 20} ${JOYSTICK_OUTER_R * 2 + 20}`}
          onPointerDown={handleJoystickPointerDown}
          onPointerMove={handleJoystickPointerMove}
          onPointerUp={handleJoystickPointerUp}
          onPointerCancel={handleJoystickPointerUp}
          style={{ touchAction: 'none', cursor: 'pointer' }}
        >
          {/* Outer circle */}
          <circle
            cx={0}
            cy={0}
            r={JOYSTICK_OUTER_R}
            fill="none"
            stroke="var(--border-subtle, #333)"
            strokeWidth={2}
          />

          {/* Cross guides */}
          <line
            x1={0}
            y1={-JOYSTICK_OUTER_R + 10}
            x2={0}
            y2={JOYSTICK_OUTER_R - 10}
            stroke="var(--border-subtle, #333)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <line
            x1={-JOYSTICK_OUTER_R + 10}
            y1={0}
            x2={JOYSTICK_OUTER_R - 10}
            y2={0}
            stroke="var(--border-subtle, #333)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />

          {/* Direction labels */}
          <text x={0} y={-JOYSTICK_OUTER_R - 2} textAnchor="middle" fill="var(--text-tertiary, #666)" fontSize={10}>
            W
          </text>
          <text x={0} y={JOYSTICK_OUTER_R + 10} textAnchor="middle" fill="var(--text-tertiary, #666)" fontSize={10}>
            S
          </text>
          <text x={-JOYSTICK_OUTER_R - 4} y={4} textAnchor="end" fill="var(--text-tertiary, #666)" fontSize={10}>
            A
          </text>
          <text x={JOYSTICK_OUTER_R + 4} y={4} textAnchor="start" fill="var(--text-tertiary, #666)" fontSize={10}>
            D
          </text>

          {/* Knob */}
          <circle
            cx={knobX}
            cy={knobY}
            r={JOYSTICK_KNOB_R}
            fill={draggingRef.current || keysRef.current.size > 0 ? 'var(--accent)' : 'rgba(255, 170, 0, 0.3)'}
            stroke="var(--accent)"
            strokeWidth={2}
            style={{ transition: draggingRef.current ? 'none' : 'cx 0.15s, cy 0.15s' }}
          />
        </svg>

        {/* Keyboard hint */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            alignItems: 'center',
            color: 'var(--text-tertiary, #666)',
            fontSize: 11,
          }}
        >
          <span>Keyboard:</span>
          {['W', 'A', 'S', 'D'].map((k) => (
            <span
              key={k}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                border: '1px solid var(--border-subtle, #333)',
                borderRadius: 3,
                fontSize: 10,
                fontFamily: 'monospace',
                color: keysRef.current.has(k.toLowerCase())
                  ? 'var(--accent)'
                  : 'var(--text-tertiary, #666)',
                background: keysRef.current.has(k.toLowerCase())
                  ? 'rgba(255, 170, 0, 0.1)'
                  : 'transparent',
              }}
            >
              {k}
            </span>
          ))}
          <span style={{ marginLeft: 4 }}>or Arrow keys</span>
        </div>
      </div>
    </div>
  );
}
