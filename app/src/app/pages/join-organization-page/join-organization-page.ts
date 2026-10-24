import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrganizationService, type InvitationCheck } from '../../services/organization.service';
import { BrandLink } from '../../ui/brand-link/brand-link';
import { Button } from '../../ui/button/button';

/** Keeps the invitation token while the invitee signs in or signs up; removed once used or invalid. */
export const PENDING_INVITATION_KEY = 'qiPendingOrganizationInvitation';
type Step = 'checking' | 'ready' | 'joined' | 'pending-email' | 'invalid' | 'error';
export type AuthRequest = { mode: 'login' | 'signup'; email: string };

/** US-O001: opened from the invitation mail (`/join-organization#token=...`). */
@Component({
  selector: 'app-join-organization-page',
  imports: [BrandLink, Button, RouterLink],
  templateUrl: './join-organization-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:hashchange)': 'openNewLink()' },
})
export class JoinOrganizationPage {
  readonly authToken = input.required<string>();
  readonly signedInEmail = input.required<string>();
  readonly authRequested = output<AuthRequest>();
  /** Fired after joining, so the app reloads course access. */
  readonly joined = output<void>();

  private readonly organizations = inject(OrganizationService);
  // The token travels in the fragment, so opening the page never sends it to a server.
  private token = this.readToken();

  protected readonly step = signal<Step>(this.token ? 'checking' : 'invalid');
  protected readonly invitation = signal<InvitationCheck | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly wrongAccount = computed(() => {
    const signedIn = this.signedInEmail().trim().toLowerCase();
    const invited = this.invitation()?.email.trim().toLowerCase();
    return !!signedIn && !!invited && signedIn !== invited;
  });

  constructor() {
    if (this.token) void this.check();
  }

  // A second invitation link pasted into this tab only changes the fragment, so the page is not re-created.
  // The router handles that change after us and puts the fragment back, so it is cleared once checked.
  protected openNewLink(): void {
    if (!new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token')) return;
    this.token = this.readToken(false);
    this.invitation.set(null);
    this.error.set('');
    this.step.set('checking');
    void this.check().finally(() => window.history.replaceState(null, '', window.location.pathname));
  }

  private readToken(clearAddress = true): string {
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') ?? '';
    if (fromHash) {
      if (clearAddress) window.history.replaceState(null, '', window.location.pathname);
      try { sessionStorage.setItem(PENDING_INVITATION_KEY, fromHash); } catch { /* storage blocked: the token still works for this visit */ }
      return fromHash;
    }
    try { return sessionStorage.getItem(PENDING_INVITATION_KEY) ?? ''; } catch { return ''; }
  }

  private async check(): Promise<void> {
    const token = this.token;
    const result = await this.organizations.checkInvitation(token);
    // DEF-061: a newer link replaced this one meanwhile; showing this answer would accept a different invitation.
    if (token !== this.token) return;
    if (result.ok) { this.invitation.set(result.body); this.step.set('ready'); return; }
    if (result.status === 410 || result.status === 404) { this.forget(); this.step.set('invalid'); return; }
    this.error.set(result.message);
    this.step.set('error');
  }

  protected requestAuth(mode: AuthRequest['mode']): void {
    this.authRequested.emit({ mode, email: this.invitation()?.email ?? '' });
  }

  protected async accept(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const result = await this.organizations.acceptInvitation(this.authToken(), this.token);
    this.busy.set(false);
    if (!result.ok) {
      if (result.status === 410) { this.forget(); this.step.set('invalid'); }
      else this.error.set(result.message);
      return;
    }
    this.forget();
    this.step.set('state' in result.body && result.body.state === 'pending-email' ? 'pending-email' : 'joined');
    this.joined.emit();
  }

  private forget(): void {
    try { sessionStorage.removeItem(PENDING_INVITATION_KEY); } catch { /* nothing stored */ }
  }
}
