import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-slider',
  standalone: true,
  template: `
    <div class="slider-container">
      <div class="header">
        <span class="label">{{ label() }}</span>
        <span class="value">{{ displayValue() }}</span>
      </div>

      <div class="input-wrapper">
        <input type="range" 
          [min]="min()" 
          [max]="max()" 
          [step]="step()" 
          [value]="value()" 
          (input)="onInput($event)"
          class="range-input">
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

  valueChange = output<number>();

  onInput(event: Event) {
    const val = (event.target as HTMLInputElement).valueAsNumber;
    this.valueChange.emit(val);
  }
}
