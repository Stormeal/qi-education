import { booleanAttribute, ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dashed';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * The one text button of the app. Put it on a `button`, `a` or `label`:
 * `<button appButton="primary" size="lg" fullWidth type="submit">`.
 * Defaults to `type="button"` so it never submits a form by accident.
 */
@Component({
  selector: 'button[appButton], a[appButton], label[appButton]',
  templateUrl: './button.html',
  styleUrl: './button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-variant]': 'appButton()',
    '[attr.data-size]': 'size()',
    '[attr.data-full-width]': "fullWidth() ? '' : null",
    '[attr.type]': 'isNativeButton ? type() : null',
    '[attr.aria-busy]': "loading() ? 'true' : null",
    '[attr.aria-disabled]': "loading() ? 'true' : null",
  },
})
export class Button {
  readonly appButton = input<ButtonVariant, ButtonVariant | ''>('secondary', {
    transform: (value) => value || 'secondary',
  });
  readonly size = input<ButtonSize>('md');
  readonly fullWidth = input(false, { transform: booleanAttribute });
  readonly loading = input(false, { transform: booleanAttribute });
  readonly type = input<'button' | 'submit' | 'reset'>('button');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly isNativeButton = this.host.tagName === 'BUTTON';

  constructor() {
    // Capture phase on the host, so it runs before the page's own (click) handler.
    this.host.addEventListener(
      'click',
      (event) => {
        if (!this.loading()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true,
    );
  }
}
