import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, inject, input, output, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer } from '@angular/platform-browser';
import { lucideMessageSquare, lucideBug, lucideLightbulb, lucideCheck, lucideX } from '@ng-icons/lucide';
import { FeedbackDraft, FeedbackRating, FeedbackType } from '../../app.models';
import { Button } from '../button/button';
import { IconButton } from '../icon-button/icon-button';

const requiredText = [Validators.required, Validators.pattern(/\S/)];
@Component({
  selector: 'app-feedback-dialog',
  imports: [Button, IconButton, ReactiveFormsModule],
  templateUrl: './feedback-dialog.html',
  styleUrl: './feedback-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackDialog implements AfterViewInit, OnDestroy {
  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  private readonly fallbackFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  private readonly previousOverflow = document.body.style.overflow;
  readonly submitted = input.required<boolean>();
  readonly page = input.required<string>();
  readonly draft = input.required<FeedbackDraft>();
  readonly submitting = input.required<boolean>();
  readonly error = input.required<string>();
  readonly returnFocusTo = input<HTMLElement | null>(null);
  readonly closed = output<void>();
  readonly changed = output<Partial<FeedbackDraft>>();
  readonly submittedClicked = output<void>();
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly closeIcon = this.sanitizer.bypassSecurityTrustHtml(lucideX);
  protected readonly checkIcon = this.sanitizer.bypassSecurityTrustHtml(lucideCheck);
  protected readonly types = [
    { value: 'feedback', label: 'Give feedback', description: 'Tell us what works and what could be better.', icon: this.sanitizer.bypassSecurityTrustHtml(lucideMessageSquare) },
    { value: 'defect', label: 'Report a defect', description: 'Something is broken or is not working as expected.', icon: this.sanitizer.bypassSecurityTrustHtml(lucideBug) },
    { value: 'change-request', label: 'Request a change', description: 'Suggest an improvement or something new.', icon: this.sanitizer.bypassSecurityTrustHtml(lucideLightbulb) },
  ] as const;
  protected readonly ratings = [ { value: 'great', label: 'Great' }, { value: 'okay', label: 'Okay' }, { value: 'needs-work', label: 'Needs work' } ] as const;
  protected readonly form = new FormGroup({
    type: new FormControl<FeedbackType>('feedback', { nonNullable: true }),
    summary: new FormControl('', { nonNullable: true, validators: [...requiredText, Validators.maxLength(120)] }),
    message: new FormControl('', { nonNullable: true, validators: [...requiredText, Validators.maxLength(2000)] }),
    rating: new FormControl<FeedbackRating | ''>('', { nonNullable: true }),
    reproductionSteps: new FormControl('', { nonNullable: true, validators: Validators.maxLength(2000) }),
    expectedBehavior: new FormControl('', { nonNullable: true, validators: Validators.maxLength(2000) }),
  });
  constructor() {
    effect(() => { this.form.patchValue(this.draft(), { emitEvent: false }); });
    effect(() => { if (this.submitting()) this.form.disable({ emitEvent: false }); else this.form.enable({ emitEvent: false }); });
    effect(() => { if (this.submitted()) queueMicrotask(() => this.dialog().nativeElement.focus()); });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.changed.emit(this.form.getRawValue()));
    document.body.style.overflow = 'hidden';
  }
  ngAfterViewInit(): void { queueMicrotask(() => { if (this.dialog().nativeElement.isConnected) this.dialog().nativeElement.focus(); }); }
  ngOnDestroy(): void {
    document.body.style.overflow = this.previousOverflow;
    const target = this.returnFocusTo() ?? this.fallbackFocusTarget;
    queueMicrotask(() => { if (target?.isConnected && !target.closest('[inert]')) target.focus(); });
  }
  protected submit(): void {
    if (this.submitting()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) { this.dialog().nativeElement.querySelector<HTMLElement>('.ng-invalid:not(form)')?.focus(); return; }
    this.submittedClicked.emit();
  }
  protected invalid(name: 'summary' | 'message' | 'reproductionSteps' | 'expectedBehavior'): boolean {
    const control = this.form.controls[name]; return control.touched && control.invalid;
  }
  protected handleDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.closed.emit(); return; }
    if (event.key !== 'Tab') return;
    const elements = Array.from(this.dialog().nativeElement.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href]')).filter(element => element.getClientRects().length > 0);
    const first = elements[0], last = elements[elements.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === this.dialog().nativeElement)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === this.dialog().nativeElement)) { event.preventDefault(); first.focus(); }
  }
}
