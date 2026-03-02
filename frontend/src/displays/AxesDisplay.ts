import * as THREE from 'three';
import { DisplayPlugin, type PropertyDef } from './DisplayPlugin';

export class AxesDisplay extends DisplayPlugin {
  readonly type = 'Axes';
  readonly supportedMessageTypes: string[] = [];

  constructor() {
    super();
    this.properties = { length: 1 };
  }

  onAdd(scene: THREE.Scene) {
    super.onAdd(scene);
    this.root.add(new THREE.AxesHelper(this.properties.length));
  }

  onMessage() {}
  onFrame() {}

  getPropertySchema(): PropertyDef[] {
    return [{ key: 'length', label: 'Length', type: 'number', default: 1, min: 0.1, max: 10, step: 0.1 }];
  }

  protected onPropertyChange() {
    this.root.clear();
    this.root.add(new THREE.AxesHelper(this.properties.length));
  }
}
