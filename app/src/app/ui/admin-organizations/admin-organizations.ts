import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { OrganizationService, type Organization, type OrgRequest } from '../../services/organization.service';
import { Button } from '../button/button';

type AdminOrganization = Organization & { memberCount: number };

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

  protected approve(request: OrgRequest): Promise<void> {
    return this.act(() => this.organizations.decideRequest(this.authToken(), request.id, { action: 'approve' }));
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
