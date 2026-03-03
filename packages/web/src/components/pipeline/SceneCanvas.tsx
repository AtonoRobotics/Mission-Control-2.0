import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Save, Download, FolderOpen, Check, Loader2, Trash2 } from 'lucide-react';
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
  onRemovePlacement: (id: string) => void;
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

const statusBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 10px',
  fontSize: 11,
  fontFamily: 'monospace',
  fontWeight: 600,
  background: 'var(--bg-surface-2)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  transition: 'border-color 0.15s, color 0.15s, box-shadow 0.15s',
  lineHeight: 1,
};

const loadDropdownStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  right: 0,
  marginBottom: 6,
  background: 'var(--bg-surface-2)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  minWidth: 260,
  maxHeight: 280,
  overflowY: 'auto',
  zIndex: 100,
  boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
};

const dropdownItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '8px 12px',
  background: 'transparent',
  color: 'var(--text-primary)',
  border: 'none',
  borderBottom: '1px solid var(--border-default)',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'monospace',
  transition: 'background 0.1s',
};

// --- Component ---

export default function SceneCanvas({
  sceneConfig,
  selectedPlacementId,
  onSelectPlacement,
  onUpdatePlacement,
  onAddPlacement,
  onRemovePlacement,
}: SceneCanvasProps) {
  const sceneViewMode = useSceneStore((s) => s.sceneViewMode);
  const setSceneViewMode = useSceneStore((s) => s.setSceneViewMode);
  const generating = useSceneStore((s) => s.generating);
  const generateError = useSceneStore((s) => s.generateError);
  const saving = useSceneStore((s) => s.saving);
  const savedSceneId = useSceneStore((s) => s.savedSceneId);
  const savedScenes = useSceneStore((s) => s.savedScenes);
  const saveScene = useSceneStore((s) => s.saveScene);
  const loadScene = useSceneStore((s) => s.loadScene);
  const fetchSavedScenes = useSceneStore((s) => s.fetchSavedScenes);
  const exportSceneJson = useSceneStore((s) => s.exportSceneJson);

  const [loadOpen, setLoadOpen] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const loadRef = useRef<HTMLDivElement>(null);

  const placements = sceneConfig?.placements ?? [];
  const name = sceneConfig?.name ?? 'Untitled Scene';

  // Close Load dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (loadRef.current && !loadRef.current.contains(e.target as Node)) {
        setLoadOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSave = useCallback(async () => {
    await saveScene();
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1200);
  }, [saveScene]);

  const handleLoadOpen = useCallback(() => {
    fetchSavedScenes();
    setLoadOpen((v) => !v);
  }, [fetchSavedScenes]);

  /** Handle asset drop from the AssetBrowser — creates a new ScenePlacement */
  const onDropAsset = useCallback(
    (assetData: string, worldX: number, worldY: number) => {
      let parsed: { id: string; label: string; source: string; asset_type: string };
      try {
        parsed = JSON.parse(assetData);
      } catch {
        return;
      }

      // Normalize plural category names to singular asset_type
      const typeMap: Record<string, ScenePlacement['asset_type']> = {
        robots: 'robot', robot: 'robot',
        environments: 'environment', environment: 'environment',
        objects: 'object', object: 'object',
        sensors: 'sensor', sensor: 'sensor',
        lighting: 'light', light: 'light',
        // Registry file_type mappings
        urdf: 'robot', robot_usd: 'robot', usd: 'object', mesh: 'object',
      };
      const assetType = typeMap[parsed.asset_type] || 'object';

      const placement: ScenePlacement = {
        id: crypto.randomUUID(),
        asset_id: parsed.id,
        asset_source: (parsed.source as ScenePlacement['asset_source']) || 'nvidia',
        asset_type: assetType,
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
              onRemovePlacement={onRemovePlacement}
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
              onRemovePlacement={onRemovePlacement}
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={{ ...statusBarStyle, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {generating ? (
            <span style={{ color: 'var(--accent)' }}>
              <Loader2 size={12} style={{ display: 'inline', marginRight: 4, animation: 'spin 1s linear infinite' }} />
              Generating scene...
            </span>
          ) : generateError ? (
            <span style={{ color: 'var(--danger)' }}>Error: {generateError}</span>
          ) : (
            <>
              <span>{placements.length} asset{placements.length !== 1 ? 's' : ''} placed</span>
              <span style={{ color: 'var(--border-default)' }}>|</span>
              <span>Scene: {name}</span>
              {savedSceneId && (
                <span className="badge badge-accent" style={{ marginLeft: 2 }}>saved</span>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }} ref={loadRef}>
          {/* Save */}
          <button
            style={{
              ...statusBtnStyle,
              ...(saveFlash ? { borderColor: 'var(--accent)', color: 'var(--accent)', boxShadow: '0 0 6px var(--accent-glow)' } : {}),
              ...(saving ? { opacity: 0.5, cursor: 'wait' } : {}),
            }}
            onClick={handleSave}
            disabled={saving || generating}
            title={savedSceneId ? 'Update saved scene (Ctrl+S)' : 'Save scene to database'}
            onMouseEnter={(e) => { if (!saving) (e.currentTarget.style.borderColor = 'var(--accent)'); }}
            onMouseLeave={(e) => { if (!saveFlash) (e.currentTarget.style.borderColor = 'var(--border-default)'); }}
          >
            {saveFlash ? <Check size={12} /> : saving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
            {saveFlash ? 'Saved' : saving ? 'Saving' : 'Save'}
          </button>

          {/* Export */}
          <button
            style={statusBtnStyle}
            onClick={exportSceneJson}
            disabled={generating}
            title="Download scene as JSON"
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
          >
            <Download size={12} />
            Export
          </button>

          {/* Load */}
          <button
            style={{
              ...statusBtnStyle,
              ...(loadOpen ? { borderColor: 'var(--accent)', color: 'var(--text-accent)' } : {}),
            }}
            onClick={handleLoadOpen}
            disabled={generating}
            title="Load a saved scene"
            onMouseEnter={(e) => { if (!loadOpen) e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onMouseLeave={(e) => { if (!loadOpen) e.currentTarget.style.borderColor = 'var(--border-default)'; }}
          >
            <FolderOpen size={12} />
            Load
          </button>

          {/* Load dropdown */}
          {loadOpen && (
            <div style={loadDropdownStyle}>
              <div style={{ padding: '6px 12px', fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid var(--border-default)' }}>
                Saved Scenes
              </div>
              {savedScenes.length === 0 ? (
                <div style={{ padding: '16px 12px', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'monospace', textAlign: 'center' }}>
                  No saved scenes yet
                </div>
              ) : (
                savedScenes.map((s) => (
                  <div
                    key={s.scene_id}
                    style={{
                      ...dropdownItemStyle,
                      ...(s.scene_id === savedSceneId ? { background: 'var(--accent-dim)', borderLeft: '2px solid var(--accent)' } : {}),
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-surface-3)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = s.scene_id === savedSceneId ? 'var(--accent-dim)' : 'transparent'; }}
                  >
                    <button
                      style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0 }}
                      onClick={() => { loadScene(s.scene_id); setLoadOpen(false); }}
                    >
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>
                        {new Date(s.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </button>
                    <button
                      style={{ all: 'unset', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', flexShrink: 0, display: 'flex', borderRadius: 3, transition: 'color 0.15s' }}
                      title="Delete scene"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${s.name}"?`)) {
                          const store = useSceneStore.getState();
                          store.deleteScene(s.scene_id);
                        }
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
