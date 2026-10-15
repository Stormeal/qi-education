import { ChangeDetectionStrategy, Component, ElementRef, effect, inject } from '@angular/core';
import { ConfirmService } from '../../services/confirm.service';
import { Button } from '../button/button';

/** The one confirmation dialog of the app. Same keyboard contract as the feedback dialog. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [Button],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  protected readonly confirm = inject(ConfirmService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private returnFocusTo: HTMLElement | null = null;

  constructor() {
    effect(() => {
      if (this.confirm.open()) {
        this.returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        // Focus starts on Cancel, so Enter or Space cannot confirm by accident.
        setTimeout(() => this.buttons()[0]?.focus());
      } else if (this.returnFocusTo) {
        const target = this.returnFocusTo;
        this.returnFocusTo = null;
        setTimeout(() => { if (target.isConnected) target.focus(); });
      }
    });
  }

  protected keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.confirm.answer(false); return; }
    if (event.key !== 'Tab') return;
    const buttons = this.buttons();
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  private buttons(): HTMLButtonElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLButtonElement>('button'));
  }
}
