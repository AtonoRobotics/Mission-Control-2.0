import * as THREE from 'three';
import { DisplayPlugin, type PropertyDef } from './DisplayPlugin';
import { MSG } from '@/ros/messageTypes';

export class PoseDisplay extends DisplayPlugin {
  readonly type = 'Pose';
  readonly supportedMessageTypes: string[] = [MSG.PoseStamped];

  private arrowGroup: THREE.Group | null = null;
  private axesHelper: THREE.AxesHelper | null = null;

  constructor() {
    super();
    this.properties = {
      color: '#00cc66',
      scale: 0.5,
      showAxes: true,
    };
  }

  getPropertySchema(): PropertyDef[] {
    return [
      { key: 'color',     label: 'Color',      type: 'color',   default: '#00cc66' },
      { key: 'scale',     label: 'Scale',      type: 'number',  default: 0.5, min: 0.01, max: 10, step: 0.01 },
      { key: 'showAxes',  label: 'Show Axes',  type: 'boolean', default: true },
    ];
  }

  onMessage(msg: any) {
    this.clearObjects();

    const px: number = msg.pose?.position?.x ?? 0;
    const py: number = msg.pose?.position?.y ?? 0;
    const pz: number = msg.pose?.position?.z ?? 0;

    const qx: number = msg.pose?.orientation?.x ?? 0;
    const qy: number = msg.pose?.orientation?.y ?? 0;
    const qz: number = msg.pose?.orientation?.z ?? 0;
    const qw: number = msg.pose?.orientation?.w ?? 1;

    const scale: number = this.properties.scale ?? 0.5;
    const color = new THREE.Color(this.properties.color ?? '#00cc66');
    const quaternion = new THREE.Quaternion(qx, qy, qz, qw);

    // Build arrow: shaft (cylinder) + head (cone) aligned along +X in local space,
    // then rotated by the message quaternion.
    const group = new THREE.Group();

    const shaftRadius = scale * 0.05;
    const shaftLength = scale * 0.7;
    const headRadius  = scale * 0.12;
    const headLength  = scale * 0.3;

    const mat = new THREE.MeshStandardMaterial({ color });

    const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 16);
    const shaft = new THREE.Mesh(shaftGeo, mat);
    // CylinderGeometry is Y-aligned; rotate so it points along +X
    shaft.rotation.z = -Math.PI / 2;
    shaft.position.x = shaftLength / 2;
    group.add(shaft);

    const headGeo = new THREE.ConeGeometry(headRadius, headLength, 16);
    const head = new THREE.Mesh(headGeo, mat);
    head.rotation.z = -Math.PI / 2;
    head.position.x = shaftLength + headLength / 2;
    group.add(head);

    group.position.set(px, py, pz);
    group.quaternion.copy(quaternion);
    this.root.add(group);
    this.arrowGroup = group;

    if (this.properties.showAxes) {
      const axes = new THREE.AxesHelper(scale * 0.6);
      axes.position.set(px, py, pz);
      axes.quaternion.copy(quaternion);
      this.root.add(axes);
      this.axesHelper = axes;
    }
  }

  onFrame(_dt: number) {}

  protected onPropertyChange(_key: string, _value: any) {
    // If the last message is not cached, property changes will take effect on the next message.
    // Re-rendering requires the last message; we keep it simple and rely on the next incoming msg.
  }

  private clearObjects() {
    if (this.arrowGroup) {
      this.arrowGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      this.root.remove(this.arrowGroup);
      this.arrowGroup = null;
    }

    if (this.axesHelper) {
      this.root.remove(this.axesHelper);
      this.axesHelper = null;
    }
  }

  dispose() {
    this.clearObjects();
    super.dispose();
  }
}
