import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import type { ScenePlacement } from '@/stores/sceneStore';

interface SceneCanvas3DProps {
  placements: ScenePlacement[];
  selectedId: string | null;
  onSelectPlacement: (id: string | null) => void;
  onUpdatePlacement: (id: string, updates: Partial<ScenePlacement>) => void;
  onDropAsset: (assetData: string, canvasX: number, canvasY: number) => void;
}

const DEG2RAD = Math.PI / 180;

/** Ground plane at y=0 for drop raycasting */
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function createMeshForType(assetType: ScenePlacement['asset_type']): THREE.Mesh {
  switch (assetType) {
    case 'robot': {
      const geo = new THREE.BoxGeometry(0.3, 0.5, 0.3);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
      return new THREE.Mesh(geo, mat);
    }
    case 'environment': {
      const geo = new THREE.PlaneGeometry(4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0x4488ff, wireframe: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2; // lay flat
      return mesh;
    }
    case 'object': {
      const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      const mat = new THREE.MeshStandardMaterial({ color: 0x44cc88 });
      return new THREE.Mesh(geo, mat);
    }
    case 'sensor': {
      const geo = new THREE.SphereGeometry(0.05);
      const mat = new THREE.MeshStandardMaterial({ color: 0xcc44ff });
      return new THREE.Mesh(geo, mat);
    }
    case 'light': {
      const geo = new THREE.ConeGeometry(0.05, 0.1);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffcc44 });
      return new THREE.Mesh(geo, mat);
    }
  }
}

function applyPlacementTransform(mesh: THREE.Mesh, placement: ScenePlacement) {
  // Scene data: x=right, y=forward, z=up. Three.js: x=right, y=up, z=forward.
  mesh.position.set(placement.position.x, placement.position.z, placement.position.y);
  if (placement.asset_type === 'environment') {
    mesh.rotation.set(
      -Math.PI / 2 + placement.rotation.x * DEG2RAD,
      placement.rotation.z * DEG2RAD,
      placement.rotation.y * DEG2RAD,
    );
  } else {
    mesh.rotation.set(
      placement.rotation.x * DEG2RAD,
      placement.rotation.z * DEG2RAD,
      placement.rotation.y * DEG2RAD,
    );
  }
}

function setEmissive(mesh: THREE.Mesh, color: number) {
  const mat = mesh.material;
  if (mat instanceof THREE.MeshStandardMaterial) {
    mat.emissive.setHex(color);
    mat.emissiveIntensity = color === 0 ? 0 : 0.4;
  }
}

// --- Inline orbit controls to avoid conflicts with selection ---

class SceneOrbitControls {
  private camera: THREE.PerspectiveCamera;
  private spherical = new THREE.Spherical(5, Math.PI / 3, Math.PI / 4);
  private target = new THREE.Vector3();
  private isOrbiting = false;
  private isPanning = false;
  private lastMouse = new THREE.Vector2();
  private el: HTMLElement;

  constructor(camera: THREE.PerspectiveCamera, el: HTMLElement) {
    this.camera = camera;
    this.el = el;
    this.updateCamera();

    el.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onMouseDown = (e: MouseEvent) => {
    // Right-click = orbit, middle = pan (left-click reserved for selection)
    if (e.button === 2) this.isOrbiting = true;
    if (e.button === 1) this.isPanning = true;
    this.lastMouse.set(e.clientX, e.clientY);
  };

  private onMouseMove = (e: MouseEvent) => {
    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;
    this.lastMouse.set(e.clientX, e.clientY);

    if (this.isOrbiting) {
      this.spherical.theta -= dx * 0.005;
      this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi - dy * 0.005));
      this.updateCamera();
    }
    if (this.isPanning) {
      const panSpeed = this.spherical.radius * 0.002;
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
      this.target.addScaledVector(right, -dx * panSpeed);
      this.target.addScaledVector(up, dy * panSpeed);
      this.updateCamera();
    }
  };

  private onMouseUp = () => {
    this.isOrbiting = false;
    this.isPanning = false;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.spherical.radius *= 1 + e.deltaY * 0.001;
    this.spherical.radius = Math.max(0.5, Math.min(100, this.spherical.radius));
    this.updateCamera();
  };

  private updateCamera() {
    const pos = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(pos.add(this.target));
    this.camera.lookAt(this.target);
  }

  dispose() {
    this.el.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.el.removeEventListener('wheel', this.onWheel);
  }
}

export const SceneCanvas3D: React.FC<SceneCanvas3DProps> = ({
  placements,
  selectedId,
  onSelectPlacement,
  onUpdatePlacement: _onUpdatePlacement,
  onDropAsset,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<SceneOrbitControls | null>(null);
  const meshMapRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const raycasterRef = useRef(new THREE.Raycaster());
  const animIdRef = useRef<number>(0);

  // Refs for latest props (used in native event handlers)
  const onSelectRef = useRef(onSelectPlacement);
  onSelectRef.current = onSelectPlacement;
  const onDropRef = useRef(onDropAsset);
  onDropRef.current = onDropAsset;

  // ---- Initialize Three.js scene directly (no SceneManager) ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Lighting
    scene.add(new THREE.AmbientLight(0xfff0e0, 0.4));
    const key = new THREE.DirectionalLight(0xffeedd, 1.0);
    key.position.set(5, 8, 5);
    key.castShadow = true;
    scene.add(key);
    scene.add(new THREE.DirectionalLight(0xaaccff, 0.3).translateX(-3).translateY(4));
    scene.add(new THREE.HemisphereLight(0xffeedd, 0x222222, 0.2));

    // Grid + axes
    scene.add(new THREE.GridHelper(10, 20, 0x333333, 0x1a1a1a));
    scene.add(new THREE.AxesHelper(1));

    // Camera
    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 1000);
    camera.position.set(3, 2, 3);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0a0a0a);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Make canvas non-interactive for pointer events so container div catches them
    renderer.domElement.style.pointerEvents = 'none';

    // Orbit controls (right-click orbit, middle pan, scroll zoom)
    const controls = new SceneOrbitControls(camera, container);
    controlsRef.current = controls;

    // Resize observer
    const ro = new ResizeObserver(() => {
      const rw = Math.max(container.clientWidth, 1);
      const rh = Math.max(container.clientHeight, 1);
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh);
    });
    ro.observe(container);

    // Animation loop
    const animate = () => {
      animIdRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animIdRef.current = requestAnimationFrame(animate);

    // --- Native DOM: click for selection ---
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // left-click only
      const rect = container.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycasterRef.current.setFromCamera(mouse, camera);
      const meshes = Array.from(meshMapRef.current.values());
      const hits = raycasterRef.current.intersectObjects(meshes);
      if (hits.length > 0) {
        const id = hits[0].object.userData.placementId as string | undefined;
        if (id) { onSelectRef.current(id); return; }
      }
      onSelectRef.current(null);
    };
    container.addEventListener('mousedown', onMouseDown);

    // --- Native DOM: drag and drop ---
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const assetData = e.dataTransfer?.getData('application/scene-asset');
      if (!assetData) return;

      const rect = container.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const rc = new THREE.Raycaster();
      rc.setFromCamera(mouse, camera);
      const intersection = new THREE.Vector3();
      const hit = rc.ray.intersectPlane(GROUND_PLANE, intersection);
      if (hit) {
        // Three.js ground: x, z. Map to scene: x=x, y=z
        onDropRef.current(assetData, intersection.x, intersection.z);
      } else {
        onDropRef.current(assetData, 0, 0);
      }
    };
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('drop', onDrop);

    return () => {
      cancelAnimationFrame(animIdRef.current);
      ro.disconnect();
      controls.dispose();
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('dragover', onDragOver);
      container.removeEventListener('drop', onDrop);
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      meshMapRef.current.clear();
    };
  }, []);

  // ---- Sync placement meshes ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const meshMap = meshMapRef.current;
    const currentIds = new Set(placements.map((p) => p.id));

    // Remove meshes for placements that no longer exist
    for (const [id, mesh] of meshMap) {
      if (!currentIds.has(id)) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        if (mesh.material instanceof THREE.Material) mesh.material.dispose();
        meshMap.delete(id);
      }
    }

    // Add or update meshes
    for (const placement of placements) {
      let mesh = meshMap.get(placement.id);
      if (!mesh) {
        mesh = createMeshForType(placement.asset_type);
        mesh.userData.placementId = placement.id;
        meshMap.set(placement.id, mesh);
        scene.add(mesh);
      }
      applyPlacementTransform(mesh, placement);
      const isSelected = placement.id === selectedId;
      setEmissive(mesh, isSelected ? 0xffaa00 : 0);
    }
  }, [placements, selectedId]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'crosshair',
      }}
    />
  );
};

export default SceneCanvas3D;
