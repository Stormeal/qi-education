import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';

export type IconButtonVariant = 'default' | 'ghost' | 'danger';
export type IconButtonSize = 'sm' | 'md' | 'lg';

/**
 * Square button that holds only an icon. The required `label` becomes its accessible name and tooltip:
 * `<button appIconButton label="Remove section"><svg …/></button>`.
 * Defaults to `type="button"` so it never submits a form by accident.
 */
@Component({
  selector: 'button[appIconButton], a[appIconButton]',
  templateUrl: './icon-button.html',
  styleUrl: './icon-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.aria-label]': 'label()',
    '[attr.title]': 'label()',
    '[attr.data-variant]': 'appIconButton()',
    '[attr.data-size]': 'size()',
    '[attr.type]': 'isNativeButton ? type() : null',
  },
})
export class IconButton {
  readonly appIconButton = input<IconButtonVariant, IconButtonVariant | ''>('default', {
    transform: (value) => value || 'default',
  });
  readonly label = input.required<string>();
  readonly size = input<IconButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly isNativeButton = this.host.tagName === 'BUTTON';
}
