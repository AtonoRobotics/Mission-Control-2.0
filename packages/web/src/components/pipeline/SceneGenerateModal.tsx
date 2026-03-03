import { useState, useEffect } from 'react';
import { useSceneStore } from '@/stores/sceneStore';
import api from '@/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RobotOption {
  robot_id: string;
  name: string;
}

interface SceneGenerateModalProps {
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TASK_TYPES = [
  { value: 'manipulation', label: 'Manipulation' },
  { value: 'navigation', label: 'Navigation' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'data_collection', label: 'Data Collection' },
];

const ENV_STYLES = [
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'grid', label: 'Grid' },
  { value: 'room', label: 'Room' },
  { value: 'outdoor', label: 'Outdoor' },
];

// ---------------------------------------------------------------------------
// Shared inline styles
// ---------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  fontSize: 12,
  color: 'var(--text-primary)',
  background: 'var(--bg-base, #0a0a0a)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  outline: 'none',
  fontFamily: 'inherit',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SceneGenerateModal({ open, onClose }: SceneGenerateModalProps) {
  const [prompt, setPrompt] = useState('');
  const [taskType, setTaskType] = useState('manipulation');
  const [robotId, setRobotId] = useState('');
  const [envStyle, setEnvStyle] = useState('grid');
  const [robots, setRobots] = useState<RobotOption[]>([]);
  const [robotsLoading, setRobotsLoading] = useState(false);

  const generating = useSceneStore((s) => s.generating);
  const generateError = useSceneStore((s) => s.generateError);
  const generateScene = useSceneStore((s) => s.generateScene);

  // Fetch robots on mount
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRobotsLoading(true);
    api.get<RobotOption[]>('/registry/robots')
      .then(({ data }) => data)
      .then((data: RobotOption[]) => {
        if (cancelled) return;
        setRobots(Array.isArray(data) ? data : []);
        if (data.length > 0 && !robotId) {
          setRobotId(data[0].robot_id);
        }
      })
      .catch(() => {
        if (!cancelled) setRobots([]);
      })
      .finally(() => {
        if (!cancelled) setRobotsLoading(false);
      });
    return () => { cancelled = true; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setPrompt('');
      setTaskType('manipulation');
      setEnvStyle('grid');
    }
  }, [open]);

  const handleGenerate = async () => {
    if (!robotId || !prompt.trim()) return;
    await generateScene(prompt.trim(), taskType, robotId);
    // Close on success (no error set)
    const err = useSceneStore.getState().generateError;
    if (!err) {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg, 10px)',
          width: '90%',
          maxWidth: 520,
          maxHeight: '85vh',
          overflow: 'auto',
          padding: '20px 24px',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              AI Scene Generation
            </h2>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Describe the scene you want to create
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 16,
              padding: '4px 8px',
            }}
          >
            x
          </button>
        </div>

        {/* Prompt */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. A tabletop pick-and-place task with 3 objects on a table..."
            rows={4}
            style={{
              ...inputStyle,
              resize: 'vertical',
              minHeight: 80,
            }}
          />
        </div>

        {/* Task Type */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Task Type</label>
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
            style={inputStyle}
          >
            {TASK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Robot */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Robot</label>
          {robotsLoading ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>
              Loading robots...
            </div>
          ) : robots.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>
              No robots in registry
            </div>
          ) : (
            <select
              value={robotId}
              onChange={(e) => setRobotId(e.target.value)}
              style={inputStyle}
            >
              {robots.map((r) => (
                <option key={r.robot_id} value={r.robot_id}>{r.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Environment Style */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Environment Style</label>
          <select
            value={envStyle}
            onChange={(e) => setEnvStyle(e.target.value)}
            style={inputStyle}
          >
            {ENV_STYLES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Error display */}
        {generateError && (
          <div style={{
            padding: '8px 12px',
            marginBottom: 14,
            fontSize: 11,
            color: '#ff5555',
            background: 'rgba(255, 85, 85, 0.08)',
            border: '1px solid rgba(255, 85, 85, 0.25)',
            borderRadius: 6,
          }}>
            {generateError}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 11,
              padding: '6px 14px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim() || !robotId}
            style={{
              background: generating ? 'rgba(255, 170, 0, 0.5)' : 'var(--accent, #ffaa00)',
              border: 'none',
              borderRadius: 6,
              color: '#000',
              cursor: generating || !prompt.trim() || !robotId ? 'not-allowed' : 'pointer',
              fontSize: 11,
              fontWeight: 600,
              padding: '6px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: (!prompt.trim() || !robotId) ? 0.5 : 1,
            }}
          >
            {generating && (
              <div style={{
                width: 12,
                height: 12,
                border: '2px solid rgba(0,0,0,0.2)',
                borderTopColor: '#000',
                borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
              }} />
            )}
            {generating ? 'Generating...' : 'Generate Scene'}
          </button>
        </div>
      </div>
    </div>
  );
}
