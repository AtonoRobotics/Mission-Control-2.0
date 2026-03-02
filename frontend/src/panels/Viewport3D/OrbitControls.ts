import * as THREE from 'three';

export class SimpleOrbitControls {
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private spherical = new THREE.Spherical(5, Math.PI / 3, Math.PI / 4);
  private target = new THREE.Vector3();
  private isDragging = false;
  private isPanning = false;
  private lastMouse = new THREE.Vector2();

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.updateCamera();

    domElement.addEventListener('mousedown', this.onMouseDown);
    domElement.addEventListener('mousemove', this.onMouseMove);
    domElement.addEventListener('mouseup', this.onMouseUp);
    domElement.addEventListener('mouseleave', this.onMouseUp);
    domElement.addEventListener('wheel', this.onWheel, { passive: false });
    domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) this.isDragging = true;
    if (e.button === 2) this.isPanning = true;
    this.lastMouse.set(e.clientX, e.clientY);
  };

  private onMouseMove = (e: MouseEvent) => {
    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;
    this.lastMouse.set(e.clientX, e.clientY);

    if (this.isDragging) {
      this.spherical.theta -= dx * 0.005;
      this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi - dy * 0.005));
      this.updateCamera();
    }

    if (this.isPanning) {
      const panSpeed = this.spherical.radius * 0.002;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      right.setFromMatrixColumn(this.camera.matrixWorld, 0);
      up.setFromMatrixColumn(this.camera.matrixWorld, 1);
      this.target.addScaledVector(right, -dx * panSpeed);
      this.target.addScaledVector(up, dy * panSpeed);
      this.updateCamera();
    }
  };

  private onMouseUp = () => {
    this.isDragging = false;
    this.isPanning = false;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.spherical.radius *= 1 + e.deltaY * 0.001;
    this.spherical.radius = Math.max(0.5, Math.min(100, this.spherical.radius));
    this.updateCamera();
  };

  private updateCamera() {
    const pos = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(pos.add(this.target));
    this.camera.lookAt(this.target);
  }

  dispose() {
    this.domElement.removeEventListener('mousedown', this.onMouseDown);
    this.domElement.removeEventListener('mousemove', this.onMouseMove);
    this.domElement.removeEventListener('mouseup', this.onMouseUp);
    this.domElement.removeEventListener('mouseleave', this.onMouseUp);
    this.domElement.removeEventListener('wheel', this.onWheel);
  }
}
