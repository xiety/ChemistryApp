import { Component, input, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-slider',
  imports: [CommonModule],
  templateUrl: './slider.component.html',
  styleUrl: './slider.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SliderComponent {
  label = input.required<string>();
  value = input.required<number>();
  min = input.required<number>();
  max = input.required<number>();
  step = input<number>(1);

  markers = input<number[]>([]);
  valueFormatter = input<(v: number) => string | number>();

  valueChange = output<number>();

  formattedValue = computed(() => {
    const val = this.value();
    const fmt = this.valueFormatter();
    return fmt ? fmt(val) : val;
  });

  thumbPosition = computed(() => {
    const min = this.min();
    const max = this.max();
    const val = this.value();
    const range = max - min;
    if (range <= 0) return '0%';
    const percent = ((val - min) / range) * 100;
    return `calc(${percent}% - 10px)`;
  });

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
