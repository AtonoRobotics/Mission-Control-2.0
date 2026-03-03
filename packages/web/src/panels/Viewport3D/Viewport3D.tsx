import { useRef, useEffect } from 'react';
import { SceneManager } from './SceneManager';
import { SimpleOrbitControls } from './OrbitControls';
import { DisplayManager } from '@/displays/DisplayManager';

export default function Viewport3D() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const sm = new SceneManager(containerRef.current);
    const controls = new SimpleOrbitControls(sm.camera, sm.renderer.domElement);
    const dm = new DisplayManager(sm.scene);

    dm.start();

    // Wire display updates into render loop
    const removeFrame = sm.onFrame((dt) => {
      dm.update(dt);
    });

    return () => {
      dm.stop();
      removeFrame();
      controls.dispose();
      sm.dispose();
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full viewport-bg" />;
}
