import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { ConfirmService } from '../../services/confirm.service';
import { OrganizationService, type AdminOrganization, type BillingState, type OrgRequest } from '../../services/organization.service';
import { Button } from '../button/button';

// US-O002: older organizations have no billing record and are free.
const billingLabels: Record<BillingState, string> = { free: 'Free of charge', 'setup-needed': 'Billing not set up',
  active: 'Paying', overdue: 'Invoice overdue', blocked: 'Unpaid, courses closed', cancelling: 'Cancelling', cancelled: 'Subscription ended' };

/** US-O001: the site admin's Organizations section (requests and organizations). */
@Component({
  selector: 'app-admin-organizations',
  imports: [Button, DatePipe],
  templateUrl: './admin-organizations.html',
  styleUrl: './admin-organizations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOrganizations {
  readonly authToken = input.required<string>();

  private readonly organizations = inject(OrganizationService);
  private readonly confirm = inject(ConfirmService);
  protected readonly requests = signal<OrgRequest[]>([]);
  protected readonly list = signal<AdminOrganization[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly error = signal('');
  protected readonly decliningId = signal<string | null>(null);
  protected readonly reason = signal('');
  protected readonly busy = signal(false);

  constructor() {
    effect(() => { if (this.authToken()) untracked(() => void this.load()); });
  }

  async load(): Promise<void> {
    const [requests, organizations] = await Promise.all([
      this.organizations.adminRequests(this.authToken()), this.organizations.adminOrganizations(this.authToken()),
    ]);
    if (!requests.ok || !organizations.ok) {
      this.error.set(!requests.ok ? requests.message : !organizations.ok ? organizations.message : '');
      this.state.set('error');
      return;
    }
    this.requests.set(requests.body);
    this.list.set(organizations.body);
    this.state.set('ready');
  }

  protected startDecline(request: OrgRequest): void {
    this.decliningId.set(request.id);
    this.reason.set('');
    this.error.set('');
  }

  protected approve(request: OrgRequest, billing: 'paid' | 'free'): Promise<void> {
    return this.act(() => this.organizations.decideRequest(this.authToken(), request.id, { action: 'approve', billing }));
  }

  protected billingLabel(organization: AdminOrganization): string {
    return billingLabels[organization.billingState ?? 'free'];
  }

  protected async setFree(organization: AdminOrganization, free: boolean): Promise<void> {
    if (free && !await this.confirm.ask({ title: `Make ${organization.displayName} free of charge?`, confirmLabel: 'Make free',
      message: 'Its subscription is cancelled now, without a refund. Refund in Stripe by hand if needed.' })) return;
    await this.act(() => this.organizations.setFree(this.authToken(), organization.id, free));
  }

  protected decline(request: OrgRequest): Promise<void> {
    const reason = this.reason().trim();
    if (!reason) { this.error.set('Write the reason the requester will see.'); return Promise.resolve(); }
    return this.act(async () => {
      const result = await this.organizations.decideRequest(this.authToken(), request.id, { action: 'decline', reason });
      if (result.ok) this.decliningId.set(null);
      return result;
    });
  }

  protected setSuspended(organization: AdminOrganization, suspended: boolean): Promise<void> {
    return this.act(() => this.organizations.setSuspended(this.authToken(), organization.id, suspended));
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  private async act(action: () => Promise<{ ok: boolean; message?: string }>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const result = await action();
    this.busy.set(false);
    if (!result.ok) { this.error.set(result.message ?? 'The change could not be saved.'); return; }
    await this.load();
  }
}
