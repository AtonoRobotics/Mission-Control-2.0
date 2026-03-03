import * as THREE from 'three';

export interface URDFJoint {
  name: string;
  type: string;
  parent: string;
  child: string;
  origin: { xyz: number[]; rpy: number[] };
  axis: number[];
  limits?: { lower: number; upper: number; velocity: number; effort: number };
}

export interface URDFLink {
  name: string;
  visual?: { meshPath: string; origin: { xyz: number[]; rpy: number[] }; color?: number[] };
}

export interface URDFModel {
  name: string;
  links: Map<string, URDFLink>;
  joints: Map<string, URDFJoint>;
  rootLink: string;
}

export function parseURDFXml(xmlString: string): URDFModel {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const robot = doc.querySelector('robot');
  if (!robot) throw new Error('No <robot> element found');

  const name = robot.getAttribute('name') || 'robot';
  const links = new Map<string, URDFLink>();
  const joints = new Map<string, URDFJoint>();

  for (const el of robot.querySelectorAll('link')) {
    const linkName = el.getAttribute('name') || '';
    const visual = el.querySelector('visual');
    let visualInfo: URDFLink['visual'];

    if (visual) {
      const meshEl = visual.querySelector('geometry mesh');
      const originEl = visual.querySelector('origin');
      const materialEl = visual.querySelector('material color');
      visualInfo = {
        meshPath: meshEl?.getAttribute('filename') || '',
        origin: parseOrigin(originEl),
        color: materialEl ? materialEl.getAttribute('rgba')?.split(' ').map(Number) : undefined,
      };
    }
    links.set(linkName, { name: linkName, visual: visualInfo });
  }

  const childLinks = new Set<string>();
  for (const el of robot.querySelectorAll('joint')) {
    const jName = el.getAttribute('name') || '';
    const jType = el.getAttribute('type') || 'fixed';
    const parent = el.querySelector('parent')?.getAttribute('link') || '';
    const child = el.querySelector('child')?.getAttribute('link') || '';
    const originEl = el.querySelector('origin');
    const axisEl = el.querySelector('axis');
    const limitEl = el.querySelector('limit');
    childLinks.add(child);

    joints.set(jName, {
      name: jName, type: jType, parent, child,
      origin: parseOrigin(originEl),
      axis: axisEl ? (axisEl.getAttribute('xyz') || '0 0 1').split(' ').map(Number) : [0, 0, 1],
      limits: limitEl ? {
        lower: Number(limitEl.getAttribute('lower') || 0),
        upper: Number(limitEl.getAttribute('upper') || 0),
        velocity: Number(limitEl.getAttribute('velocity') || 0),
        effort: Number(limitEl.getAttribute('effort') || 0),
      } : undefined,
    });
  }

  let rootLink = '';
  for (const [linkName] of links) {
    if (!childLinks.has(linkName)) { rootLink = linkName; break; }
  }

  return { name, links, joints, rootLink };
}

function parseOrigin(el: Element | null): { xyz: number[]; rpy: number[] } {
  return {
    xyz: el ? (el.getAttribute('xyz') || '0 0 0').split(' ').map(Number) : [0, 0, 0],
    rpy: el ? (el.getAttribute('rpy') || '0 0 0').split(' ').map(Number) : [0, 0, 0],
  };
}

export function buildRobotScene(
  model: URDFModel,
  meshLoader: (path: string) => Promise<THREE.BufferGeometry | null>,
): { root: THREE.Group; jointMap: Map<string, THREE.Object3D> } {
  const root = new THREE.Group();
  const jointMap = new Map<string, THREE.Object3D>();
  const linkGroups = new Map<string, THREE.Group>();

  for (const [name] of model.links) {
    const g = new THREE.Group();
    g.name = name;
    linkGroups.set(name, g);
  }

  for (const [, joint] of model.joints) {
    const parentGroup = linkGroups.get(joint.parent);
    const childGroup = linkGroups.get(joint.child);
    if (!parentGroup || !childGroup) continue;

    const jointGroup = new THREE.Group();
    jointGroup.name = `joint_${joint.name}`;
    const { xyz, rpy } = joint.origin;
    jointGroup.position.set(xyz[0], xyz[1], xyz[2]);
    jointGroup.rotation.set(rpy[0], rpy[1], rpy[2], 'XYZ');
    parentGroup.add(jointGroup);
    jointGroup.add(childGroup);

    if (joint.type === 'revolute' || joint.type === 'continuous' || joint.type === 'prismatic') {
      jointMap.set(joint.name, jointGroup);
      (jointGroup as any)._jointAxis = new THREE.Vector3(...joint.axis);
      (jointGroup as any)._jointType = joint.type;
    }
  }

  const rootGroup = linkGroups.get(model.rootLink);
  if (rootGroup) root.add(rootGroup);

  for (const [name, link] of model.links) {
    if (!link.visual?.meshPath) continue;
    const group = linkGroups.get(name);
    if (!group) continue;
    const { xyz, rpy } = link.visual.origin;

    meshLoader(link.visual.meshPath).then((geo) => {
      if (!geo) return;
      const mat = new THREE.MeshStandardMaterial({
        color: link.visual?.color ? new THREE.Color(link.visual.color[0], link.visual.color[1], link.visual.color[2]) : 0x888888,
        roughness: 0.6, metalness: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(xyz[0], xyz[1], xyz[2]);
      mesh.rotation.set(rpy[0], rpy[1], rpy[2], 'XYZ');
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
  }

  return { root, jointMap };
}

export function setJointPositions(jointMap: Map<string, THREE.Object3D>, names: string[], positions: number[]) {
  for (let i = 0; i < names.length; i++) {
    const obj = jointMap.get(names[i]);
    if (!obj) continue;
    const axis = (obj as any)._jointAxis as THREE.Vector3 | undefined;
    const jtype = (obj as any)._jointType as string | undefined;
    if (!axis) continue;
    const val = positions[i];
    if (jtype === 'prismatic') {
      obj.position.set(axis.x * val, axis.y * val, axis.z * val);
    } else {
      obj.rotation.set(0, 0, 0);
      obj.rotateOnAxis(axis, val);
    }
  }
}
