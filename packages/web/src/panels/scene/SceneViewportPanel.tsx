/**
 * Scene Viewport Panel — 2D/3D/Split scene canvas for the Scene workspace.
 * Wraps SceneCanvas with sceneStore bindings.
 */

import { useSceneStore } from '@/stores/sceneStore';
import SceneCanvas from '@/components/pipeline/SceneCanvas';

export default function SceneViewportPanel() {
  const sceneConfig = useSceneStore((s) => s.sceneConfig);
  const selectedPlacementId = useSceneStore((s) => s.selectedPlacementId);
  const selectPlacement = useSceneStore((s) => s.selectPlacement);
  const updatePlacement = useSceneStore((s) => s.updatePlacement);
  const addPlacement = useSceneStore((s) => s.addPlacement);
  const removePlacement = useSceneStore((s) => s.removePlacement);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <SceneCanvas
        sceneConfig={sceneConfig}
        selectedPlacementId={selectedPlacementId}
        onSelectPlacement={selectPlacement}
        onUpdatePlacement={updatePlacement}
        onAddPlacement={addPlacement}
        onRemovePlacement={removePlacement}
      />
    </div>
  );
}
