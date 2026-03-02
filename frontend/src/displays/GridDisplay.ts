import * as THREE from 'three';
import { DisplayPlugin, type PropertyDef } from './DisplayPlugin';

export class GridDisplay extends DisplayPlugin {
  readonly type = 'Grid';
  readonly supportedMessageTypes: string[] = [];
  private grid: THREE.GridHelper | null = null;

  constructor() {
    super();
    this.properties = { size: 10, divisions: 20, color: '#333333', centerColor: '#555555' };
  }

  onAdd(scene: THREE.Scene) {
    super.onAdd(scene);
    this.rebuildGrid();
  }

  private rebuildGrid() {
    if (this.grid) this.root.remove(this.grid);
    this.grid = new THREE.GridHelper(
      this.properties.size, this.properties.divisions,
      new THREE.Color(this.properties.centerColor), new THREE.Color(this.properties.color),
    );
    this.root.add(this.grid);
  }

  onMessage() {}
  onFrame() {}

  getPropertySchema(): PropertyDef[] {
    return [
      { key: 'size', label: 'Size', type: 'number', default: 10, min: 1, max: 100 },
      { key: 'divisions', label: 'Divisions', type: 'number', default: 20, min: 1, max: 100 },
      { key: 'color', label: 'Line Color', type: 'color', default: '#333333' },
      { key: 'centerColor', label: 'Center Color', type: 'color', default: '#555555' },
    ];
  }

  protected onPropertyChange() { this.rebuildGrid(); }
}
