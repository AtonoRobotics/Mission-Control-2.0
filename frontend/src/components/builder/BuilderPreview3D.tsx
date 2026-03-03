import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useComponentStore, type Component } from '@/stores/componentStore';
import { type TreeNode } from '@/stores/builderStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BuilderPreview3DProps {
  tree: TreeNode[];
  selectedId: string | null;
}

// ---------------------------------------------------------------------------
// Simple orbit controls (inline for builder — no external dependency)
// ---------------------------------------------------------------------------

class SimpleOrbit {
  private camera: THREE.PerspectiveCamera;
  private el: HTMLElement;
  private spherical = new THREE.Spherical(3, Math.PI / 3, Math.PI / 4);
  private target = new THREE.Vector3(0, 0, 0.3);
  private dragging = false;
  private prev = { x: 0, y: 0 };

  constructor(camera: THREE.PerspectiveCamera, el: HTMLElement) {
    this.camera = camera;
    this.el = el;
    this.el.addEventListener('pointerdown', this.onDown);
    this.el.addEventListener('pointermove', this.onMove);
    this.el.addEventListener('pointerup', this.onUp);
    this.el.addEventListener('wheel', this.onWheel, { passive: false });
    this.update();
  }

  private onDown = (e: PointerEvent) => {
    this.dragging = true;
    this.prev = { x: e.clientX, y: e.clientY };
    this.el.setPointerCapture(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.prev.x;
    const dy = e.clientY - this.prev.y;
    this.prev = { x: e.clientX, y: e.clientY };
    this.spherical.theta -= dx * 0.005;
    this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi - dy * 0.005));
    this.update();
  };

  private onUp = () => { this.dragging = false; };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.spherical.radius = Math.max(0.5, Math.min(10, this.spherical.radius + e.deltaY * 0.003));
    this.update();
  };

  update() {
    const pos = new THREE.Vector3().setFromSpherical(this.spherical).add(this.target);
    this.camera.position.copy(pos);
    this.camera.lookAt(this.target);
  }

  dispose() {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('wheel', this.onWheel);
  }
}

// ---------------------------------------------------------------------------
// BuilderPreview3D
// ---------------------------------------------------------------------------

export default function BuilderPreview3D({ tree, selectedId }: BuilderPreview3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { components } = useComponentStore();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d0d0d');

    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.01, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    el.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight('#fff0e0', 0.4));
    const key = new THREE.DirectionalLight('#ffffff', 1.2);
    key.position.set(2, 3, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight('#8899cc', 0.3);
    fill.position.set(-2, 1, -1);
    scene.add(fill);

    // Grid
    const grid = new THREE.GridHelper(4, 20, '#333333', '#1a1a1a');
    grid.rotation.x = 0; // XZ plane
    scene.add(grid);

    // Axes
    scene.add(new THREE.AxesHelper(0.5));

    // Orbit controls
    const controls = new SimpleOrbit(camera, renderer.domElement);

    // Component map
    const componentMap = new Map(components.map((c) => [c.component_id, c]));

    // Build meshes from tree
    const meshGroup = new THREE.Group();
    let yOffset = 0;

    for (const node of tree) {
      const comp = componentMap.get(node.component_id);
      const mass = comp?.physics?.mass_kg;

      // Primitive geometry fallback: box sized proportional to mass
      const size = mass ? Math.cbrt(mass) * 0.05 + 0.03 : 0.05;
      const geo = new THREE.BoxGeometry(size, size * 1.2, size);
      const isSelected = node.component_id === selectedId;

      const mat = new THREE.MeshStandardMaterial({
        color: isSelected ? '#ffaa00' : '#4a4a4a',
        emissive: isSelected ? '#332200' : '#000000',
        metalness: 0.3,
        roughness: 0.7,
      });

      const mesh = new THREE.Mesh(geo, mat);

      // Stack components vertically
      const xyz = node.joint_config?.origin_xyz;
      if (xyz) {
        mesh.position.set(xyz[0], xyz[2] + yOffset, xyz[1]);
      } else {
        mesh.position.set(0, yOffset, 0);
      }
      yOffset += size * 1.3;

      // Attachment point marker
      const markerGeo = new THREE.SphereGeometry(0.008);
      const markerMat = new THREE.MeshBasicMaterial({ color: '#ffaa00' });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.set(0, size * 0.6, 0);
      mesh.add(marker);

      meshGroup.add(mesh);
    }

    scene.add(meshGroup);

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (!el.clientWidth || !el.clientHeight) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);

    // Animation loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [tree, selectedId, components]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 200,
        background: '#0d0d0d',
        borderRadius: 'var(--radius-md, 6px)',
        overflow: 'hidden',
      }}
    />
  );
}
