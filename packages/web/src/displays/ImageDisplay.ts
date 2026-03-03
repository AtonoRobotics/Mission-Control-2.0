import * as THREE from 'three';
import { DisplayPlugin, type PropertyDef } from './DisplayPlugin';
import { MSG } from '@/ros/messageTypes';

export class ImageDisplay extends DisplayPlugin {
  readonly type = 'Image';
  readonly supportedMessageTypes = [MSG.Image, MSG.CompressedImage];

  private mesh: THREE.Mesh | null = null;
  private texture: THREE.CanvasTexture | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    super();
    this.properties = {
      width: 1.0,
      height: 0.75,
      opacity: 1.0,
    };
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 480;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  onAdd(scene: THREE.Scene): void {
    super.onAdd(scene);
    this.buildMesh();
  }

  getPropertySchema(): PropertyDef[] {
    return [
      { key: 'width', label: 'Width (m)', type: 'number', default: 1.0, min: 0.01, max: 10.0, step: 0.01 },
      { key: 'height', label: 'Height (m)', type: 'number', default: 0.75, min: 0.01, max: 10.0, step: 0.01 },
      { key: 'opacity', label: 'Opacity', type: 'number', default: 1.0, min: 0.0, max: 1.0, step: 0.01 },
    ];
  }

  onMessage(msg: any): void {
    const msgType: string = msg._type ?? '';

    if (msgType === MSG.CompressedImage || (msg.format !== undefined && msg.data !== undefined && msg.width === undefined)) {
      this.handleCompressedImage(msg);
    } else {
      this.handleRawImage(msg);
    }
  }

  private handleCompressedImage(msg: { data: string; format?: string }): void {
    // data is base64-encoded JPEG or PNG bytes
    const mimeType = (msg.format ?? 'jpeg').toLowerCase().includes('png') ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${msg.data}`;

    const img = new Image();
    img.onload = () => {
      if (this.canvas.width !== img.width || this.canvas.height !== img.height) {
        this.canvas.width = img.width;
        this.canvas.height = img.height;
      }
      this.ctx.drawImage(img, 0, 0);
      if (this.texture) {
        this.texture.needsUpdate = true;
      } else {
        this.createTexture();
      }
    };
    img.src = dataUrl;
  }

  private handleRawImage(msg: {
    width: number;
    height: number;
    encoding: string;
    data: string;
  }): void {
    const { width, height, encoding, data } = msg;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // data is base64-encoded raw bytes
    const binaryStr = atob(data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const imageData = this.ctx.createImageData(width, height);
    const out = imageData.data;
    const enc = encoding.toLowerCase();

    if (enc === 'rgb8') {
      for (let i = 0; i < width * height; i++) {
        out[i * 4 + 0] = bytes[i * 3 + 0];
        out[i * 4 + 1] = bytes[i * 3 + 1];
        out[i * 4 + 2] = bytes[i * 3 + 2];
        out[i * 4 + 3] = 255;
      }
    } else if (enc === 'bgr8') {
      for (let i = 0; i < width * height; i++) {
        out[i * 4 + 0] = bytes[i * 3 + 2];
        out[i * 4 + 1] = bytes[i * 3 + 1];
        out[i * 4 + 2] = bytes[i * 3 + 0];
        out[i * 4 + 3] = 255;
      }
    } else if (enc === 'mono8') {
      for (let i = 0; i < width * height; i++) {
        const v = bytes[i];
        out[i * 4 + 0] = v;
        out[i * 4 + 1] = v;
        out[i * 4 + 2] = v;
        out[i * 4 + 3] = 255;
      }
    } else if (enc === 'rgba8') {
      for (let i = 0; i < width * height; i++) {
        out[i * 4 + 0] = bytes[i * 4 + 0];
        out[i * 4 + 1] = bytes[i * 4 + 1];
        out[i * 4 + 2] = bytes[i * 4 + 2];
        out[i * 4 + 3] = bytes[i * 4 + 3];
      }
    } else {
      // Unknown encoding — write raw bytes as-is into RGBA (best-effort)
      const len = Math.min(bytes.length, out.length);
      for (let i = 0; i < len; i++) {
        out[i] = bytes[i];
      }
      // Ensure alpha channel is opaque if not set
      if (enc !== 'rgba8') {
        for (let i = 3; i < out.length; i += 4) {
          out[i] = 255;
        }
      }
    }

    this.ctx.putImageData(imageData, 0, 0);

    if (this.texture) {
      this.texture.needsUpdate = true;
    } else {
      this.createTexture();
    }
  }

  private createTexture(): void {
    this.texture = new THREE.CanvasTexture(this.canvas);
    // THREE expects images to be flipped vertically relative to canvas origin
    this.texture.flipY = false;
    if (this.mesh) {
      (this.mesh.material as THREE.MeshBasicMaterial).map = this.texture;
      (this.mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
    } else {
      this.buildMesh();
    }
  }

  private buildMesh(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.MeshBasicMaterial).dispose();
      this.root.remove(this.mesh);
      this.mesh = null;
    }

    const w: number = this.properties.width;
    const h: number = this.properties.height;
    const opacity: number = this.properties.opacity;

    const geometry = new THREE.PlaneGeometry(w, h);
    const material = new THREE.MeshBasicMaterial({
      map: this.texture ?? null,
      transparent: opacity < 1.0,
      opacity,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.root.add(this.mesh);
  }

  onFrame(_dt: number): void {}

  protected onPropertyChange(key: string, value: any): void {
    if (key === 'opacity' && this.mesh) {
      const mat = this.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = value as number;
      mat.transparent = (value as number) < 1.0;
      mat.needsUpdate = true;
    } else if (key === 'width' || key === 'height') {
      // Rebuild geometry with new dimensions
      this.buildMesh();
    }
  }

  dispose(): void {
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.MeshBasicMaterial).dispose();
      this.mesh = null;
    }
    super.dispose();
  }
}
