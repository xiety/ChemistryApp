import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SliderComponent } from './slider.component';
import { SwitchComponent } from './switch.component';
import { OrbitalStateService } from '../services/orbital-state.service';
import { ORBITAL_LABELS } from '../services/orbital-math.service';

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule, SliderComponent, SwitchComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarComponent {
  state = inject(OrbitalStateService);

  formatInt = (v: number) => v.toFixed(0);
  formatFloat1 = (v: number) => v.toFixed(1);
  formatFloat2 = (v: number) => v.toFixed(2);

  formatL = (v: number) => {
    const label = ORBITAL_LABELS[v] || '?';
    return `${v} (${label})`;
  };

  getOrbitalTypeClass(l: number): string {
    const label = ORBITAL_LABELS[l];
    if (label && ['s', 'p', 'd', 'f'].includes(label)) {
      return `type-${label}`;
    }
    return '';
  }

  toggleCloud() { this.state.showCloud.update(v => !v); }
  toggleIsoLines() { this.state.showIsoLines.update(v => !v); }
  toggleSurface() { this.state.showSurface.update(v => !v); }
  toggleMesh() { this.state.showMesh.update(v => !v); }
}
