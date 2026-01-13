import { Component, signal, computed, effect, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrbitalViewerComponent } from './components/orbital-viewer.component';
import { SliderComponent } from './components/slider.component';
import { SwitchComponent } from './components/switch.component';
import { OrbitalMathService, OrbitalPreset, OrbitalGroup, ORBITAL_LABELS } from './services/orbital-math.service';
import { DEFAULT_SETTINGS } from './services/orbital-rendering.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, OrbitalViewerComponent, SliderComponent, SwitchComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  @ViewChild(OrbitalViewerComponent) viewer!: OrbitalViewerComponent;

  n = signal(2);
  l = signal(1);
  m = signal(0);

  resolution = signal(DEFAULT_SETTINGS.resolution);
  opacity = signal(DEFAULT_SETTINGS.opacity);
  glow = signal(DEFAULT_SETTINGS.glow);

  rotationSpeed = signal(DEFAULT_SETTINGS.rotationSpeed);
  autoRotate = signal(true);

  colorTheme = signal(DEFAULT_SETTINGS.colorTheme);
  dithering = signal(DEFAULT_SETTINGS.dithering);

  showCloud = signal(DEFAULT_SETTINGS.showCloud);
  showIsoLines = signal(DEFAULT_SETTINGS.showIsoLines);
  showMesh = signal(DEFAULT_SETTINGS.showMesh);
  showStats = signal(DEFAULT_SETTINGS.showStats);

  surfaceThreshold = signal(DEFAULT_SETTINGS.threshold);

  sliceX = signal(DEFAULT_SETTINGS.sliceX);
  sliceY = signal(DEFAULT_SETTINGS.sliceY);
  sliceZ = signal(DEFAULT_SETTINGS.sliceZ);

  contourDensity = signal(DEFAULT_SETTINGS.contourDensity);

  showControls = signal(true);
  activeTab = signal<'orbitals' | 'rendering'>('orbitals');
  isFullscreen = signal(false);

  orbitalGroups: OrbitalGroup[] = [];

  orbitalLabel = computed(() => {
    const n = this.n();
    const l = this.l();
    const lChar = ORBITAL_LABELS[l] || '?';
    return `${n}${lChar}`;
  });

  subOrbitalLabel = computed(() => {
    const l = this.l();
    const m = this.m();
    if (l === 0) return '';
    return `m = ${m}`;
  });

  lName = computed(() => ORBITAL_LABELS[this.l()] || '?');

  constructor(private mathService: OrbitalMathService) {
    this.orbitalGroups = this.mathService.getOrbitalGroups();

    effect(() => {
      const maxL = this.n() - 1;
      if (this.l() > maxL) {
        this.l.set(maxL);
      }
      if (this.m() < 0) {
        this.m.set(0);
      }
      if (this.m() > this.l()) {
        this.m.set(this.l());
      }
    });

    document.addEventListener('fullscreenchange', () => {
      this.isFullscreen.set(!!document.fullscreenElement);
    });
  }

  formatInt = (v: number) => v.toFixed(0);
  formatFloat1 = (v: number) => v.toFixed(1);
  formatFloat2 = (v: number) => v.toFixed(2);
  formatPercent = (v: number) => (v * 100).toFixed(0) + '%';
  formatResolution = (v: number) => v + '³';

  formatL = (v: number) => {
    const label = ORBITAL_LABELS[v] || '?';
    return `${v} (${label})`;
  };

  selectPreset(p: OrbitalPreset) {
    this.n.set(p.n);
    this.l.set(p.l);
    this.m.set(p.m);
  }

  isPresetActive(p: OrbitalPreset) {
    return this.n() === p.n && this.l() === p.l && this.m() === p.m;
  }

  toggleControls() {
    this.showControls.update(v => !v);
  }

  toggleFullScreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error enabling full-screen mode: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  toggleCloud() {
    this.showCloud.update(v => !v);
  }

  toggleIsoLines() {
    this.showIsoLines.update(v => !v);
  }

  toggleMesh() {
    this.showMesh.update(v => !v);
  }

  toggleStats(val: boolean) {
    this.showStats.set(val);
  }
}
