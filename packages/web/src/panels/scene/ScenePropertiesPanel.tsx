/**
 * Scene Properties Panel — edit selected placement transform, physics, info.
 */

import { useCallback } from 'react';
import { useSceneStore, type ScenePlacement } from '@/stores/sceneStore';

export default function ScenePropertiesPanel() {
  const selectedPlacementId = useSceneStore((s) => s.selectedPlacementId);
  const placements = useSceneStore((s) => s.sceneConfig.placements);
  const updatePlacement = useSceneStore((s) => s.updatePlacement);
  const removePlacement = useSceneStore((s) => s.removePlacement);
  const selectPlacement = useSceneStore((s) => s.selectPlacement);

  const placement = placements.find((p) => p.id === selectedPlacementId);

  const handleRemove = useCallback(() => {
    if (selectedPlacementId) {
      removePlacement(selectedPlacementId);
      selectPlacement(null);
    }
  }, [selectedPlacementId, removePlacement, selectPlacement]);

  if (!placement) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-surface-1)',
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Select a placement to edit properties
        </span>
      </div>
    );
  }

  const updateVec3 = (
    field: 'position' | 'rotation' | 'scale',
    axis: 'x' | 'y' | 'z',
    value: number,
  ) => {
    updatePlacement(placement.id, {
      [field]: { ...placement[field], [axis]: value },
    });
  };

  return (
    <div style={{
      height: '100%', overflowY: 'auto', background: 'var(--bg-surface-1)', padding: 12,
    }}>
      {/* Header */}
      <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border-default)' }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: 4,
        }}>
          {placement.label}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Badge color="var(--accent)">{placement.asset_type}</Badge>
          <Badge color="var(--text-muted)">{placement.asset_source}</Badge>
        </div>
      </div>

      {/* Label */}
      <FieldGroup label="Label">
        <input
          type="text"
          value={placement.label}
          onChange={(e) => updatePlacement(placement.id, { label: e.target.value })}
          style={inputStyle}
        />
      </FieldGroup>

      {/* Position */}
      <SectionLabel>Position</SectionLabel>
      <Vec3Row
        value={placement.position}
        step={0.01}
        onChange={(axis, v) => updateVec3('position', axis, v)}
      />

      {/* Rotation */}
      <SectionLabel>Rotation (deg)</SectionLabel>
      <Vec3Row
        value={placement.rotation}
        step={1}
        min={0}
        max={360}
        onChange={(axis, v) => updateVec3('rotation', axis, v)}
      />

      {/* Scale */}
      <SectionLabel>Scale</SectionLabel>
      <Vec3Row
        value={placement.scale}
        step={0.1}
        onChange={(axis, v) => updateVec3('scale', axis, v)}
      />

      {/* Physics */}
      <SectionLabel>Physics</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-primary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={placement.physics_enabled}
            onChange={(e) => updatePlacement(placement.id, { physics_enabled: e.target.checked })}
            style={{ accentColor: 'var(--accent)' }}
          />
          Physics Enabled
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-primary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={placement.is_global}
            onChange={(e) => updatePlacement(placement.id, { is_global: e.target.checked })}
            style={{ accentColor: 'var(--accent)' }}
          />
          Global (shared across envs)
        </label>
      </div>

      {/* Info */}
      <SectionLabel>Info</SectionLabel>
      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 14 }}>
        <div style={{ marginBottom: 2 }}>ID: {placement.id.slice(0, 8)}...</div>
        <div>Asset: {placement.asset_id.slice(0, 12)}...</div>
      </div>

      {/* Delete */}
      <button
        onClick={handleRemove}
        style={{
          width: '100%', padding: '6px 0', fontSize: 11, fontWeight: 600,
          background: 'transparent', border: '1px solid rgba(255,68,68,0.4)',
          borderRadius: 4, color: 'var(--danger)', cursor: 'pointer',
        }}
      >
        Delete Placement
      </button>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
      color: 'var(--text-muted)', marginBottom: 6, marginTop: 12,
      paddingBottom: 4, borderBottom: '1px solid var(--border-default)',
    }}>
      {children}
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9, fontFamily: 'var(--font-mono)', padding: '1px 6px',
      borderRadius: 9, color, background: `${color}18`, border: `1px solid ${color}40`,
    }}>
      {children}
    </span>
  );
}

function Vec3Row({
  value,
  step,
  min,
  max,
  onChange,
}: {
  value: { x: number; y: number; z: number };
  step: number;
  min?: number;
  max?: number;
  onChange: (axis: 'x' | 'y' | 'z', v: number) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 10 }}>
      {(['x', 'y', 'z'] as const).map((axis) => (
        <div key={axis}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>{axis.toUpperCase()}</div>
          <input
            type="number"
            value={value[axis]}
            step={step}
            min={min}
            max={max}
            onChange={(e) => onChange(axis, parseFloat(e.target.value) || 0)}
            style={inputStyle}
          />
        </div>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '4px 6px',
  background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 3,
  color: 'var(--text-primary)', fontSize: 11, fontFamily: 'var(--font-mono)',
  outline: 'none',
};
