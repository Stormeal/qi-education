import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { FeedbackOption } from '../../app.models';
import { AppButton } from '../app-button/app-button';

@Component({
  selector: 'app-feedback-dialog',
  imports: [AppButton],
  templateUrl: './feedback-dialog.html',
  styleUrl: '../../app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackDialog implements AfterViewInit {
  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');

  readonly submitted = input.required<boolean>();
  readonly page = input.required<string>();
  readonly rating = input.required<string>();
  readonly text = input.required<string>();
  readonly submitting = input.required<boolean>();
  readonly error = input.required<string>();
  readonly options = input.required<FeedbackOption[]>();

  readonly closed = output<void>();
  readonly ratingSelected = output<string>();
  readonly textChanged = output<string>();
  readonly submittedClicked = output<void>();

  ngAfterViewInit(): void {
    queueMicrotask(() => {
      this.dialog().nativeElement.focus();
    });
  }

  protected stopModalClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  protected handleDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closed.emit();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusable = this.focusableElements();

    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  protected updateText(event: Event): void {
    const textarea = event.target;

    if (textarea instanceof HTMLTextAreaElement) {
      this.textChanged.emit(textarea.value);
    }
  }

  private focusableElements(): HTMLElement[] {
    return Array.from(
      this.dialog().nativeElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute('disabled') && element.offsetParent !== null);
  }
}
