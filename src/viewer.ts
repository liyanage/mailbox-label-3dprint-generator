import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { LabelResult, Settings } from './types.ts';

export class LabelViewer {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private label?: THREE.Mesh;
  private materials = [
    new THREE.MeshStandardMaterial({ color: '#161616', roughness: 0.72, metalness: 0.02, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.62, metalness: 0, flatShading: true }),
  ];
  private dimensions: [number, number] = [44.5, 38.5];
  private thickness = 3;
  private framingDistance = 0;
  private observer: ResizeObserver;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor('#e9e9e5', 1);
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D label preview. Drag to rotate and scroll to zoom.');
    this.renderer.domElement.setAttribute('role', 'img');
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.addEventListener('change', () => this.render());
    this.scene.add(new THREE.AmbientLight('#ffffff', 2.2));
    const key = new THREE.DirectionalLight('#ffffff', 3.2);
    key.position.set(-45, 60, 100);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -190, right: 190, top: 190, bottom: -190, far: 500 });
    key.shadow.bias = -0.00015;
    this.scene.add(key);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.ShadowMaterial({ opacity: 0.12 }));
    ground.position.z = -0.3;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.renderer.setAnimationLoop(() => { this.controls.update(); this.render(); });
    this.reset();
  }

  private render(): void { this.renderer.render(this.scene, this.camera); }

  private fittedDistance(): number {
    const aspect = this.container.clientWidth / (this.container.clientHeight || 1) || 1;
    const span = Math.max(this.dimensions[1], this.dimensions[0] / aspect) * 1.62;
    return span / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) + this.thickness;
  }

  private resize(): void {
    const width = this.container.clientWidth, height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const distance = this.fittedDistance();
    // Preserve the user's orbit and relative zoom when the viewport changes shape.
    if (this.framingDistance) {
      this.camera.position.sub(this.controls.target).multiplyScalar(distance / this.framingDistance).add(this.controls.target);
    }
    this.framingDistance = distance;
    this.controls.minDistance = Math.max(this.thickness * 2, distance / 4);
    this.controls.maxDistance = distance * 2;
    this.camera.far = Math.max(1000, distance * 4 + Math.max(...this.dimensions));
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private replace(geometry: THREE.BufferGeometry, settings: Settings): void {
    if (this.label) { this.scene.remove(this.label); this.label.geometry.dispose(); }
    geometry.translate(-settings.width/2, -settings.height/2, 0);
    this.label = new THREE.Mesh(geometry, this.materials);
    this.label.castShadow = true;
    this.scene.add(this.label);
    this.dimensions = [settings.width, settings.height];
    this.thickness = settings.baseThickness + settings.textThickness;
    this.reset();
  }

  show(result: LabelResult): void {
    const indexed = new THREE.BufferGeometry();
    indexed.setAttribute('position', new THREE.BufferAttribute(result.positions.slice(), 3));
    indexed.setIndex(new THREE.BufferAttribute(result.indices.slice(), 1));
    const geometry = indexed.toNonIndexed();
    indexed.dispose();
    geometry.computeVertexNormals();
    const points = geometry.getAttribute('position');
    const baseFaces: number[] = [], textFaces: number[] = [];
    // The boolean union has no faces crossing the base/text boundary.
    for (let i = 0; i < points.count; i += 3) {
      const white = Math.max(points.getZ(i), points.getZ(i+1), points.getZ(i+2)) > result.settings.baseThickness + 0.00001;
      (white ? textFaces : baseFaces).push(i, i+1, i+2);
    }
    geometry.setIndex([...baseFaces, ...textFaces]);
    geometry.addGroup(0, baseFaces.length, 0);
    geometry.addGroup(baseFaces.length, textFaces.length, 1);
    this.replace(geometry, result.settings);
  }

  showBase(s: Settings): void {
    const { width: w, height: h, radius: r } = s, shape = new THREE.Shape();
    shape.moveTo(r, 0); shape.lineTo(w-r, 0); shape.absarc(w-r, r, r, -Math.PI/2, 0, false);
    shape.lineTo(w, h-r); shape.absarc(w-r, h-r, r, 0, Math.PI/2, false);
    shape.lineTo(r, h); shape.absarc(r, h-r, r, Math.PI/2, Math.PI, false);
    shape.lineTo(0, r); shape.absarc(r, r, r, Math.PI, Math.PI*1.5, false);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: s.baseThickness, bevelEnabled: false, curveSegments: 18 });
    geometry.clearGroups(); geometry.addGroup(0, geometry.getAttribute('position').count, 0);
    this.replace(geometry, s);
  }

  reset(): void {
    // Clear orbit damping so a reset during motion still returns to the exact starting view.
    this.controls.enableDamping = false;
    this.controls.update();
    this.camera.up.set(0, 1, 0);
    const distance = this.fittedDistance();
    this.framingDistance = distance;
    this.camera.position.set(0.18, -0.31, 1).normalize().multiplyScalar(distance);
    this.controls.target.set(0, 0, 0);
    this.camera.zoom = 1;
    this.camera.lookAt(0, 0, 0);
    this.resize();
    this.controls.update();
    this.controls.enableDamping = true;
  }
}
