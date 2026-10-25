import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Thin progress bar: `<app-progress-bar [value]="percent" label="Upload progress" />`; add `indeterminate` when the amount is unknown. */
@Component({
  selector: 'app-progress-bar',
  templateUrl: './progress-bar.html',
  styleUrl: './progress-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    '[attr.aria-valuenow]': 'indeterminate() ? null : percent()',
    '[attr.aria-valuetext]': 'valueText() ?? (indeterminate() ? null : percent() + "%")',
    '[attr.data-indeterminate]': 'indeterminate() || null',
    '[attr.aria-label]': 'label()',
    '[attr.data-size]': 'size()',
  },
})
export class ProgressBar {
  readonly value = input.required<number>();
  readonly label = input.required<string>();
  readonly valueText = input<string>();
  readonly size = input<'sm' | 'md'>('md');
  readonly indeterminate = input(false, { transform: booleanAttribute });

  /** Uploads can report NaN or more than 100, so clamp before rounding. */
  protected readonly percent = computed(() => {
    const value = this.value();
    return Number.isNaN(value) ? 0 : Math.round(Math.min(100, Math.max(0, value)));
  });
}
