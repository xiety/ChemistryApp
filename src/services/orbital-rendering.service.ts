import { Injectable, OnDestroy, inject } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

import CustomShaderMaterial from 'three-custom-shader-material/vanilla';
import Stats from 'three/addons/libs/stats.module.js';
import { VERTEX_SHADER, FRAGMENT_SHADER } from '../shaders/orbital.shaders';
import { MESH_VERTEX_SHADER, MESH_FRAGMENT_SHADER } from '../shaders/csm.shaders';
import { OrbitalMathService, QuantumState } from './orbital-math.service';

THREE.ColorManagement.enabled = false;

export type ColorTheme = 0 | 1;

export interface RenderSettings {
  state: QuantumState;
  glow: number;
  colorTheme: ColorTheme;
  showIsoLines: boolean;
  showSurface: boolean;
  showCloud: boolean;
  showMesh: boolean;
  wireframe: boolean;
  showStats: boolean;
  contourDensity: number;
  rotationSpeed: number;
  sliceX: number;
  sliceY: number;
  sliceZ: number;
  threshold: number;
  dithering: number;
  resolution: number;
  opacity: number;
  rayStepCount: number;
}

export const DEFAULT_SETTINGS: RenderSettings = {
  state: { n: 2, l: 1, m: 0 },
  glow: 1.5,
  colorTheme: 0,
  showIsoLines: false,
  showSurface: false,
  showCloud: true,
  showMesh: false,
  wireframe: false,
  showStats: true,
  contourDensity: 50,
  rotationSpeed: 0.5,
  sliceX: 1.0,
  sliceY: 1.0,
  sliceZ: 1.0,
  threshold: 0.15,
  dithering: 0.0,
  resolution: 128,
  opacity: 1.0,
  rayStepCount: 96
};

@Injectable({
  providedIn: 'root'
})
export class OrbitalRenderingService implements OnDestroy {
  private mathService = inject(OrbitalMathService);
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;

  private stats!: Stats;
  private volMaterial!: THREE.ShaderMaterial;
  private volMesh!: THREE.Mesh;

  private marchingCubes?: MarchingCubes;
  private meshMaterial?: THREE.ShaderMaterial;
  private volumeTexture?: THREE.Data3DTexture;

  private gradientMaps: { [key: number]: THREE.DataTexture; } = {};
  private animationFrameId: number = 0;
  private isInitialized = false;
  private targetState: QuantumState = { n: 2, l: 1, m: 0 };
  private transitionStartTime = 0;
  private isTransitioning = false;
  private readonly transitionDuration = 1000;

  constructor() { }

  init(container: HTMLElement, width: number, height: number) {
    if (this.isInitialized) return;
    this.initStats(container);
    this.initScene(container, width, height);
    this.generateGradientMaps();
    this.setupLights();
    this.setupProceduralBox();
    this.isInitialized = true;
    this.resize(width, height);
  }

  start() {
    if (!this.animationFrameId) {
      this.animate();
    }
  }

  async precompileAsync() {
    if (this.renderer && this.scene && this.camera) {
      await this.renderer.compileAsync(this.scene, this.camera);
    }
  }

  private initStats(container: HTMLElement) {
    this.stats = new Stats();
    this.stats.dom.style.position = 'absolute';
    this.stats.dom.style.top = '10px';
    this.stats.dom.style.left = '10px';
    this.stats.dom.style.zIndex = '100';
    container.parentElement?.appendChild(this.stats.dom);
  }

  private initScene(container: HTMLElement, width: number, height: number) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 3);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance"
    });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 0;
    this.controls.maxDistance = 40;
    this.controls.autoRotate = true;
  }

  updateData(data: Float32Array, res: number, threshold: number) {
    if (!this.isInitialized) return;

    this.ensureMarchingCubes();

    const texture = this.volumeTexture!;
    const material = this.meshMaterial!;
    const cubes = this.marchingCubes!;

    if (texture.image.width !== res) {
      texture.dispose();
      this.volumeTexture = new THREE.Data3DTexture(data, res, res, res);
      this.volumeTexture.format = THREE.RedFormat;
      this.volumeTexture.type = THREE.FloatType;
      this.volumeTexture.minFilter = THREE.LinearFilter;
      this.volumeTexture.magFilter = THREE.LinearFilter;
      this.volumeTexture.needsUpdate = true;
      if (material.uniforms) {
        material.uniforms['uVolume'].value = this.volumeTexture;
      }
    } else {
      texture.image.data = data;
      texture.needsUpdate = true;
    }

    cubes.init(res);

    const meshOffset = 1.0 / res;
    cubes.position.set(meshOffset, meshOffset, meshOffset);
    const texOffset = 0.5 / res;

    if (material.uniforms) {
      material.uniforms['uTexOffset'].value = texOffset;
    }

    const field = cubes.field;

    for (let i = 0; i < data.length; i++) {
      field[i] = Math.abs(data[i]);
    }

    cubes.isolation = threshold;
    cubes.update();
  }

  updateSettings(s: RenderSettings) {
    if (!this.isInitialized || !this.volMaterial) return;
    this.updateStateLogic(s.state);
    this.updateUniforms(s);
    this.updateMeshVisibility(s);
    this.updateControls(s.rotationSpeed);

    if (this.stats) {
      this.stats.dom.style.display = s.showStats ? 'block' : 'none';
    }
  }

  private updateStateLogic(newState: QuantumState) {
    if (newState.n !== this.targetState.n ||
      newState.l !== this.targetState.l ||
      newState.m !== this.targetState.m) {
      const u = this.volMaterial.uniforms;
      u['uPrevN'].value = u['uN'].value;
      u['uPrevL'].value = u['uL'].value;
      u['uPrevM'].value = u['uM'].value;
      u['uPrevScale'].value = u['uScale'].value;
      u['uPrevRadNorm'].value = u['uRadNorm'].value;
      u['uPrevAngNorm'].value = u['uAngNorm'].value;
      this.targetState = { ...newState };
      const norms = this.mathService.getNormalizationConstants(this.targetState);
      u['uN'].value = this.targetState.n;
      u['uL'].value = this.targetState.l;
      u['uM'].value = this.targetState.m;
      u['uScale'].value = norms.boxScale;
      u['uRadNorm'].value = norms.radNorm;
      u['uAngNorm'].value = norms.angNorm;
      u['uMix'].value = 0.0;
      this.transitionStartTime = performance.now();
      this.isTransitioning = true;
    }
  }

  private updateUniforms(s: RenderSettings) {
    const u = this.volMaterial.uniforms;
    const map = this.gradientMaps[s.colorTheme] || this.gradientMaps[0];
    const useAbs = s.colorTheme === 0 ? 0.0 : 1.0;

    u['uGlow'].value = s.glow;
    u['uGradientMap'].value = map;
    u['uUseAbsoluteVal'].value = useAbs;
    u['uIsoLines'].value = s.showIsoLines ? 1.0 : 0.0;
    u['uShowCloud'].value = s.showCloud ? 1.0 : 0.0;
    u['uShowSurface'].value = s.showSurface ? 1.0 : 0.0;
    u['uContourFreq'].value = s.contourDensity;
    u['uSliceX'].value = s.sliceX;
    u['uSliceY'].value = s.sliceY;
    u['uSliceZ'].value = s.sliceZ;
    u['uDithering'].value = s.dithering;
    u['uThreshold'].value = s.threshold;
    u['uOpacity'].value = s.opacity;
    u['uRaySteps'].value = s.rayStepCount;

    if (this.meshMaterial && this.meshMaterial.uniforms) {
      this.meshMaterial.uniforms['uGradientMap'].value = map;
      this.meshMaterial.uniforms['uUseAbsoluteVal'].value = useAbs;
      this.meshMaterial.uniforms['uSliceX'].value = s.sliceX;
      this.meshMaterial.uniforms['uSliceY'].value = s.sliceY;
      this.meshMaterial.uniforms['uSliceZ'].value = s.sliceZ;
      this.meshMaterial.opacity = s.opacity;
      this.meshMaterial.wireframe = s.wireframe;
    }
  }

  private updateMeshVisibility(s: RenderSettings) {
    const showVol = s.showCloud || s.showIsoLines || s.showSurface;
    this.volMesh.visible = showVol;

    if (s.showMesh) {
      this.ensureMarchingCubes();
    }

    if (this.marchingCubes) {
      this.marchingCubes.visible = s.showMesh;
      if (Math.abs(this.marchingCubes.isolation - s.threshold) > 0.001) {
        this.marchingCubes.isolation = s.threshold;
        if (s.showMesh) this.marchingCubes.update();
      }
    }
  }

  private updateControls(speed: number) {
    if (Math.abs(speed) > 0.01) {
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = speed * 5.0;
    } else {
      this.controls.autoRotate = false;
    }
  }

  resize(width: number, height: number) {
    if (!this.isInitialized) return;
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private generateGradientMaps() {
    this.gradientMaps[0] = this.createCanvasGradient([
      { offset: 0.00, color: '#ff3232' },
      { offset: 0.50, color: '#ff3232' },
      { offset: 0.50, color: '#3296ff' },
      { offset: 1.00, color: '#3296ff' },
    ], THREE.NearestFilter);

    this.gradientMaps[1] = this.createCanvasGradient([
      { offset: 0.0, color: '#000000' },
      { offset: 0.3, color: '#aa0000' },
      { offset: 0.6, color: '#ffcc00' },
      { offset: 1.0, color: '#ffffff' },
    ], THREE.LinearFilter);
  }

  private createCanvasGradient(stops: { offset: number; color: string; }[], filter: THREE.MagnificationTextureFilter): THREE.DataTexture {
    const width = 256;
    const height = 1;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    stops.forEach(stop => gradient.addColorStop(stop.offset, stop.color));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const tex = new THREE.DataTexture(new Uint8Array(imageData.data), width, height, THREE.RGBAFormat);
    tex.needsUpdate = true;
    tex.minFilter = filter;
    tex.magFilter = filter;
    return tex;
  }

  private setupLights() {
    const ambLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 3.0);
    dirLight.position.set(5, 10, 7);
    this.scene.add(dirLight);

    const pointLight = new THREE.PointLight(0xffffff, 5.0, 20);
    pointLight.position.set(-5, -5, 5);
    this.scene.add(pointLight);
  }

  private setupProceduralBox() {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const initialNorms = this.mathService.getNormalizationConstants({ n: 2, l: 1, m: 0 });

    this.volMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uCameraPos: { value: this.camera.position },
        uGlow: { value: DEFAULT_SETTINGS.glow },
        uGradientMap: { value: this.gradientMaps[0] },
        uUseAbsoluteVal: { value: 0.0 },
        uIsoLines: { value: 0.0 },
        uShowCloud: { value: 1.0 },
        uShowSurface: { value: 0.0 },
        uContourFreq: { value: DEFAULT_SETTINGS.contourDensity },
        uSliceX: { value: DEFAULT_SETTINGS.sliceX },
        uSliceY: { value: DEFAULT_SETTINGS.sliceY },
        uSliceZ: { value: DEFAULT_SETTINGS.sliceZ },
        uDithering: { value: DEFAULT_SETTINGS.dithering },
        uThreshold: { value: DEFAULT_SETTINGS.threshold },
        uOpacity: { value: DEFAULT_SETTINGS.opacity },
        uRaySteps: { value: DEFAULT_SETTINGS.rayStepCount },
        uN: { value: 2 },
        uL: { value: 1 },
        uM: { value: 0 },
        uScale: { value: initialNorms.boxScale },
        uRadNorm: { value: initialNorms.radNorm },
        uAngNorm: { value: initialNorms.angNorm },
        uPrevN: { value: 2 },
        uPrevL: { value: 1 },
        uPrevM: { value: 0 },
        uPrevScale: { value: initialNorms.boxScale },
        uPrevRadNorm: { value: initialNorms.radNorm },
        uPrevAngNorm: { value: initialNorms.angNorm },
        uMix: { value: 1.0 }
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor
    });

    this.volMesh = new THREE.Mesh(geometry, this.volMaterial);
    this.volMesh.renderOrder = -1;
    this.scene.add(this.volMesh);
  }

  private ensureMarchingCubes() {
    if (this.marchingCubes) return;
    this.setupMarchingCubes();
  }

  private setupMarchingCubes() {
    const size = DEFAULT_SETTINGS.resolution;
    const data = new Float32Array(size * size * size);

    this.volumeTexture = new THREE.Data3DTexture(data, size, size, size);
    this.volumeTexture.format = THREE.RedFormat;
    this.volumeTexture.type = THREE.FloatType;
    this.volumeTexture.minFilter = THREE.LinearFilter;
    this.volumeTexture.magFilter = THREE.LinearFilter;
    this.volumeTexture.needsUpdate = true;

    this.meshMaterial = new CustomShaderMaterial({
      baseMaterial: THREE.MeshStandardMaterial,
      vertexShader: MESH_VERTEX_SHADER,
      fragmentShader: MESH_FRAGMENT_SHADER,
      uniforms: {
        uGradientMap: { value: this.gradientMaps[0] },
        uUseAbsoluteVal: { value: 0.0 },
        uVolume: { value: this.volumeTexture },
        uTexOffset: { value: 0.0 },
        uSliceX: { value: 1.0 },
        uSliceY: { value: 1.0 },
        uSliceZ: { value: 1.0 }
      },
      metalness: 0.0,
      roughness: 0.5,
      transparent: true,
      depthWrite: true,
      opacity: DEFAULT_SETTINGS.opacity,
      side: THREE.DoubleSide,
      flatShading: false,
      wireframe: DEFAULT_SETTINGS.wireframe
    }) as THREE.Material as THREE.ShaderMaterial;

    this.marchingCubes = new MarchingCubes(size, this.meshMaterial, false, false, 200000);
    this.marchingCubes.visible = false;
    this.marchingCubes.renderOrder = 1;

    this.scene.add(this.marchingCubes);
  }

  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    if (this.isTransitioning && this.volMaterial) {
      const now = performance.now();
      const progress = (now - this.transitionStartTime) / this.transitionDuration;
      if (progress >= 1.0) {
        this.volMaterial.uniforms['uMix'].value = 1.0;
        this.isTransitioning = false;
      } else {
        this.volMaterial.uniforms['uMix'].value = progress;
      }
    }

    if (this.stats) this.stats.update();

    if (this.controls) this.controls.update();

    if (this.volMaterial) {
      this.volMaterial.uniforms['uCameraPos'].value.copy(this.camera.position);
    }

    this.renderer.render(this.scene, this.camera);
  };

  ngOnDestroy() {
    cancelAnimationFrame(this.animationFrameId);
    if (this.renderer) this.renderer.dispose();
    if (this.volMaterial) this.volMaterial.dispose();
    if (this.meshMaterial) this.meshMaterial.dispose();
    if (this.volumeTexture) this.volumeTexture.dispose();
    if (this.stats) this.stats.dom.remove();
    Object.values(this.gradientMaps).forEach(t => t.dispose());
  }
}
