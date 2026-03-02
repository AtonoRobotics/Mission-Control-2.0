import React, { useCallback } from 'react';
import { useSceneStore, type SceneConfig, type ScenePlacement } from '@/stores/sceneStore';
import SceneCanvas2D from './SceneCanvas2D';
import { SceneCanvas3D } from './SceneCanvas3D';

// --- Props ---

export interface SceneCanvasProps {
  sceneConfig: SceneConfig;
  selectedPlacementId: string | null;
  onSelectPlacement: (id: string | null) => void;
  onUpdatePlacement: (id: string, updates: Partial<ScenePlacement>) => void;
  onAddPlacement: (placement: ScenePlacement) => void;
}

// --- Styles ---

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  background: '#0a0a0a',
  overflow: 'hidden',
};

const topBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px 12px',
  background: '#1a1a1a',
  borderBottom: '1px solid #2a2a2a',
  flexShrink: 0,
};

const segmentGroupStyle: React.CSSProperties = {
  display: 'flex',
  borderRadius: 6,
  overflow: 'hidden',
  border: '1px solid #333',
};

const segmentBaseStyle: React.CSSProperties = {
  padding: '4px 16px',
  fontSize: 12,
  fontFamily: 'monospace',
  fontWeight: 600,
  cursor: 'pointer',
  border: 'none',
  outline: 'none',
  transition: 'background 0.15s, color 0.15s',
};

const segmentActiveStyle: React.CSSProperties = {
  ...segmentBaseStyle,
  background: '#ffaa00',
  color: '#0a0a0a',
};

const segmentInactiveStyle: React.CSSProperties = {
  ...segmentBaseStyle,
  background: '#1a1a1a',
  color: '#888',
};

const viewportAreaStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  minHeight: 0,
  overflow: 'hidden',
};

const statusBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '4px 12px',
  background: '#1a1a1a',
  borderTop: '1px solid #2a2a2a',
  fontSize: 11,
  fontFamily: 'monospace',
  color: '#666',
  flexShrink: 0,
};

const panelStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  position: 'relative',
};

// --- Component ---

export default function SceneCanvas({
  sceneConfig,
  selectedPlacementId,
  onSelectPlacement,
  onUpdatePlacement,
  onAddPlacement,
}: SceneCanvasProps) {
  const sceneViewMode = useSceneStore((s) => s.sceneViewMode);
  const setSceneViewMode = useSceneStore((s) => s.setSceneViewMode);

  const { placements, name } = sceneConfig;

  /** Handle asset drop from the AssetBrowser — creates a new ScenePlacement */
  const onDropAsset = useCallback(
    (assetData: string, worldX: number, worldY: number) => {
      let parsed: { id: string; label: string; source: string; type: string };
      try {
        parsed = JSON.parse(assetData);
      } catch {
        return;
      }

      const placement: ScenePlacement = {
        id: crypto.randomUUID(),
        asset_id: parsed.id,
        asset_source: (parsed.source as ScenePlacement['asset_source']) || 'nvidia',
        asset_type: (parsed.type as ScenePlacement['asset_type']) || 'object',
        label: parsed.label || 'Untitled',
        position: { x: worldX, y: worldY, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        physics_enabled: false,
        is_global: false,
        properties: {},
      };

      onAddPlacement(placement);
    },
    [onAddPlacement],
  );

  const modes: Array<{ key: '2d' | '3d' | 'split'; label: string }> = [
    { key: '2d', label: '2D' },
    { key: '3d', label: '3D' },
    { key: 'split', label: 'Split' },
  ];

  return (
    <div style={containerStyle}>
      {/* Top bar — view mode toggle */}
      <div style={topBarStyle}>
        <div style={segmentGroupStyle}>
          {modes.map((m) => (
            <button
              key={m.key}
              style={sceneViewMode === m.key ? segmentActiveStyle : segmentInactiveStyle}
              onClick={() => setSceneViewMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Viewport area */}
      <div style={viewportAreaStyle}>
        {(sceneViewMode === '2d' || sceneViewMode === 'split') && (
          <div style={sceneViewMode === 'split' ? { ...panelStyle, borderRight: '1px solid #2a2a2a' } : panelStyle}>
            <SceneCanvas2D
              placements={placements}
              selectedId={selectedPlacementId}
              onSelectPlacement={onSelectPlacement}
              onUpdatePlacement={onUpdatePlacement}
              onDropAsset={onDropAsset}
            />
          </div>
        )}
        {(sceneViewMode === '3d' || sceneViewMode === 'split') && (
          <div style={panelStyle}>
            <SceneCanvas3D
              placements={placements}
              selectedId={selectedPlacementId}
              onSelectPlacement={onSelectPlacement}
              onUpdatePlacement={onUpdatePlacement}
              onDropAsset={onDropAsset}
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={statusBarStyle}>
        <span>{placements.length} asset{placements.length !== 1 ? 's' : ''} placed</span>
        <span style={{ margin: '0 8px', color: '#333' }}>|</span>
        <span>Scene: {name}</span>
      </div>
    </div>
  );
}
