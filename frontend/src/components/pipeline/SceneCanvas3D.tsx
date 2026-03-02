import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { SceneManager } from '@/panels/Viewport3D/SceneManager';
import { SimpleOrbitControls } from '@/panels/Viewport3D/OrbitControls';
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
  mesh.position.set(placement.position.x, placement.position.y, placement.position.z);
  // Environment planes already have a base rotation; add placement rotation on top
  if (placement.asset_type === 'environment') {
    mesh.rotation.set(
      -Math.PI / 2 + placement.rotation.x * DEG2RAD,
      placement.rotation.y * DEG2RAD,
      placement.rotation.z * DEG2RAD,
    );
  } else {
    mesh.rotation.set(
      placement.rotation.x * DEG2RAD,
      placement.rotation.y * DEG2RAD,
      placement.rotation.z * DEG2RAD,
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

export const SceneCanvas3D: React.FC<SceneCanvas3DProps> = ({
  placements,
  selectedId,
  onSelectPlacement,
  onUpdatePlacement: _onUpdatePlacement,
  onDropAsset,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<SceneManager | null>(null);
  const controlsRef = useRef<SimpleOrbitControls | null>(null);
  const meshMapRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Keep a ref to selectedId so the pointerdown handler always sees the latest
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  // Keep a ref to placements for the pointerdown handler
  const placementsRef = useRef(placements);
  placementsRef.current = placements;

  // ---- Initialize SceneManager + OrbitControls ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const sm = new SceneManager(container);
    managerRef.current = sm;

    const controls = new SimpleOrbitControls(sm.camera, sm.renderer.domElement);
    controlsRef.current = controls;

    return () => {
      controls.dispose();
      sm.dispose();
      managerRef.current = null;
      controlsRef.current = null;
      // Clean up meshes
      meshMapRef.current.clear();
    };
  }, []);

  // ---- Sync placement meshes ----
  useEffect(() => {
    const sm = managerRef.current;
    if (!sm) return;

    const meshMap = meshMapRef.current;
    const currentIds = new Set(placements.map((p) => p.id));

    // Remove meshes for placements that no longer exist
    for (const [id, mesh] of meshMap) {
      if (!currentIds.has(id)) {
        sm.scene.remove(mesh);
        mesh.geometry.dispose();
        if (mesh.material instanceof THREE.Material) {
          mesh.material.dispose();
        }
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
        sm.scene.add(mesh);
      }
      applyPlacementTransform(mesh, placement);

      // Selection highlight
      const isSelected = placement.id === selectedId;
      setEmissive(mesh, isSelected ? 0xffaa00 : 0);
    }
  }, [placements, selectedId]);

  // ---- Raycasting on pointerdown for selection ----
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const sm = managerRef.current;
      const container = containerRef.current;
      if (!sm || !container) return;

      // Only handle left clicks
      if (e.button !== 0) return;

      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, sm.camera);

      const meshes = Array.from(meshMapRef.current.values());
      const intersects = raycasterRef.current.intersectObjects(meshes);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const placementId = hit.userData.placementId as string | undefined;
        if (placementId) {
          onSelectPlacement(placementId);
          return;
        }
      }

      onSelectPlacement(null);
    },
    [onSelectPlacement],
  );

  // ---- Drop zone ----
  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const assetData = e.dataTransfer.getData('application/scene-asset');
      if (!assetData) return;

      const sm = managerRef.current;
      const container = containerRef.current;
      if (!sm || !container) return;

      // Compute drop position via ground plane intersection
      const rect = container.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, sm.camera);

      const intersection = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(GROUND_PLANE, intersection);

      if (hit) {
        onDropAsset(assetData, intersection.x, intersection.z);
      } else {
        // Fallback: use screen-space coordinates
        onDropAsset(assetData, e.clientX - rect.left, e.clientY - rect.top);
      }
    },
    [onDropAsset],
  );

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
      onPointerDown={onPointerDown}
      onDragOver={onDragOver}
      onDrop={onDrop}
    />
  );
};

export default SceneCanvas3D;
