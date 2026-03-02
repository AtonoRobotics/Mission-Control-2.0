import * as THREE from 'three';
import { DisplayPlugin, type PropertyDef } from './DisplayPlugin';
import { MSG } from '@/ros/messageTypes';

// Color constants as RGBA bytes
const COLOR_FREE:    [number, number, number, number] = [0,   0,   0,   0  ]; // fully transparent
const COLOR_UNKNOWN: [number, number, number, number] = [68,  68,  68,  180]; // #444444 semi-transparent
const COLOR_OCC:     [number, number, number, number] = [255, 68,  68,  170]; // #ff4444 semi-transparent

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Decode a rosbridge base64-encoded int8 array.
 * rosbridge sends OccupancyGrid.data as a base64 string of raw int8 bytes.
 */
function decodeBase64ToInt8(b64: string): Int8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int8Array(bytes.buffer);
}

export class OccupancyGridDisplay extends DisplayPlugin {
  readonly type = 'OccupancyGrid';
  readonly supportedMessageTypes: string[] = [MSG.OccupancyGrid];

  private plane: THREE.Mesh | null = null;
  private texture: THREE.DataTexture | null = null;

  constructor() {
    super();
    this.properties = {
      opacity:      0.7,
      showUnknown:  true,
    };
  }

  getPropertySchema(): PropertyDef[] {
    return [
      { key: 'opacity',     label: 'Opacity',      type: 'number',  default: 0.7,  min: 0, max: 1, step: 0.05 },
      { key: 'showUnknown', label: 'Show Unknown',  type: 'boolean', default: true },
    ];
  }

  onMessage(msg: any) {
    this.clearObjects();

    const width: number  = msg.info?.width  ?? 0;
    const height: number = msg.info?.height ?? 0;
    if (width === 0 || height === 0) return;

    const resolution: number = msg.info?.resolution ?? 0.05;
    const opacity: number    = this.properties.opacity ?? 0.7;
    const showUnknown: boolean = this.properties.showUnknown ?? true;

    // Decode data: rosbridge sends either a plain JS array (int8) or a base64 string
    let data: Int8Array;
    if (typeof msg.data === 'string') {
      data = decodeBase64ToInt8(msg.data);
    } else if (Array.isArray(msg.data)) {
      data = new Int8Array(msg.data);
    } else {
      return;
    }

    // Build RGBA DataTexture — one texel per grid cell
    const rgba = new Uint8Array(width * height * 4);

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        // OccupancyGrid is row-major, origin at bottom-left.
        // THREE.DataTexture origin is bottom-left too, so no vertical flip needed.
        const idx = row * width + col;
        const cell: number = idx < data.length ? data[idx] : -1;

        let r: number, g: number, b: number, a: number;

        if (cell === 0) {
          // Free — fully transparent
          [r, g, b, a] = COLOR_FREE;
        } else if (cell === 100) {
          // Occupied
          [r, g, b, a] = COLOR_OCC;
        } else {
          // Unknown (-1 or any other value)
          if (showUnknown) {
            [r, g, b, a] = COLOR_UNKNOWN;
          } else {
            [r, g, b, a] = COLOR_FREE;
          }
        }

        // Apply per-plugin opacity on top of per-value alpha
        a = Math.round(a * opacity);

        const texIdx = (row * width + col) * 4;
        rgba[texIdx]     = r;
        rgba[texIdx + 1] = g;
        rgba[texIdx + 2] = b;
        rgba[texIdx + 3] = a;
      }
    }

    const texture = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat);
    texture.needsUpdate = true;
    // Nearest-neighbour filtering preserves crisp cell boundaries
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    this.texture = texture;

    // Plane dimensions match the real-world grid size
    const planeW = width  * resolution;
    const planeH = height * resolution;
    const geo = new THREE.PlaneGeometry(planeW, planeH);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const plane = new THREE.Mesh(geo, mat);

    // Apply origin pose from map info
    const ox: number = msg.info?.origin?.position?.x ?? 0;
    const oy: number = msg.info?.origin?.position?.y ?? 0;
    const oz: number = msg.info?.origin?.position?.z ?? 0;

    const oqx: number = msg.info?.origin?.orientation?.x ?? 0;
    const oqy: number = msg.info?.origin?.orientation?.y ?? 0;
    const oqz: number = msg.info?.origin?.orientation?.z ?? 0;
    const oqw: number = msg.info?.origin?.orientation?.w ?? 1;

    // PlaneGeometry is centred at origin; origin in OccupancyGrid is the bottom-left corner.
    // Offset by half the plane size so the bottom-left aligns with the declared origin.
    plane.position.set(ox + planeW / 2, oy + planeH / 2, oz);
    plane.quaternion.set(oqx, oqy, oqz, oqw);

    this.root.add(plane);
    this.plane = plane;
  }

  onFrame(_dt: number) {}

  protected onPropertyChange(_key: string, _value: any) {
    // Opacity and showUnknown require rebuilding the texture from the last message.
    // Since we do not cache the raw message, changes take effect on the next incoming message.
    // For live maps this is acceptable; the map republishes frequently.
  }

  private clearObjects() {
    if (this.plane) {
      this.plane.geometry.dispose();
      (this.plane.material as THREE.Material).dispose();
      this.root.remove(this.plane);
      this.plane = null;
    }
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
  }

  dispose() {
    this.clearObjects();
    super.dispose();
  }
}
