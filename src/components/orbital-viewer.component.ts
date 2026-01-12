import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild, effect, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrbitalMathService } from '../services/orbital-math.service';
import { OrbitalRenderingService } from '../services/orbital-rendering.service';

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

  showCloud = input<boolean>(true);
  showIsoLines = input<boolean>(false);
  showMesh = input<boolean>(false);
  showStats = input<boolean>(true);

  threshold = input<number>(0.2);
  opacity = input<number>(0.5);
  glow = input<number>(1.5);
  colorTheme = input<number>(0);
  contourDensity = input<number>(100.0);
  rotationSpeed = input<number>(0);

  sliceX = input<number>(1.0);
  sliceY = input<number>(1.0);
  sliceZ = input<number>(1.0);

  isLoading = signal(false);
  viewReady = signal(false);

  private isCalculating = false;
  private pendingRequest: { n: number, l: number, m: number, res: number; } | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private mathService: OrbitalMathService,
    private renderService: OrbitalRenderingService
  ) {
    effect(() => {
      if (!this.viewReady()) return;
      this.queueLoad(this.n(), this.l(), this.m(), this.resolution());
    });

    effect(() => {
      if (!this.viewReady()) return;

      this.renderService.updateSettings({
        opacity: this.opacity(),
        glow: this.glow(),
        colorTheme: this.colorTheme(),
        showIsoLines: this.showIsoLines(),
        showCloud: this.showCloud(),
        showMesh: this.showMesh(),
        showStats: this.showStats(),
        contourDensity: this.contourDensity(),
        rotationSpeed: this.rotationSpeed(),
        sliceX: this.sliceX(),
        sliceY: this.sliceY(),
        sliceZ: this.sliceZ(),
        threshold: this.threshold()
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

    await new Promise(resolve => requestAnimationFrame(resolve));

    const req = this.pendingRequest;
    this.pendingRequest = null;

    if (!req) {
      this.processQueue();
      return;
    }

    const data = await this.mathService.generateVolumeData(req.n, req.l, req.m, req.res);
    this.renderService.updateData(data, req.res, this.threshold());

    this.processQueue();
  }
}
