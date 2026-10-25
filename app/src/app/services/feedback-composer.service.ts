import { computed, inject, Injectable, signal } from '@angular/core';
import { FeedbackDraft, FeedbackRating, FeedbackType } from '../app.models';
import { FeedbackService } from './feedback.service';

/** A session-scoped draft shared by the single feedback dialog across routes. */
@Injectable({ providedIn: 'root' })
export class FeedbackComposerService {
  private readonly api = inject(FeedbackService);
  private token = '';
  private request = 0;
  private path = '/';
  readonly isOpen = signal(false);
  readonly focusTarget = signal<HTMLElement | null>(null);
  readonly page = signal('');
  readonly type = signal<FeedbackType>('feedback');
  readonly summary = signal('');
  readonly message = signal('');
  readonly rating = signal<FeedbackRating | ''>('');
  readonly reproductionSteps = signal('');
  readonly expectedBehavior = signal('');
  readonly submitting = signal(false);
  readonly submitted = signal(false);
  readonly error = signal('');
  readonly draft = computed<FeedbackDraft>(() => ({ type: this.type(), summary: this.summary(),
    message: this.message(), rating: this.rating(), reproductionSteps: this.reproductionSteps(), expectedBehavior: this.expectedBehavior() }));

  setSession(token: string): void {
    if (token === this.token) return;
    this.token = token; this.request++;
    this.isOpen.set(false); this.submitting.set(false); this.submitted.set(false); this.error.set('');
    this.clear();
  }
  open(page: string, path: string): void {
    if (!this.token) return;
    if (!this.isOpen()) this.focusTarget.set(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    // A pending send retains its original context even if another route opens the dialog.
    if (!this.submitting()) {
      this.page.set(page);
      this.path = path.split(/[?#]/, 1)[0].slice(0, 500) || '/';
      this.submitted.set(false); this.error.set('');
    }
    this.isOpen.set(true);
  }
  close(): void { this.isOpen.set(false); }
  change(update: Partial<FeedbackDraft>): void {
    if (this.submitting()) return;
    if (update.type !== undefined) this.type.set(update.type);
    if (update.summary !== undefined) this.summary.set(update.summary);
    if (update.message !== undefined) this.message.set(update.message);
    if (update.rating !== undefined) this.rating.set(update.rating);
    if (update.reproductionSteps !== undefined) this.reproductionSteps.set(update.reproductionSteps);
    if (update.expectedBehavior !== undefined) this.expectedBehavior.set(update.expectedBehavior);
    this.error.set('');
  }
  async submit(): Promise<void> {
    if (this.submitting()) return;
    if (!this.token) { this.error.set('Please log in again before sending feedback.'); return; }
    const draft = this.draft();
    if (!draft.summary.trim() || draft.summary.trim().length > 120 || !draft.message.trim() || draft.message.trim().length > 2000 ||
      (draft.type === 'defect' && (draft.reproductionSteps.length > 2000 || draft.expectedBehavior.length > 2000))) {
      this.error.set('Add a summary (up to 120 characters) and a description (up to 2,000 characters).'); return;
    }
    const token = this.token, request = ++this.request;
    const current = () => this.token === token && this.request === request;
    this.submitting.set(true); this.error.set('');
    try {
      const result = await this.api.submitTypedFeedback(token, {
        page: this.page(), path: this.path, type: draft.type, summary: draft.summary.trim(), message: draft.message.trim(),
        ...(draft.type === 'feedback' && draft.rating ? { rating: draft.rating } : {}),
        ...(draft.type === 'defect' ? { reproductionSteps: draft.reproductionSteps.trim(), expectedBehavior: draft.expectedBehavior.trim() } : {}),
      });
      if (!current()) return;
      if (!result.ok) { this.error.set(result.message); return; }
      this.summary.set(''); this.message.set(''); this.rating.set('');
      this.reproductionSteps.set(''); this.expectedBehavior.set('');
      this.submitted.set(true);
    } catch {
      if (current()) this.error.set('Unable to reach the API. Your draft is kept. Please try again.');
    } finally { if (current()) this.submitting.set(false); }
  }
  private clear(): void {
    this.type.set('feedback'); this.summary.set(''); this.message.set(''); this.rating.set('');
    this.reproductionSteps.set(''); this.expectedBehavior.set(''); this.page.set(''); this.path = '/';
  }
}
