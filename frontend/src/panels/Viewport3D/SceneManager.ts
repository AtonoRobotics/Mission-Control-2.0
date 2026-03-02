import * as THREE from 'three';

export class SceneManager {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;

  private animationId: number | null = null;
  private onFrameCallbacks: ((dt: number) => void)[] = [];
  private clock = new THREE.Clock();
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.01,
      1000,
    );
    this.camera.position.set(3, 2, 3);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0a0a0a);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.setupLighting();
    this.setupGrid();

    this.resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
    this.resizeObserver.observe(container);

    this.animate();
  }

  private setupLighting() {
    const ambient = new THREE.AmbientLight(0xfff0e0, 0.4);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffeedd, 1.0);
    key.position.set(5, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.far = 50;
    key.shadow.bias = -0.001;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xaaccff, 0.3);
    fill.position.set(-3, 4, -2);
    this.scene.add(fill);

    const hemi = new THREE.HemisphereLight(0xffeedd, 0x222222, 0.2);
    this.scene.add(hemi);
  }

  private setupGrid() {
    const grid = new THREE.GridHelper(10, 20, 0x333333, 0x1a1a1a);
    this.scene.add(grid);
    const axes = new THREE.AxesHelper(1);
    this.scene.add(axes);
  }

  onFrame(callback: (dt: number) => void) {
    this.onFrameCallbacks.push(callback);
    return () => {
      this.onFrameCallbacks = this.onFrameCallbacks.filter((c) => c !== callback);
    };
  }

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    const dt = this.clock.getDelta();
    for (const cb of this.onFrameCallbacks) cb(dt);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.scene.clear();
  }
}
