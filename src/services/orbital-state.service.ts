import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { OrbitalMathService, OrbitalGroup, QuantumState, ORBITAL_LABELS, OrbitalPreset } from './orbital-math.service';
import { DEFAULT_SETTINGS, ColorTheme } from './orbital-rendering.service';

@Injectable({
    providedIn: 'root'
})
export class OrbitalStateService {
    private mathService = inject(OrbitalMathService);

    n = signal(2);
    l = signal(1);
    m = signal(0);

    currentState = computed<QuantumState>(() => ({
        n: this.n(),
        l: this.l(),
        m: this.m()
    }));

    resolution = signal(DEFAULT_SETTINGS.resolution);
    glow = signal(DEFAULT_SETTINGS.glow);
    opacity = signal(DEFAULT_SETTINGS.opacity);
    rayStepCount = signal(DEFAULT_SETTINGS.rayStepCount);
    surfaceThreshold = signal(DEFAULT_SETTINGS.threshold);
    dithering = signal(DEFAULT_SETTINGS.dithering);
    colorTheme = signal<ColorTheme>(DEFAULT_SETTINGS.colorTheme);
    showCloud = signal(DEFAULT_SETTINGS.showCloud);
    showIsoLines = signal(DEFAULT_SETTINGS.showIsoLines);
    showSurface = signal(DEFAULT_SETTINGS.showSurface);
    showMesh = signal(DEFAULT_SETTINGS.showMesh);
    wireframe = signal(DEFAULT_SETTINGS.wireframe);
    showStats = signal(DEFAULT_SETTINGS.showStats);
    sliceX = signal(DEFAULT_SETTINGS.sliceX);
    sliceY = signal(DEFAULT_SETTINGS.sliceY);
    sliceZ = signal(DEFAULT_SETTINGS.sliceZ);
    contourDensity = signal(DEFAULT_SETTINGS.contourDensity);
    rotationSpeed = signal(DEFAULT_SETTINGS.rotationSpeed);
    autoRotate = signal(true);
    showControls = signal(true);
    activeTab = signal<'orbitals' | 'rendering'>('orbitals');
    isFullscreen = signal(false);
    orbitalGroups = signal<OrbitalGroup[]>([]);
    lName = computed(() => ORBITAL_LABELS[this.l()] || '?');

    orbitalLabel = computed(() => {
        const n = this.n();
        const l = this.l();
        const lChar = ORBITAL_LABELS[l] || '?';
        return `${n}${lChar}`;
    });

    constructor() {
        this.orbitalGroups.set(this.mathService.getOrbitalGroups());

        effect(() => {
            const currentN = this.n();
            const currentL = this.l();
            const currentM = this.m();
            const maxL = currentN - 1;
            if (currentL > maxL) {
                this.l.set(maxL);
            }
            if (Math.abs(currentM) > currentL) {
                if (currentM > this.l()) this.m.set(this.l());
            }
        });

        document.addEventListener('fullscreenchange', () => {
            this.isFullscreen.set(!!document.fullscreenElement);
        });
    }

    selectPreset(p: OrbitalPreset) {
        this.n.set(p.n);
        this.l.set(p.l);
        this.m.set(p.m);
    }

    isPresetActive(p: OrbitalPreset) {
        return this.n() === p.n && this.l() === p.l && this.m() === p.m;
    }

    toggleFullScreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => console.error(err));
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(err => console.error(err));
            }
        }
    }
}
