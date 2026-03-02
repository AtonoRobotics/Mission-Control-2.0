import * as THREE from 'three';

export interface PropertyDef {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'color' | 'select';
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
}

export abstract class DisplayPlugin {
  abstract readonly type: string;
  abstract readonly supportedMessageTypes: string[];

  id = '';
  topic = '';
  frameId = '';
  visible = true;
  properties: Record<string, any> = {};

  protected scene: THREE.Scene | null = null;
  protected root: THREE.Group = new THREE.Group();

  onAdd(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.root);
  }

  onRemove() {
    if (this.scene) {
      this.scene.remove(this.root);
    }
    this.dispose();
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.root.visible = v;
  }

  abstract onMessage(msg: any): void;
  abstract onFrame(dt: number): void;
  abstract getPropertySchema(): PropertyDef[];

  setProperty(key: string, value: any) {
    this.properties[key] = value;
    this.onPropertyChange(key, value);
  }

  protected onPropertyChange(_key: string, _value: any) {}

  dispose() {
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    this.root.clear();
  }
}
