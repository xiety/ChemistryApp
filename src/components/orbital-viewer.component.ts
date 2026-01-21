import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild, effect, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrbitalMathService, QuantumState } from '../services/orbital-math.service';
import { OrbitalRenderingService, DEFAULT_SETTINGS, ColorTheme } from '../services/orbital-rendering.service';

@Component({
  selector: 'app-orbital-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="viewer-container">
      <div #rendererContainer class="renderer-target"></div>
    </div>
  `,
  styleUrl: './orbital-viewer.component.css'
})
export class OrbitalViewerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('rendererContainer', { static: true }) container!: ElementRef<HTMLDivElement>;

  state = input.required<QuantumState>();
  resolution = input.required<number>();

  showCloud = input<boolean>(DEFAULT_SETTINGS.showCloud);
  showIsoLines = input<boolean>(DEFAULT_SETTINGS.showIsoLines);
  showSurface = input<boolean>(DEFAULT_SETTINGS.showSurface);
  showMesh = input<boolean>(DEFAULT_SETTINGS.showMesh);
  showStats = input<boolean>(DEFAULT_SETTINGS.showStats);

  threshold = input<number>(DEFAULT_SETTINGS.threshold);
  opacity = input<number>(DEFAULT_SETTINGS.opacity);
  glow = input<number>(DEFAULT_SETTINGS.glow);
  colorTheme = input<ColorTheme>(DEFAULT_SETTINGS.colorTheme);
  contourDensity = input<number>(DEFAULT_SETTINGS.contourDensity);
  rotationSpeed = input<number>(DEFAULT_SETTINGS.rotationSpeed);

  sliceX = input<number>(DEFAULT_SETTINGS.sliceX);
  sliceY = input<number>(DEFAULT_SETTINGS.sliceY);
  sliceZ = input<number>(DEFAULT_SETTINGS.sliceZ);

  dithering = input<number>(DEFAULT_SETTINGS.dithering);
  rayStepCount = input<number>(DEFAULT_SETTINGS.rayStepCount);

  viewReady = signal(false);

  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private mathService: OrbitalMathService,
    private renderService: OrbitalRenderingService
  ) {

    effect(() => {
      if (!this.viewReady()) return;

      const state = this.state();
      const resolution = this.resolution();

      if (this.showMesh()) {
        const threshold = this.threshold();
        const data = this.mathService.generateData(state, resolution);
        this.renderService.updateData(data, resolution, threshold);
      }
    });

    effect(() => {
      if (!this.viewReady()) return;

      this.renderService.updateSettings({
        state: this.state(),
        opacity: this.opacity(),
        glow: this.glow(),
        colorTheme: this.colorTheme(),
        showIsoLines: this.showIsoLines(),
        showCloud: this.showCloud(),
        showSurface: this.showSurface(),
        showMesh: this.showMesh(),
        showStats: this.showStats(),
        contourDensity: this.contourDensity(),
        rotationSpeed: this.rotationSpeed(),
        sliceX: this.sliceX(),
        sliceY: this.sliceY(),
        sliceZ: this.sliceZ(),
        threshold: this.threshold(),
        dithering: this.dithering(),
        resolution: this.resolution(),
        rayStepCount: this.rayStepCount()
      });
    });
  }

  ngAfterViewInit() {
    const el = this.container.nativeElement;
    this.renderService.init(el, el.clientWidth || 300, el.clientHeight || 300);
    this.viewReady.set(true);

    this.resizeObserver = new ResizeObserver(() => {
      if (this.container && this.viewReady()) {
        const element = this.container.nativeElement;
        this.renderService.resize(element.clientWidth, element.clientHeight);
      }
    });

    this.resizeObserver.observe(el);
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
  }
}
