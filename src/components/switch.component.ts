import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-switch',
  imports: [CommonModule],
  templateUrl: './switch.component.html',
  styleUrl: './switch.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
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
