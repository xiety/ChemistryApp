import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-switch',
  standalone: true,
  template: `
    <label class="switch-container">
      <span class="label-text">{{ label() }}</span>
      <input type="checkbox" [checked]="checked()" (change)="onChange($event)">
      <div class="switch-track">
        <div class="switch-thumb"></div>
      </div>
    </label>
  `,
  styleUrl: './switch.component.css'
})
export class SwitchComponent {
  label = input.required<string>();
  checked = input.required<boolean>();
  checkedChange = output<boolean>();

  onChange(e: Event) {
    const isChecked = (e.target as HTMLInputElement).checked;
    this.checkedChange.emit(isChecked);
  }
}
