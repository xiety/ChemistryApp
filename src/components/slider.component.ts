import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-slider',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="slider-container">
      <div class="header">
        <span class="label">{{ label() }}</span>
        <span class="value">{{ displayValue() }}</span>
      </div>

      <div class="input-wrapper">
        <div class="track"></div>
        <div class="ticks-container">
          @for (pos of generatedTicks(); track $index) {
            <div class="tick" [style.left]="pos"></div>
          }

          @for (pos of specialMarkers(); track $index) {
            <div class="tick marked" [style.left]="pos"></div>
          }
        </div>

        <input type="range" 
          [min]="min()" 
          [max]="max()" 
          [step]="step()" 
          [value]="value()" 
          (input)="onInput($event)"
          class="range-input">
      </div>

      <div class="limits">
        <span class="limit-label">{{ formatValue(min()) }}</span>
        <span class="limit-label">{{ formatValue(max()) }}</span>
      </div>
    </div>
  `,
  styleUrl: './slider.component.css'
})
export class SliderComponent {
  label = input.required<string>();
  value = input.required<number>();
  min = input.required<number>();
  max = input.required<number>();
  step = input<number>(1);
  displayValue = input<string | number>('');

  markers = input<number[]>([]);
  valueFormatter = input<(v: number) => string | number>();

  valueChange = output<number>();

  generatedTicks = computed(() => {
    const min = this.min();
    const max = this.max();
    const step = this.step();
    const range = max - min;

    if (range <= 0 || step <= 0) return [];

    const rawCount = Math.floor(range / step);
    const stride = Math.max(1, Math.ceil(rawCount / 20));
    const renderStep = step * stride;

    const ticks: string[] = [];
    for (let v = min; v <= max + 1e-9; v += renderStep) {
      ticks.push(((v - min) / range) * 100 + '%');
    }
    return ticks;
  });

  specialMarkers = computed(() => {
    const min = this.min();
    const max = this.max();
    const range = max - min;

    if (range <= 0) return [];

    return this.markers()
      .filter(m => m >= min && m <= max)
      .map(m => ((m - min) / range) * 100 + '%');
  });

  formatValue(val: number): string | number {
    const fmt = this.valueFormatter();
    return fmt ? fmt(val) : val;
  }

  onInput(event: Event) {
    const val = (event.target as HTMLInputElement).valueAsNumber;
    this.valueChange.emit(val);
  }
}
