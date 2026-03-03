import * as THREE from 'three';
import { DisplayPlugin, type PropertyDef } from './DisplayPlugin';
import { MSG } from '@/ros/messageTypes';

export class PathDisplay extends DisplayPlugin {
  readonly type = 'Path';
  readonly supportedMessageTypes: string[] = [MSG.Path];

  private line: THREE.Line | null = null;
  private poseMarkers: THREE.InstancedMesh | null = null;

  constructor() {
    super();
    this.properties = {
      color:      '#ffaa00',
      lineWidth:  2,
      showPoses:  false,
    };
  }

  getPropertySchema(): PropertyDef[] {
    return [
      { key: 'color',     label: 'Color',       type: 'color',   default: '#ffaa00' },
      { key: 'lineWidth', label: 'Line Width',  type: 'number',  default: 2, min: 1, max: 10, step: 1 },
      { key: 'showPoses', label: 'Show Poses',  type: 'boolean', default: false },
    ];
  }

  onMessage(msg: any) {
    this.clearObjects();

    const poses: any[] = msg.poses ?? [];
    if (poses.length === 0) return;

    const color = new THREE.Color(this.properties.color ?? '#ffaa00');

    // Build line through all pose positions
    const points = poses.map((ps: any) =>
      new THREE.Vector3(
        ps.pose?.position?.x ?? 0,
        ps.pose?.position?.y ?? 0,
        ps.pose?.position?.z ?? 0,
      )
    );

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color,
      linewidth: this.properties.lineWidth ?? 2,
    });
    const line = new THREE.Line(geo, mat);
    this.root.add(line);
    this.line = line;

    // Optional sphere markers at each pose
    if (this.properties.showPoses && poses.length > 0) {
      const sphereGeo = new THREE.SphereGeometry(0.04, 12, 12);
      const sphereMat = new THREE.MeshStandardMaterial({ color });
      const mesh = new THREE.InstancedMesh(sphereGeo, sphereMat, poses.length);

      const dummy = new THREE.Object3D();
      poses.forEach((ps: any, i: number) => {
        dummy.position.set(
          ps.pose?.position?.x ?? 0,
          ps.pose?.position?.y ?? 0,
          ps.pose?.position?.z ?? 0,
        );
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;

      this.root.add(mesh);
      this.poseMarkers = mesh;
    }
  }

  onFrame(_dt: number) {}

  private clearObjects() {
    if (this.line) {
      this.line.geometry.dispose();
      (this.line.material as THREE.Material).dispose();
      this.root.remove(this.line);
      this.line = null;
    }

    if (this.poseMarkers) {
      this.poseMarkers.geometry.dispose();
      (this.poseMarkers.material as THREE.Material).dispose();
      this.root.remove(this.poseMarkers);
      this.poseMarkers = null;
    }
  }

  dispose() {
    this.clearObjects();
    super.dispose();
  }
}
