import * as THREE from 'three';
import { DisplayPlugin, type PropertyDef } from './DisplayPlugin';
import { MSG } from '@/ros/messageTypes';
import { parseURDFXml, buildRobotScene, setJointPositions, type URDFModel } from './urdf/URDFLoader';

export class RobotModelDisplay extends DisplayPlugin {
  readonly type = 'RobotModel';
  readonly supportedMessageTypes = [MSG.JointState];
  private jointMap = new Map<string, THREE.Object3D>();
  private model: URDFModel | null = null;
  private urdfLoaded = false;

  constructor() {
    super();
    this.properties = {
      urdfUrl: '/api/robot/dobot_cr10/urdf/raw',
      meshBasePath: '/static/meshes/visual/',
      alpha: 1.0,
    };
  }

  onAdd(scene: THREE.Scene) {
    super.onAdd(scene);
    this.loadURDF();
  }

  private async loadURDF() {
    try {
      const resp = await fetch(this.properties.urdfUrl);
      const xml = await resp.text();
      this.model = parseURDFXml(xml);

      const meshLoader = async (meshPath: string): Promise<THREE.BufferGeometry | null> => {
        const filename = meshPath.split('/').pop() || '';
        const url = `${this.properties.meshBasePath}${filename}`;
        try {
          const meshResp = await fetch(url);
          const buffer = await meshResp.arrayBuffer();
          return this.parseSTL(buffer);
        } catch {
          return new THREE.SphereGeometry(0.02);
        }
      };

      const { root, jointMap } = buildRobotScene(this.model, meshLoader);
      this.jointMap = jointMap;
      this.root.add(root);
      this.urdfLoaded = true;
    } catch (e) {
      console.error('Failed to load URDF:', e);
    }
  }

  private parseSTL(buffer: ArrayBuffer): THREE.BufferGeometry {
    const data = new DataView(buffer);
    const numTriangles = data.getUint32(80, true);
    const positions = new Float32Array(numTriangles * 9);
    const normals = new Float32Array(numTriangles * 9);
    for (let i = 0; i < numTriangles; i++) {
      const offset = 84 + i * 50;
      const nx = data.getFloat32(offset, true);
      const ny = data.getFloat32(offset + 4, true);
      const nz = data.getFloat32(offset + 8, true);
      for (let v = 0; v < 3; v++) {
        const vOff = offset + 12 + v * 12;
        const idx = i * 9 + v * 3;
        positions[idx] = data.getFloat32(vOff, true);
        positions[idx + 1] = data.getFloat32(vOff + 4, true);
        positions[idx + 2] = data.getFloat32(vOff + 8, true);
        normals[idx] = nx; normals[idx + 1] = ny; normals[idx + 2] = nz;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    return geo;
  }

  onMessage(msg: any) {
    if (!this.urdfLoaded) return;
    setJointPositions(this.jointMap, msg.name || [], msg.position || []);
  }

  onFrame() {}

  getPropertySchema(): PropertyDef[] {
    return [
      { key: 'urdfUrl', label: 'URDF URL', type: 'string', default: '/api/robot/dobot_cr10/urdf/raw' },
      { key: 'meshBasePath', label: 'Mesh Base Path', type: 'string', default: '/static/meshes/visual/' },
      { key: 'alpha', label: 'Alpha', type: 'number', default: 1.0, min: 0, max: 1, step: 0.1 },
    ];
  }
}
