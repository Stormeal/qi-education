import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppStateService } from '../../services/app-state.service';
import { AuthService } from '../../services/auth.service';
import { Button } from '../../ui/button/button';
import { BrandLink } from '../../ui/brand-link/brand-link';

type Step = 'checking' | 'done' | 'invalid' | 'error';

/** US-L014: opened from the link in the signup mail (`/confirm-email#token=...`). */
@Component({
  selector: 'app-confirm-email-page',
  imports: [Button, BrandLink, RouterLink],
  templateUrl: './confirm-email-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmEmailPage {
  private readonly auth = inject(AuthService);
  protected readonly state = inject(AppStateService);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  // The token travels in the fragment, so it is never sent to a server by opening the page.
  private readonly token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') ?? '';

  protected readonly step = signal<Step>(this.token ? 'checking' : 'invalid');
  protected readonly error = signal('');

  constructor() {
    if (!this.token) return;
    // Remove the token from the address bar and the browser history entry.
    window.history.replaceState(null, '', window.location.pathname);
    void this.confirm();
  }

  protected async confirm(): Promise<void> {
    this.step.set('checking');
    const result = await this.auth.confirmEmail(this.token);
    if (result.ok) { this.state.markEmailConfirmed(); this.show('done'); }
    else if (result.invalid) this.show('invalid');
    else { this.error.set(result.message); this.show('error'); }
  }

  private show(step: Step): void {
    this.step.set(step);
    // Each step replaces the text, so move keyboard and screen-reader focus to its heading.
    setTimeout(() => this.heading()?.nativeElement.focus());
  }
}
