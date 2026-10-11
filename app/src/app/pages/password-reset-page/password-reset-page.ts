import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AppButton } from '../../ui/app-button/app-button';
import { BrandLink } from '../../ui/brand-link/brand-link';

type Step = 'request' | 'sent' | 'checking' | 'choose' | 'invalid' | 'done';

/**
 * US-L004: without a token this page asks for the account's email address; opened from the
 * link in the mail (`/reset-password#token=...`) it lets the user choose a new password.
 */
@Component({
  selector: 'app-password-reset-page',
  imports: [AppButton, BrandLink, RouterLink],
  templateUrl: './password-reset-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordResetPage {
  private readonly auth = inject(AuthService);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  // The token travels in the fragment, so it is never sent to a server by opening the page.
  private readonly token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') ?? '';

  protected readonly step = signal<Step>(this.token ? 'checking' : 'request');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly confirmation = signal('');
  protected readonly passwordVisible = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');

  constructor() {
    if (!this.token) return;
    // Remove the token from the address bar and the browser history entry.
    window.history.replaceState(null, '', window.location.pathname);
    void this.auth.checkPasswordReset(this.token).then((result) => {
      if (result.ok) this.show('choose');
      else if (result.invalid) this.show('invalid');
      else { this.error.set(result.message); this.show('choose'); }
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async requestLink(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy() || !this.email().trim()) return;
    this.busy.set(true);
    this.error.set('');
    const result = await this.auth.requestPasswordReset(this.email());
    this.busy.set(false);
    if (!result.ok) { this.error.set(result.message); return; }
    this.message.set(result.message);
    this.show('sent');
  }

  protected async choosePassword(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    if (this.password() !== this.confirmation()) { this.error.set('The two passwords are not the same.'); return; }
    this.busy.set(true);
    this.error.set('');
    const result = await this.auth.confirmPasswordReset(this.token, this.password());
    this.busy.set(false);
    if (result.ok) this.show('done');
    else if (result.invalid) this.show('invalid');
    else this.error.set(result.message);
  }

  protected startOver(): void {
    this.error.set('');
    this.show('request');
  }

  private show(step: Step): void {
    this.step.set(step);
    // Each step replaces the form, so move keyboard and screen-reader focus to its heading.
    setTimeout(() => this.heading()?.nativeElement.focus());
  }
}
