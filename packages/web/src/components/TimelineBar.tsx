/**
 * TimelineBar — MCAP playback controls anchored to bottom of workspace.
 * Visible only when the active data source is MCAP.
 * Play/Pause, seek bar, speed selector, loop, keyboard shortcuts.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDataSource, usePlaybackControls } from '@/data-source/hooks';

const SPEED_OPTIONS = [0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0];

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const frac = Math.floor((ms % 1000) / 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${frac}`;
}

export default function TimelineBar() {
  const ds = useDataSource();
  const controls = usePlaybackControls();
  const seekBarRef = useRef<HTMLDivElement>(null!);
  const [isDragging, setIsDragging] = useState(false);

  // Only render for MCAP sources
  if (ds.type !== 'mcap' || !controls) return null;

  const { state } = controls;
  const duration = state.endTime - state.startTime;
  const progress = duration > 0 ? (state.currentTime - state.startTime) / duration : 0;

  return (
    <TimelineBarInner
      controls={controls}
      progress={progress}
      duration={duration}
      seekBarRef={seekBarRef}
      isDragging={isDragging}
      setIsDragging={setIsDragging}
    />
  );
}

/** Inner component so hooks are always called (no conditional returns before hooks) */
function TimelineBarInner({
  controls,
  progress,
  duration,
  seekBarRef,
  isDragging,
  setIsDragging,
}: {
  controls: NonNullable<ReturnType<typeof usePlaybackControls>>;
  progress: number;
  duration: number;
  seekBarRef: React.RefObject<HTMLDivElement>;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
}) {
  const { state } = controls;

  const seekToPosition = useCallback(
    (clientX: number) => {
      const bar = seekBarRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      controls.seek(state.startTime + ratio * duration);
    },
    [controls, state.startTime, duration, seekBarRef],
  );

  // Mouse drag for seek bar
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => seekToPosition(e.clientX);
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, seekToPosition, setIsDragging]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          state.isPlaying ? controls.pause() : controls.play();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          controls.seek(state.currentTime - 1000);
          break;
        case 'ArrowRight':
          e.preventDefault();
          controls.seek(state.currentTime + 1000);
          break;
        case 'Home':
          e.preventDefault();
          controls.seek(state.startTime);
          break;
        case 'End':
          e.preventDefault();
          controls.seek(state.endTime);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [controls, state]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 36,
        padding: '0 12px',
        background: 'var(--bg-surface-1)',
        borderTop: '1px solid var(--border-default, #222)',
        gap: 8,
        flexShrink: 0,
        fontSize: 11,
      }}
    >
      {/* Play/Pause */}
      <button
        onClick={() => (state.isPlaying ? controls.pause() : controls.play())}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--accent)',
          cursor: 'pointer',
          fontSize: 16,
          padding: '0 4px',
          lineHeight: 1,
        }}
        title={state.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
      >
        {state.isPlaying ? '⏸' : '▶'}
      </button>

      {/* Current time */}
      <span style={{ color: 'var(--text-secondary)', minWidth: 50, fontVariantNumeric: 'tabular-nums' }}>
        {formatTime(state.currentTime - state.startTime)}
      </span>

      {/* Seek bar */}
      <div
        ref={seekBarRef}
        style={{
          flex: 1,
          height: 6,
          background: 'var(--bg-surface-2)',
          borderRadius: 3,
          cursor: 'pointer',
          position: 'relative',
        }}
        onMouseDown={(e) => {
          setIsDragging(true);
          seekToPosition(e.clientX);
        }}
      >
        {/* Progress fill */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${progress * 100}%`,
            background: 'var(--accent)',
            borderRadius: 3,
            pointerEvents: 'none',
          }}
        />
        {/* Thumb */}
        <div
          style={{
            position: 'absolute',
            left: `${progress * 100}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: 'var(--accent)',
            border: '2px solid var(--bg-surface-1)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Duration */}
      <span style={{ color: 'var(--text-tertiary, #666)', minWidth: 50, fontVariantNumeric: 'tabular-nums' }}>
        {formatTime(duration)}
      </span>

      {/* Speed selector */}
      <select
        value={state.speed}
        onChange={(e) => controls.setSpeed(Number(e.target.value))}
        style={{
          background: 'var(--bg-surface-2)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle, #333)',
          borderRadius: 3,
          fontSize: 11,
          padding: '2px 4px',
          cursor: 'pointer',
        }}
      >
        {SPEED_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}x
          </option>
        ))}
      </select>

      {/* Loop toggle */}
      <button
        onClick={() => controls.setLoop(!state.loop)}
        style={{
          background: state.loop ? 'var(--accent-dim)' : 'none',
          border: `1px solid ${state.loop ? 'var(--accent)' : 'var(--border-subtle, #333)'}`,
          color: state.loop ? 'var(--accent)' : 'var(--text-tertiary, #666)',
          borderRadius: 3,
          fontSize: 11,
          padding: '2px 6px',
          cursor: 'pointer',
        }}
        title="Loop playback"
      >
        Loop
      </button>
    </div>
  );
}
