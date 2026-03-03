import * as THREE from 'three';
import { DisplayPlugin, type PropertyDef } from './DisplayPlugin';
import { MSG } from '@/ros/messageTypes';

export class LaserScanDisplay extends DisplayPlugin {
  readonly type = 'LaserScan';
  readonly supportedMessageTypes = [MSG.LaserScan];

  private pointsObj: THREE.Points | null = null;
  private lineObj: THREE.Line | null = null;

  constructor() {
    super();
    this.properties = {
      pointSize: 0.02,
      color: '#ff4444',
      style: 'points',
    };
  }

  getPropertySchema(): PropertyDef[] {
    return [
      { key: 'pointSize', label: 'Point Size', type: 'number', default: 0.02, min: 0.001, max: 1.0, step: 0.001 },
      { key: 'color', label: 'Color', type: 'color', default: '#ff4444' },
      {
        key: 'style',
        label: 'Style',
        type: 'select',
        default: 'points',
        options: [
          { label: 'Points', value: 'points' },
          { label: 'Lines', value: 'lines' },
        ],
      },
    ];
  }

  onMessage(msg: any): void {
    const {
      angle_min,
      angle_increment,
      range_min,
      range_max,
      ranges,
    }: {
      angle_min: number;
      angle_increment: number;
      range_min: number;
      range_max: number;
      ranges: number[];
    } = msg;

    // Collect valid cartesian points
    const positions: number[] = [];
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      if (r < range_min || r > range_max || !isFinite(r)) continue;
      const angle = angle_min + i * angle_increment;
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);
      positions.push(x, y, 0);
    }

    const color = new THREE.Color(this.properties.color as string);
    const style: string = this.properties.style;

    // Remove previous objects
    this.clearObjects();

    if (positions.length === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    if (style === 'lines') {
      const material = new THREE.LineBasicMaterial({ color });
      this.lineObj = new THREE.Line(geometry, material);
      this.root.add(this.lineObj);
    } else {
      const material = new THREE.PointsMaterial({
        color,
        size: this.properties.pointSize as number,
        sizeAttenuation: true,
      });
      this.pointsObj = new THREE.Points(geometry, material);
      this.root.add(this.pointsObj);
    }
  }

  onFrame(_dt: number): void {}

  protected onPropertyChange(key: string, value: any): void {
    if (key === 'color') {
      const color = new THREE.Color(value as string);
      if (this.pointsObj) {
        (this.pointsObj.material as THREE.PointsMaterial).color.set(color);
      }
      if (this.lineObj) {
        (this.lineObj.material as THREE.LineBasicMaterial).color.set(color);
      }
    } else if (key === 'pointSize' && this.pointsObj) {
      (this.pointsObj.material as THREE.PointsMaterial).size = value as number;
    }
    // style change requires a new message to take effect (geometry rebuild on next msg)
  }

  private clearObjects(): void {
    if (this.pointsObj) {
      this.pointsObj.geometry.dispose();
      (this.pointsObj.material as THREE.PointsMaterial).dispose();
      this.root.remove(this.pointsObj);
      this.pointsObj = null;
    }
    if (this.lineObj) {
      this.lineObj.geometry.dispose();
      (this.lineObj.material as THREE.LineBasicMaterial).dispose();
      this.root.remove(this.lineObj);
      this.lineObj = null;
    }
  }

  dispose(): void {
    this.clearObjects();
    super.dispose();
  }
}
