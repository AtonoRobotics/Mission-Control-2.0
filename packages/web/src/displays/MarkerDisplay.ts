import * as THREE from 'three';
import { DisplayPlugin, type PropertyDef } from './DisplayPlugin';
import { MSG } from '@/ros/messageTypes';

const MARKER_TYPES = {
  ARROW: 0, CUBE: 1, SPHERE: 2, CYLINDER: 3,
  LINE_STRIP: 4, LINE_LIST: 5, CUBE_LIST: 6, SPHERE_LIST: 7,
  POINTS: 8, TEXT_VIEW_FACING: 9, MESH_RESOURCE: 10, TRIANGLE_LIST: 11,
} as const;

function rosColor(c: any): THREE.Color {
  return new THREE.Color(c?.r ?? 1, c?.g ?? 1, c?.b ?? 1);
}

export class MarkerDisplay extends DisplayPlugin {
  readonly type: string = 'Marker';
  readonly supportedMessageTypes: string[] = [MSG.Marker];
  private markers = new Map<string, THREE.Object3D>();

  onMessage(msg: any) {
    const key = `${msg.ns}/${msg.id}`;
    if (msg.action === 2) { this.removeMarker(key); return; }
    if (msg.action === 3) { this.clearAll(); return; }

    this.removeMarker(key);
    const obj = this.create(msg);
    if (!obj) return;

    obj.position.set(msg.pose?.position?.x ?? 0, msg.pose?.position?.y ?? 0, msg.pose?.position?.z ?? 0);
    obj.quaternion.set(
      msg.pose?.orientation?.x ?? 0, msg.pose?.orientation?.y ?? 0,
      msg.pose?.orientation?.z ?? 0, msg.pose?.orientation?.w ?? 1,
    );
    this.root.add(obj);
    this.markers.set(key, obj);
  }

  private create(msg: any): THREE.Object3D | null {
    const color = rosColor(msg.color);
    const a = msg.color?.a ?? 1;
    const sx = msg.scale?.x ?? 1, sy = msg.scale?.y ?? 1, sz = msg.scale?.z ?? 1;
    const mat = new THREE.MeshStandardMaterial({ color, transparent: a < 1, opacity: a });

    switch (msg.type) {
      case MARKER_TYPES.ARROW: {
        const g = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(sy / 2, sy / 2, sx, 16), mat);
        shaft.rotation.z = -Math.PI / 2;
        shaft.position.x = sx / 2;
        g.add(shaft);
        const head = new THREE.Mesh(new THREE.ConeGeometry(sz / 2, sz, 16), mat);
        head.rotation.z = -Math.PI / 2;
        head.position.x = sx;
        g.add(head);
        return g;
      }
      case MARKER_TYPES.CUBE:
        return new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      case MARKER_TYPES.SPHERE:
        return new THREE.Mesh(new THREE.SphereGeometry(sx / 2, 32, 32), mat);
      case MARKER_TYPES.CYLINDER:
        return new THREE.Mesh(new THREE.CylinderGeometry(sx / 2, sx / 2, sz, 32), mat);
      case MARKER_TYPES.LINE_STRIP:
      case MARKER_TYPES.LINE_LIST: {
        const pts = (msg.points || []).map((p: any) => new THREE.Vector3(p.x, p.y, p.z));
        if (!pts.length) return null;
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const lmat = new THREE.LineBasicMaterial({ color });
        return msg.type === MARKER_TYPES.LINE_LIST ? new THREE.LineSegments(geo, lmat) : new THREE.Line(geo, lmat);
      }
      case MARKER_TYPES.CUBE_LIST:
        return this.instanced(msg, new THREE.BoxGeometry(sx, sy, sz));
      case MARKER_TYPES.SPHERE_LIST:
        return this.instanced(msg, new THREE.SphereGeometry(sx / 2, 16, 16));
      case MARKER_TYPES.POINTS: {
        const pos: number[] = [], cols: number[] = [];
        for (const p of msg.points || []) { pos.push(p.x, p.y, p.z); }
        for (let i = 0; i < (msg.points || []).length; i++) {
          const c = msg.colors?.[i] ?? msg.color;
          cols.push(c.r, c.g, c.b);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        return new THREE.Points(geo, new THREE.PointsMaterial({ size: sx || 0.02, vertexColors: true, sizeAttenuation: true }));
      }
      default:
        return null;
    }
  }

  private instanced(msg: any, geo: THREE.BufferGeometry): THREE.InstancedMesh {
    const count = (msg.points || []).length;
    const mat = new THREE.MeshStandardMaterial({ color: rosColor(msg.color) });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(count, 1));
    const dummy = new THREE.Object3D();
    (msg.points || []).forEach((p: any, i: number) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (msg.colors?.[i]) mesh.setColorAt(i, rosColor(msg.colors[i]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  private removeMarker(key: string) {
    const obj = this.markers.get(key);
    if (obj) { this.root.remove(obj); this.markers.delete(key); }
  }

  private clearAll() {
    for (const obj of this.markers.values()) this.root.remove(obj);
    this.markers.clear();
  }

  onFrame() {}
  getPropertySchema(): PropertyDef[] { return []; }

  dispose() { this.clearAll(); super.dispose(); }
}
