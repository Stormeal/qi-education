import { Injectable, signal } from '@angular/core';

export type ConfirmOptions = { title: string; message: string; confirmLabel: string };

/**
 * Asks the user to confirm or decline in the app's own dialog instead of the browser's.
 * `<app-confirm-dialog>` at the app root shows the open question.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly open = signal<ConfirmOptions | null>(null);
  private resolve: ((confirmed: boolean) => void) | null = null;

  ask(options: ConfirmOptions): Promise<boolean> {
    // A second question while one is open declines the first; two dialogs never stack.
    this.answer(false);
    this.open.set(options);
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  answer(confirmed: boolean): void {
    const resolve = this.resolve;
    this.resolve = null;
    this.open.set(null);
    resolve?.(confirmed);
  }
}
