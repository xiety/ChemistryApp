import { Injectable, OnDestroy } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import CustomShaderMaterial from 'three-custom-shader-material/vanilla';
import Stats from 'three/addons/libs/stats.module.js';

import {
  VERTEX_SHADER,
  FRAGMENT_SHADER,
  CSM_VERTEX_CHUNK,
  CSM_FRAGMENT_CHUNK
} from '../shaders/orbital.shaders';

THREE.ColorManagement.enabled = false;

const THEME_STD_POS = new THREE.Color(0x3399ff);
const THEME_STD_NEG = new THREE.Color(0xff3333);
const THEME_CYBER_POS = new THREE.Color(0x00ff99);
const THEME_CYBER_NEG = new THREE.Color(0xcc00ff);

export interface RenderSettings {
  n: number;
  l: number;
  m: number;
  glow: number;
  colorTheme: number;
  showIsoLines: boolean;
  showSurface: boolean;
  showCloud: boolean;
  showMesh: boolean;
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
  n: 2, l: 1, m: 0,
  glow: 2.0,
  colorTheme: 0,
  showIsoLines: false,
  showSurface: false,
  showCloud: true,
  showMesh: false,
  showStats: true,
  contourDensity: 50,
  rotationSpeed: 0.5,
  sliceX: 1.0,
  sliceY: 1.0,
  sliceZ: 1.0,
  threshold: 0.15,
  dithering: 0.0,
  resolution: 96,
  opacity: 1.0,
  rayStepCount: 128
};

@Injectable({
  providedIn: 'root'
})
export class OrbitalRenderingService implements OnDestroy {

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private stats!: Stats;

  private volMaterial!: THREE.ShaderMaterial;
  private volMesh!: THREE.Mesh;

  private marchingCubes!: MarchingCubes;
  private meshMaterial!: CustomShaderMaterial<typeof THREE.MeshPhysicalMaterial>;
  private volumeTexture!: THREE.Data3DTexture;

  private animationFrameId: number = 0;
  private isInitialized = false;

  constructor() { }

  init(container: HTMLElement, width: number, height: number) {
    if (this.isInitialized) return;

    this.stats = new Stats();
    this.stats.dom.style.position = 'absolute';
    this.stats.dom.style.top = '10px';
    this.stats.dom.style.left = '10px';
    this.stats.dom.style.zIndex = '100';
    container.parentElement?.appendChild(this.stats.dom);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 3);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 30;
    this.controls.autoRotate = true;

    this.setupLights();
    this.setupProceduralBox();
    this.setupMarchingCubes();

    this.isInitialized = true;

    this.resize(width, height);
    this.animate();
  }

  private setupLights() {
    const ambLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(5, 10, 7);
    this.scene.add(dirLight);

    const pointLight = new THREE.PointLight(0x60a5fa, 10.0, 20);
    pointLight.position.set(-5, -5, 5);
    this.scene.add(pointLight);
  }

  private setupProceduralBox() {
    const geometry = new THREE.BoxGeometry(2, 2, 2);

    this.volMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uCameraPos: { value: this.camera.position },
        uGlow: { value: DEFAULT_SETTINGS.glow },
        uColorTheme: { value: DEFAULT_SETTINGS.colorTheme },

        uColorPos: { value: THEME_STD_POS.clone() },
        uColorNeg: { value: THEME_STD_NEG.clone() },

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
        uM: { value: 0 }
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.volMesh = new THREE.Mesh(geometry, this.volMaterial);
    this.volMesh.renderOrder = -1;
    this.scene.add(this.volMesh);
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

    this.meshMaterial = new CustomShaderMaterial<typeof THREE.MeshPhysicalMaterial>({
      baseMaterial: THREE.MeshPhysicalMaterial,
      vertexShader: CSM_VERTEX_CHUNK,
      fragmentShader: CSM_FRAGMENT_CHUNK,
      uniforms: {
        uColorTheme: { value: 0 },
        uColorPos: { value: THEME_STD_POS.clone() },
        uColorNeg: { value: THEME_STD_NEG.clone() },
        uVolume: { value: this.volumeTexture },
        uTexOffset: { value: 0.0 },
        uSliceX: { value: 1.0 },
        uSliceY: { value: 1.0 },
        uSliceZ: { value: 1.0 }
      },
      metalness: 0.0,
      roughness: 1.0,
      transmission: 0.0,
      transparent: true,
      depthWrite: true,
      opacity: DEFAULT_SETTINGS.opacity,
      side: THREE.DoubleSide,
      flatShading: false
    });

    this.marchingCubes = new MarchingCubes(size, this.meshMaterial, true, true, 200000);
    this.marchingCubes.enableUvs = false;
    this.marchingCubes.enableColors = false;
    this.marchingCubes.visible = false;
    this.marchingCubes.renderOrder = 1;

    this.scene.add(this.marchingCubes);
  }

  updateData(data: Float32Array, res: number, threshold: number) {
    if (!this.isInitialized) return;

    if (this.volumeTexture.image.width !== res) {
      this.volumeTexture.dispose();
      this.volumeTexture = new THREE.Data3DTexture(data, res, res, res);
      this.volumeTexture.format = THREE.RedFormat;
      this.volumeTexture.type = THREE.FloatType;
      this.volumeTexture.minFilter = THREE.LinearFilter;
      this.volumeTexture.magFilter = THREE.LinearFilter;

      if (this.meshMaterial.uniforms) {
        this.meshMaterial.uniforms['uVolume'].value = this.volumeTexture;
      }
    } else {
      this.volumeTexture.image.data = data;
    }
    this.volumeTexture.needsUpdate = true;

    this.marchingCubes.init(res);

    const meshOffset = 1.0 / res;
    this.marchingCubes.position.set(meshOffset, meshOffset, meshOffset);

    const texOffset = 0.5 / res;

    if (this.meshMaterial.uniforms) {
      this.meshMaterial.uniforms['uTexOffset'].value = texOffset;
    }

    const field = this.marchingCubes.field;
    for (let i = 0; i < data.length; i++) {
      field[i] = Math.abs(data[i]);
    }

    this.marchingCubes.isolation = threshold;
    this.marchingCubes.update();
  }

  updateSettings(s: RenderSettings) {
    if (!this.isInitialized || !this.volMaterial) return;

    const u = this.volMaterial.uniforms;
    u['uN'].value = s.n;
    u['uL'].value = s.l;
    u['uM'].value = s.m;
    u['uGlow'].value = s.glow;
    u['uColorTheme'].value = s.colorTheme;

    const colorPos = (s.colorTheme === 1) ? THEME_CYBER_POS : THEME_STD_POS;
    const colorNeg = (s.colorTheme === 1) ? THEME_CYBER_NEG : THEME_STD_NEG;

    u['uColorPos'].value.copy(colorPos);
    u['uColorNeg'].value.copy(colorNeg);
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

    const showVol = s.showCloud || s.showIsoLines || s.showSurface;
    this.volMesh.visible = showVol;

    if (this.marchingCubes) {
      this.marchingCubes.visible = s.showMesh;
      this.meshMaterial.opacity = s.opacity;

      if (this.meshMaterial.uniforms) {
        this.meshMaterial.uniforms['uColorTheme'].value = s.colorTheme;
        this.meshMaterial.uniforms['uColorPos'].value.copy(colorPos);
        this.meshMaterial.uniforms['uColorNeg'].value.copy(colorNeg);
        this.meshMaterial.uniforms['uSliceX'].value = s.sliceX;
        this.meshMaterial.uniforms['uSliceY'].value = s.sliceY;
        this.meshMaterial.uniforms['uSliceZ'].value = s.sliceZ;
      }

      if (Math.abs(this.marchingCubes.isolation - s.threshold) > 0.001) {
        this.marchingCubes.isolation = s.threshold;
        if (s.showMesh) this.marchingCubes.update();
      }
    }

    if (Math.abs(s.rotationSpeed) > 0.01) {
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = s.rotationSpeed * 5.0;
    } else {
      this.controls.autoRotate = false;
    }

    if (this.stats) {
      this.stats.dom.style.display = s.showStats ? 'block' : 'none';
    }
  }

  resize(width: number, height: number) {
    if (!this.isInitialized) return;

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);

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
  }
}
