import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild, effect, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OrbitalMathService } from '../services/orbital-math.service';
import { VERTEX_SHADER, FRAGMENT_SHADER } from '../shaders/orbital.shaders';

@Component({
  selector: 'app-orbital-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="viewer-container">
      <div #rendererContainer class="renderer-target"></div>
      
      @if (isLoading()) {
        <div class="loading-pill">
          <div class="spinner"></div>
          <span>Calculating...</span>
        </div>
      }
    </div>
  `,
  styleUrl: './orbital-viewer.component.css'
})
export class OrbitalViewerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('rendererContainer', { static: true }) container!: ElementRef<HTMLDivElement>;

  n = input.required<number>();
  l = input.required<number>();
  m = input.required<number>();
  resolution = input.required<number>();

  opacity = input<number>(0.5);
  glow = input<number>(1.5);
  colorTheme = input<number>(0);
  showIsoLines = input<boolean>(false);
  showCloud = input<boolean>(true);
  contourDensity = input<number>(100.0);
  rotationSpeed = input<number>(0);

  sliceX = input<number>(1.0);
  sliceY = input<number>(1.0);
  sliceZ = input<number>(1.0);

  isLoading = signal(false);

  private viewReady = signal(false);

  private isCalculating = false;
  private pendingRequest: { n: number, l: number, m: number, res: number; } | null = null;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private material!: THREE.ShaderMaterial;
  private volumeTexture!: THREE.Data3DTexture;
  private orbitalMesh!: THREE.Mesh;
  private animationFrameId: number = 0;

  constructor(private mathService: OrbitalMathService) {
    effect(() => {
      if (!this.viewReady()) return;

      const nVal = this.n();
      const lVal = this.l();
      const mVal = this.m();
      const resVal = this.resolution();

      this.queueLoad(nVal, lVal, mVal, resVal);
    });

    effect(() => {
      if (!this.viewReady() || !this.material) return;

      this.material.uniforms['uIntensity'].value = this.opacity() * 10.0;
      this.material.uniforms['uGlow'].value = this.glow();
      this.material.uniforms['uColorTheme'].value = this.colorTheme();
      this.material.uniforms['uIsoLines'].value = this.showIsoLines() ? 1.0 : 0.0;
      this.material.uniforms['uShowCloud'].value = this.showCloud() ? 1.0 : 0.0;
      this.material.uniforms['uContourFreq'].value = this.contourDensity();
      this.material.uniforms['uSliceX'].value = this.sliceX();
      this.material.uniforms['uSliceY'].value = this.sliceY();
      this.material.uniforms['uSliceZ'].value = this.sliceZ();

      if (this.controls) {
        const speed = this.rotationSpeed();
        if (Math.abs(speed) > 0.01) {
          this.controls.autoRotate = true;
          this.controls.autoRotateSpeed = speed * 5.0;
        } else {
          this.controls.autoRotate = false;
        }
      }
    });
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.initThree();
      this.animate();
      window.addEventListener('resize', this.onResize);
      this.viewReady.set(true);
    }, 0);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.onResize);
    cancelAnimationFrame(this.animationFrameId);

    if (this.renderer) this.renderer.dispose();
    if (this.material) this.material.dispose();
    if (this.volumeTexture) this.volumeTexture.dispose();
  }

  private initThree() {
    const width = this.container.nativeElement.clientWidth || 300;
    const height = this.container.nativeElement.clientHeight || 300;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 3.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x000000, 0);
    this.container.nativeElement.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 20;
    this.controls.autoRotate = true;
    this.controls.enablePan = false;

    const geometry = new THREE.BoxGeometry(2, 2, 2);

    const size = 32;
    const initialData = new Float32Array(size * size * size);

    this.volumeTexture = new THREE.Data3DTexture(initialData, size, size, size);
    this.volumeTexture.format = THREE.RedFormat;
    this.volumeTexture.type = THREE.FloatType;
    this.volumeTexture.minFilter = THREE.LinearFilter;
    this.volumeTexture.magFilter = THREE.LinearFilter;
    this.volumeTexture.unpackAlignment = 1;
    this.volumeTexture.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uVolume: { value: this.volumeTexture },
        uCameraPos: { value: this.camera.position },
        uIntensity: { value: 5.0 },
        uGlow: { value: 1.5 },
        uColorTheme: { value: 0 },
        uIsoLines: { value: 0.0 },
        uShowCloud: { value: 1.0 },
        uContourFreq: { value: 100.0 },
        uSliceX: { value: 1.0 },
        uSliceY: { value: 1.0 },
        uSliceZ: { value: 1.0 }
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.orbitalMesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.orbitalMesh);
  }

  private queueLoad(n: number, l: number, m: number, res: number) {
    this.pendingRequest = { n, l, m, res };
    if (!this.isCalculating) {
      this.processQueue();
    }
  }

  private async processQueue() {
    if (!this.pendingRequest) {
      this.isCalculating = false;
      this.isLoading.set(false);
      return;
    }

    this.isCalculating = true;
    this.isLoading.set(true);

    await new Promise(resolve => setTimeout(resolve, 10));

    const req = this.pendingRequest;
    this.pendingRequest = null;

    if (!req) {
      this.processQueue();
      return;
    }

    try {
      const data = await this.mathService.generateVolumeData(req.n, req.l, req.m, req.res);

      if (this.volumeTexture) {
        if (this.volumeTexture.image.width !== req.res) {
          this.volumeTexture.dispose();
          this.volumeTexture = new THREE.Data3DTexture(data, req.res, req.res, req.res);
          this.volumeTexture.format = THREE.RedFormat;
          this.volumeTexture.type = THREE.FloatType;
          this.volumeTexture.minFilter = THREE.LinearFilter;
          this.volumeTexture.magFilter = THREE.LinearFilter;
          this.volumeTexture.unpackAlignment = 1;
          this.volumeTexture.needsUpdate = true;
          if (this.material) this.material.uniforms['uVolume'].value = this.volumeTexture;
        } else {
          this.volumeTexture.image.data = data;
          this.volumeTexture.needsUpdate = true;
        }
      }
    } catch (e) {
      console.error("Volume generation failed", e);
    }

    this.processQueue();
  }

  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    if (this.controls) this.controls.update();
    if (this.material) {
      this.material.uniforms['uCameraPos'].value.copy(this.camera.position);
    }
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = () => {
    if (!this.container) return;
    const width = this.container.nativeElement.clientWidth;
    const height = this.container.nativeElement.clientHeight;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };
}
