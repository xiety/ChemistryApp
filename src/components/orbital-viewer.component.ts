import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild, effect, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrbitalMathService } from '../services/orbital-math.service';
import { OrbitalRenderingService } from '../services/orbital-rendering.service';
import { OrbitalStateService } from '../services/orbital-state.service';

@Component({
  selector: 'app-orbital-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './orbital-viewer.component.html',
  styleUrl: './orbital-viewer.component.css'
})
export class OrbitalViewerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('rendererContainer', { static: true }) container!: ElementRef<HTMLDivElement>;

  private stateService = inject(OrbitalStateService);
  private mathService = inject(OrbitalMathService);
  private renderService = inject(OrbitalRenderingService);

  ready = output<void>();

  private resizeObserver: ResizeObserver | null = null;
  private initTimeout: any;

  constructor() {
    effect(() => {
      if (this.stateService.showMesh()) {
        const state = this.stateService.currentState();
        const resolution = this.stateService.resolution();
        const threshold = this.stateService.surfaceThreshold();
        const data = this.mathService.generateData(state, resolution);
        this.renderService.updateData(data, resolution, threshold);
      }
    });

    effect(() => {
      this.syncSettings();
    });
  }

  ngAfterViewInit() {
    this.initTimeout = setTimeout(async () => {
      await this.initializeRenderer();
    }, 50);
  }

  private async initializeRenderer() {
    if (!this.container) return;

    const el = this.container.nativeElement;
    const width = el.clientWidth || 300;
    const height = el.clientHeight || 300;

    this.renderService.init(el, width, height);

    await this.renderService.precompileAsync();

    this.renderService.start();

    this.syncSettings();

    this.resizeObserver = new ResizeObserver(() => {
      if (this.container) {
        const element = this.container.nativeElement;
        this.renderService.resize(element.clientWidth, element.clientHeight);
      }
    });

    this.resizeObserver.observe(el);

    this.ready.emit();
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    clearTimeout(this.initTimeout);
  }

  private syncSettings() {
    this.renderService.updateSettings({
      state: this.stateService.currentState(),
      opacity: this.stateService.opacity(),
      glow: this.stateService.glow(),
      colorTheme: this.stateService.colorTheme(),
      showIsoLines: this.stateService.showIsoLines(),
      showCloud: this.stateService.showCloud(),
      showSurface: this.stateService.showSurface(),
      showMesh: this.stateService.showMesh(),
      wireframe: this.stateService.wireframe(),
      showStats: this.stateService.showStats(),
      contourDensity: this.stateService.contourDensity(),
      rotationSpeed: this.stateService.autoRotate() ? this.stateService.rotationSpeed() : 0,
      sliceX: this.stateService.sliceX(),
      sliceY: this.stateService.sliceY(),
      sliceZ: this.stateService.sliceZ(),
      threshold: this.stateService.surfaceThreshold(),
      dithering: this.stateService.dithering(),
      resolution: this.stateService.resolution(),
      rayStepCount: this.stateService.rayStepCount()
    });
  }
}
