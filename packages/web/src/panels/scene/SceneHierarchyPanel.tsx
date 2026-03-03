/**
 * Scene Hierarchy Panel — asset browser + placement list for the Scene workspace.
 * Left sidebar showing registry/NVIDIA assets and current scene placements.
 */

import { useCallback, useState } from 'react';
import { useSceneStore, type ScenePlacement } from '@/stores/sceneStore';
import AssetBrowser from '@/components/pipeline/AssetBrowser';
import SceneGenerateModal from '@/components/pipeline/SceneGenerateModal';

export default function SceneHierarchyPanel() {
  const sceneConfig = useSceneStore((s) => s.sceneConfig);
  const selectedPlacementId = useSceneStore((s) => s.selectedPlacementId);
  const selectPlacement = useSceneStore((s) => s.selectPlacement);
  const removePlacement = useSceneStore((s) => s.removePlacement);
  const setSceneConfig = useSceneStore((s) => s.setSceneConfig);
  const resetScene = useSceneStore((s) => s.resetScene);
  const generating = useSceneStore((s) => s.generating);

  const [showGenerate, setShowGenerate] = useState(false);
  const [tab, setTab] = useState<'placements' | 'assets'>('placements');

  const placements = sceneConfig.placements;

  const typeIcon = (t: ScenePlacement['asset_type']) => {
    switch (t) {
      case 'robot': return '\u2699';
      case 'environment': return '\u25A3';
      case 'object': return '\u25CB';
      case 'sensor': return '\u25C9';
      case 'light': return '\u2600';
      default: return '\u25AA';
    }
  };

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-surface-1)', overflow: 'hidden',
    }}>
      {/* Scene header */}
      <div style={{
        padding: '8px 10px', borderBottom: '1px solid var(--border-default)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
            {sceneConfig.name}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
            {placements.length} placement{placements.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => setShowGenerate(true)}
            style={actionBtnStyle}
            title="Generate scene with AI"
            disabled={generating}
          >
            {generating ? '\u23F3' : '\u2728'}
          </button>
          <button
            onClick={resetScene}
            style={actionBtnStyle}
            title="New scene"
          >
            +
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border-default)', flexShrink: 0,
      }}>
        {(['placements', 'assets'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '5px 0', background: 'transparent', border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.06em', cursor: 'pointer',
            }}
          >
            {t === 'placements' ? `Hierarchy (${placements.length})` : 'Assets'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'placements' ? (
          placements.length === 0 ? (
            <div style={{
              padding: '32px 12px', textAlign: 'center', fontSize: 11,
              color: 'var(--text-muted)', lineHeight: 1.6,
            }}>
              No placements yet.
              <br />
              Drag assets from the Assets tab, or use AI generate.
            </div>
          ) : (
            placements.map((p) => (
              <div
                key={p.id}
                onClick={() => selectPlacement(p.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px', cursor: 'pointer',
                  background: selectedPlacementId === p.id ? 'var(--accent-dim)' : 'transparent',
                  borderLeft: selectedPlacementId === p.id ? '2px solid var(--accent)' : '2px solid transparent',
                  borderBottom: '1px solid var(--border-default)',
                }}
              >
                <span style={{ fontSize: 12, width: 16, textAlign: 'center' }}>
                  {typeIcon(p.asset_type)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 11, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {p.label}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {p.asset_type} · {p.asset_source}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removePlacement(p.id); }}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-muted)',
                    cursor: 'pointer', fontSize: 12, padding: '2px 4px',
                  }}
                  title="Remove"
                >
                  &times;
                </button>
              </div>
            ))
          )
        ) : (
          <AssetBrowser />
        )}
      </div>

      {/* Scene settings footer */}
      <div style={{
        padding: '6px 10px', borderTop: '1px solid var(--border-default)',
        fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>dt: {sceneConfig.physics_dt.toFixed(4)}s</span>
        <span>g: [{sceneConfig.gravity.join(', ')}]</span>
      </div>

      <SceneGenerateModal open={showGenerate} onClose={() => setShowGenerate(false)} />
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  padding: '2px 6px', fontSize: 12, background: 'var(--bg-surface-2)',
  border: '1px solid var(--border-default)', borderRadius: 3,
  color: 'var(--text-secondary)', cursor: 'pointer',
};
