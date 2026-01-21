import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrbitalViewerComponent } from './components/orbital-viewer.component';
import { SidebarComponent } from './components/sidebar.component';
import { OrbitalStateService } from './services/orbital-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, OrbitalViewerComponent, SidebarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  state = inject(OrbitalStateService);
  isLoading = signal(true);

  toggleControls() {
    this.state.showControls.update(v => !v);
  }

  onViewerReady() {
    this.isLoading.set(false);
  }
}
