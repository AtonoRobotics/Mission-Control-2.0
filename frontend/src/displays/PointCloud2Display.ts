import * as THREE from 'three';
import { DisplayPlugin, type PropertyDef } from './DisplayPlugin';
import { MSG } from '@/ros/messageTypes';

// ROS2 PointField datatype constants
const DATATYPE_FLOAT32 = 7;
const DATATYPE_FLOAT64 = 8;
const DATATYPE_INT8    = 1;
const DATATYPE_UINT8   = 2;
const DATATYPE_INT16   = 3;
const DATATYPE_UINT16  = 4;
const DATATYPE_INT32   = 5;
const DATATYPE_UINT32  = 6;

const MAX_POINTS = 1_000_000;

type ColorMode = 'flat' | 'x' | 'y' | 'z' | 'intensity';

interface PointField {
  name: string;
  offset: number;
  datatype: number;
  count: number;
}

function datatypeSize(datatype: number): number {
  switch (datatype) {
    case DATATYPE_INT8:
    case DATATYPE_UINT8:   return 1;
    case DATATYPE_INT16:
    case DATATYPE_UINT16:  return 2;
    case DATATYPE_INT32:
    case DATATYPE_UINT32:
    case DATATYPE_FLOAT32: return 4;
    case DATATYPE_FLOAT64: return 8;
    default:               return 4;
  }
}

function readFieldValue(view: DataView, byteOffset: number, datatype: number): number {
  switch (datatype) {
    case DATATYPE_FLOAT32: return view.getFloat32(byteOffset, true);
    case DATATYPE_FLOAT64: return view.getFloat64(byteOffset, true);
    case DATATYPE_INT8:    return view.getInt8(byteOffset);
    case DATATYPE_UINT8:   return view.getUint8(byteOffset);
    case DATATYPE_INT16:   return view.getInt16(byteOffset, true);
    case DATATYPE_UINT16:  return view.getUint16(byteOffset, true);
    case DATATYPE_INT32:   return view.getInt32(byteOffset, true);
    case DATATYPE_UINT32:  return view.getUint32(byteOffset, true);
    default:               return view.getFloat32(byteOffset, true);
  }
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Maps a normalized value [0, 1] to a warm-to-cool color (blue → cyan → green → yellow → red).
function warmCoolColor(t: number, out: THREE.Color): void {
  // Clamp
  const v = Math.max(0, Math.min(1, t));
  // 4-segment gradient: blue(0) → cyan(0.25) → green(0.5) → yellow(0.75) → red(1)
  let r: number, g: number, b: number;
  if (v < 0.25) {
    const s = v / 0.25;
    r = 0; g = s; b = 1;
  } else if (v < 0.5) {
    const s = (v - 0.25) / 0.25;
    r = 0; g = 1; b = 1 - s;
  } else if (v < 0.75) {
    const s = (v - 0.5) / 0.25;
    r = s; g = 1; b = 0;
  } else {
    const s = (v - 0.75) / 0.25;
    r = 1; g = 1 - s; b = 0;
  }
  out.setRGB(r, g, b);
}

export class PointCloud2Display extends DisplayPlugin {
  readonly type: string = 'PointCloud2';
  readonly supportedMessageTypes: string[] = [MSG.PointCloud2];

  private points: THREE.Points | null = null;
  private pointsGeometry: THREE.BufferGeometry | null = null;
  private pointsMaterial: THREE.PointsMaterial | null = null;

  constructor() {
    super();
    this.properties = {
      pointSize: 0.02,
      colorMode: 'flat' as ColorMode,
      flatColor: '#ffffff',
    };
  }

  getPropertySchema(): PropertyDef[] {
    return [
      {
        key: 'pointSize',
        label: 'Point Size',
        type: 'number',
        default: 0.02,
        min: 0.001,
        max: 0.1,
        step: 0.001,
      },
      {
        key: 'colorMode',
        label: 'Color Mode',
        type: 'select',
        default: 'flat',
        options: [
          { label: 'Flat', value: 'flat' },
          { label: 'X Axis', value: 'x' },
          { label: 'Y Axis', value: 'y' },
          { label: 'Z Axis', value: 'z' },
          { label: 'Intensity', value: 'intensity' },
        ],
      },
      {
        key: 'flatColor',
        label: 'Flat Color',
        type: 'color',
        default: '#ffffff',
      },
    ];
  }

  onMessage(msg: any): void {
    this.clearPoints();

    const height: number = msg.height ?? 1;
    const width: number = msg.width ?? 0;
    const pointStep: number = msg.point_step ?? 0;
    const fields: PointField[] = msg.fields ?? [];

    const totalPoints = height * width;
    if (totalPoints === 0 || pointStep === 0) return;

    // Decode data: rosbridge sends base64 strings, but may also provide Uint8Array
    let buffer: ArrayBuffer;
    if (typeof msg.data === 'string') {
      buffer = base64ToArrayBuffer(msg.data);
    } else if (msg.data instanceof ArrayBuffer) {
      buffer = msg.data;
    } else if (ArrayBuffer.isView(msg.data)) {
      const view = msg.data as Uint8Array;
      buffer = new ArrayBuffer(view.byteLength);
      new Uint8Array(buffer).set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    } else {
      return;
    }

    // Locate field descriptors for x, y, z, and intensity
    const findField = (name: string): PointField | undefined =>
      fields.find((f) => f.name === name);

    const xField = findField('x');
    const yField = findField('y');
    const zField = findField('z');
    const intensityField = findField('intensity');

    if (!xField || !yField || !zField) return;

    const colorMode: ColorMode = this.properties.colorMode ?? 'flat';
    const useIntensity = colorMode === 'intensity' && intensityField !== undefined;
    const useAxisColor = colorMode === 'x' || colorMode === 'y' || colorMode === 'z';
    const useVertexColors = useIntensity || useAxisColor;

    const count = Math.min(totalPoints, MAX_POINTS);
    const view = new DataView(buffer);

    const positions = new Float32Array(count * 3);
    let colors: Float32Array | null = null;
    if (useVertexColors) {
      colors = new Float32Array(count * 3);
    }

    // First pass: extract positions and gather range for normalization
    let axisMin = Infinity;
    let axisMax = -Infinity;

    const rawAxis = useVertexColors && !useIntensity ? new Float32Array(count) : null;
    const rawIntensity = useIntensity ? new Float32Array(count) : null;

    let validCount = 0;

    for (let i = 0; i < count; i++) {
      const base = i * pointStep;
      if (base + pointStep > buffer.byteLength) break;

      const x = readFieldValue(view, base + xField.offset, xField.datatype);
      const y = readFieldValue(view, base + yField.offset, yField.datatype);
      const z = readFieldValue(view, base + zField.offset, zField.datatype);

      // Skip NaN or Inf points (common in real sensor data)
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;

      positions[validCount * 3]     = x;
      positions[validCount * 3 + 1] = y;
      positions[validCount * 3 + 2] = z;

      if (rawAxis !== null) {
        let axisVal: number;
        if (colorMode === 'x') axisVal = x;
        else if (colorMode === 'y') axisVal = y;
        else axisVal = z;
        rawAxis[validCount] = axisVal;
        if (axisVal < axisMin) axisMin = axisVal;
        if (axisVal > axisMax) axisMax = axisVal;
      }

      if (rawIntensity !== null && intensityField) {
        const intensity = readFieldValue(view, base + intensityField.offset, intensityField.datatype);
        rawIntensity[validCount] = intensity;
        if (intensity < axisMin) axisMin = intensity;
        if (intensity > axisMax) axisMax = intensity;
      }

      validCount++;
    }

    // Build vertex color array using collected range
    if (colors !== null && validCount > 0) {
      const range = axisMax - axisMin;
      const invRange = range > 0 ? 1 / range : 1;
      const tmp = new THREE.Color();
      const source = rawAxis ?? rawIntensity!;

      for (let i = 0; i < validCount; i++) {
        const t = (source[i] - axisMin) * invRange;
        warmCoolColor(t, tmp);
        colors[i * 3]     = tmp.r;
        colors[i * 3 + 1] = tmp.g;
        colors[i * 3 + 2] = tmp.b;
      }
    }

    // Build geometry with only validCount points
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions.subarray(0, validCount * 3), 3));
    if (colors !== null) {
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors.subarray(0, validCount * 3), 3));
    }

    const flatColor = new THREE.Color(this.properties.flatColor ?? '#ffffff');
    const mat = new THREE.PointsMaterial({
      size: this.properties.pointSize ?? 0.02,
      sizeAttenuation: true,
      vertexColors: useVertexColors,
      color: useVertexColors ? 0xffffff : flatColor,
    });

    this.pointsGeometry = geo;
    this.pointsMaterial = mat;
    this.points = new THREE.Points(geo, mat);
    this.root.add(this.points);
  }

  private clearPoints(): void {
    if (this.points) {
      this.root.remove(this.points);
      this.points = null;
    }
    if (this.pointsGeometry) {
      this.pointsGeometry.dispose();
      this.pointsGeometry = null;
    }
    if (this.pointsMaterial) {
      this.pointsMaterial.dispose();
      this.pointsMaterial = null;
    }
  }

  protected onPropertyChange(key: string, value: any): void {
    if (!this.pointsMaterial) return;

    if (key === 'pointSize') {
      this.pointsMaterial.size = value;
      this.pointsMaterial.needsUpdate = true;
    } else if (key === 'flatColor') {
      const colorMode: ColorMode = this.properties.colorMode ?? 'flat';
      if (colorMode === 'flat') {
        this.pointsMaterial.color.set(value);
        this.pointsMaterial.needsUpdate = true;
      }
    } else if (key === 'colorMode') {
      // Color mode change requires full geometry rebuild on next message; nothing to do here
      // without the original data. Update material vertex color flag from current state.
      const useVertex = value !== 'flat';
      this.pointsMaterial.vertexColors = useVertex;
      if (!useVertex) {
        this.pointsMaterial.color.set(this.properties.flatColor ?? '#ffffff');
      }
      this.pointsMaterial.needsUpdate = true;
    }
  }

  onFrame(_dt: number): void {}

  dispose(): void {
    this.clearPoints();
    super.dispose();
  }
}
