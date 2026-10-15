import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ChipVariant = 'neutral' | 'primary' | 'highlight' | 'danger';

/** Small pill label: `<span appChip="primary">4</span>`. */
@Component({
  selector: 'span[appChip]',
  template: '<ng-content />',
  styleUrl: './chip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-variant]': 'appChip()' },
})
export class Chip {
  readonly appChip = input<ChipVariant, ChipVariant | ''>('neutral', {
    transform: (value) => value || 'neutral',
  });
}
