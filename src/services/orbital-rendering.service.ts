import { Injectable, OnDestroy } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import Stats from 'three/addons/libs/stats.module.js';
import CustomShaderMaterial from 'three-custom-shader-material/vanilla';

import {
  VERTEX_SHADER,
  FRAGMENT_SHADER,
  CSM_VERTEX_CHUNK,
  CSM_FRAGMENT_CHUNK
} from '../shaders/orbital.shaders';

export interface RenderSettings {
  opacity: number;
  glow: number;
  colorTheme: number;
  showIsoLines: boolean;
  showCloud: boolean;
  showMesh: boolean;
  contourDensity: number;
  rotationSpeed: number;
  sliceX: number;
  sliceY: number;
  sliceZ: number;
  threshold: number;
}

const MAX_POLY_COUNT = 500000;
const INITIAL_RESOLUTION = 96;

const THEME_STD_POS = new THREE.Color(0x3399ff);
const THEME_STD_NEG = new THREE.Color(0xff3333);
const THEME_CYBER_POS = new THREE.Color(0x00ff99);
const THEME_CYBER_NEG = new THREE.Color(0xcc00ff);

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
  private volumeTexture!: THREE.Data3DTexture;
  private volMesh!: THREE.Mesh;

  private marchingCubes!: MarchingCubes;
  private meshMaterial!: CustomShaderMaterial<typeof THREE.MeshStandardMaterial>;

  private planeX = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1.0);
  private planeY = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.0);
  private planeZ = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1.0);

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
    this.camera.position.set(0, 0, 2.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });

    this.renderer.setSize(width, height);

    const pixelRatio = Math.min(window.devicePixelRatio, 2.0);
    this.renderer.setPixelRatio(pixelRatio);

    this.renderer.setClearColor(0x000000, 0);
    this.renderer.localClippingEnabled = true;

    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 20;
    this.controls.autoRotate = true;
    this.controls.enablePan = false;

    this.setupLights();
    this.setupVolumetricBox();
    this.setupMarchingCubes();

    this.isInitialized = true;
    this.animate();
  }

  private setupLights() {
    const ambLight = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(ambLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(5, 10, 7);
    this.scene.add(dirLight);

    const pointLight = new THREE.PointLight(0x60a5fa, 10.0, 20);
    pointLight.position.set(-5, -5, 5);
    this.scene.add(pointLight);
  }

  private setupVolumetricBox() {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const size = INITIAL_RESOLUTION;
    const initialData = new Float32Array(size * size * size);

    this.volumeTexture = new THREE.Data3DTexture(initialData, size, size, size);
    this.volumeTexture.format = THREE.RedFormat;
    this.volumeTexture.type = THREE.FloatType;
    this.volumeTexture.minFilter = THREE.LinearFilter;
    this.volumeTexture.magFilter = THREE.LinearFilter;
    this.volumeTexture.unpackAlignment = 1;
    this.volumeTexture.needsUpdate = true;

    this.volMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uVolume: { value: this.volumeTexture },
        uCameraPos: { value: this.camera.position },
        uIntensity: { value: 5.0 },
        uGlow: { value: 1.5 },
        uColorTheme: { value: 0 },
        uColorPos: { value: new THREE.Color().copy(THEME_STD_POS) },
        uColorNeg: { value: new THREE.Color().copy(THEME_STD_NEG) },
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

    this.volMesh = new THREE.Mesh(geometry, this.volMaterial);
    this.volMesh.renderOrder = -1;
    this.scene.add(this.volMesh);
  }

  private setupMarchingCubes() {
    this.meshMaterial = new CustomShaderMaterial<typeof THREE.MeshStandardMaterial>({
      baseMaterial: THREE.MeshStandardMaterial,
      vertexShader: CSM_VERTEX_CHUNK,
      fragmentShader: CSM_FRAGMENT_CHUNK,
      uniforms: {
        uVolume: { value: this.volumeTexture },
        uColorTheme: { value: 0 },
        uColorPos: { value: new THREE.Color().copy(THEME_STD_POS) },
        uColorNeg: { value: new THREE.Color().copy(THEME_STD_NEG) },
        uMeshOffset: { value: 0.0 }
      },
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      clippingPlanes: [this.planeX, this.planeY, this.planeZ],
      clipShadows: true
    });

    this.marchingCubes = new MarchingCubes(INITIAL_RESOLUTION, this.meshMaterial, true, false, MAX_POLY_COUNT);
    this.marchingCubes.scale.set(1.0, 1.0, 1.0);
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
      this.volumeTexture.unpackAlignment = 1;
      this.volumeTexture.needsUpdate = true;
      if (this.volMaterial) this.volMaterial.uniforms['uVolume'].value = this.volumeTexture;
      if (this.meshMaterial && this.meshMaterial.uniforms) this.meshMaterial.uniforms['uVolume'].value = this.volumeTexture;
    } else {
      this.volumeTexture.image.data = data;
      this.volumeTexture.needsUpdate = true;
    }

    if (this.marchingCubes) {
      this.marchingCubes.init(res);
      const offset = 1.0 / res;
      this.marchingCubes.position.set(offset, offset, offset);

      if (this.meshMaterial && this.meshMaterial.uniforms) {
        this.meshMaterial.uniforms['uMeshOffset'].value = offset;
      }

      const field = this.marchingCubes.field;
      for (let i = 0; i < data.length; i++) {
        field[i] = Math.abs(data[i]);
      }
      this.marchingCubes.isolation = threshold;
      this.marchingCubes.update();
    }
  }

  updateSettings(s: RenderSettings) {
    if (!this.isInitialized) return;

    const isCyber = s.colorTheme === 1;
    const cPos = isCyber ? THEME_CYBER_POS : THEME_STD_POS;
    const cNeg = isCyber ? THEME_CYBER_NEG : THEME_STD_NEG;

    const updateMaterial = (mat: THREE.ShaderMaterial | CustomShaderMaterial<any>) => {
      if (mat && mat.uniforms) {
        mat.uniforms['uColorTheme'].value = s.colorTheme;
        mat.uniforms['uColorPos'].value.copy(cPos);
        mat.uniforms['uColorNeg'].value.copy(cNeg);
      }
    };

    if (this.volMaterial) {
      updateMaterial(this.volMaterial);
      this.volMaterial.uniforms['uIntensity'].value = s.opacity * 10.0;
      this.volMaterial.uniforms['uGlow'].value = s.glow;
      this.volMaterial.uniforms['uIsoLines'].value = s.showIsoLines ? 1.0 : 0.0;
      this.volMaterial.uniforms['uShowCloud'].value = s.showCloud ? 1.0 : 0.0;
      this.volMaterial.uniforms['uContourFreq'].value = s.contourDensity;
      this.volMaterial.uniforms['uSliceX'].value = s.sliceX;
      this.volMaterial.uniforms['uSliceY'].value = s.sliceY;
      this.volMaterial.uniforms['uSliceZ'].value = s.sliceZ;
    }

    this.planeX.constant = s.sliceX;
    this.planeY.constant = s.sliceY;
    this.planeZ.constant = s.sliceZ;

    if (this.meshMaterial) {
      updateMaterial(this.meshMaterial);
      this.meshMaterial.opacity = Math.max(0.1, s.opacity);
      this.meshMaterial.transparent = s.opacity < 0.95;
    }

    if (this.marchingCubes) {
      if (Math.abs(this.marchingCubes.isolation - s.threshold) > 0.001) {
        this.marchingCubes.isolation = s.threshold;
        this.marchingCubes.update();
      }
    }

    if (Math.abs(s.rotationSpeed) > 0.01) {
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = s.rotationSpeed * 5.0;
    } else {
      this.controls.autoRotate = false;
    }

    const isVolVisible = s.showCloud || s.showIsoLines;
    if (this.volMesh) this.volMesh.visible = isVolVisible;

    if (this.marchingCubes) {
      this.marchingCubes.visible = s.showMesh;
    }
  }

  resize(width: number, height: number) {
    if (!this.isInitialized) return;

    this.renderer.setSize(width, height);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    if (this.stats) this.stats.update();
    if (this.controls) this.controls.update();

    if (this.volMaterial && this.volMesh.visible) {
      this.volMaterial.uniforms['uCameraPos'].value.copy(this.camera.position);
    }

    this.renderer.render(this.scene, this.camera);
  };

  ngOnDestroy() {
    cancelAnimationFrame(this.animationFrameId);
    if (this.renderer) this.renderer.dispose();
    if (this.volMaterial) this.volMaterial.dispose();
    if (this.volumeTexture) this.volumeTexture.dispose();
    if (this.meshMaterial) this.meshMaterial.dispose();
    if (this.stats) this.stats.dom.remove();
  }
}
