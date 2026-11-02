import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ConfirmService } from '../../services/confirm.service';
import { OrganizationService, type BillingAddress, type OrgBillingView } from '../../services/organization.service';
import { Button } from '../button/button';

export type CardReturn = { outcome: 'card' | 'cancelled'; sessionId: string | null };

/** US-O002: the owner's Billing section on the organization page (setup, monthly lines, invoices, cancel). */
@Component({
  selector: 'app-organization-billing',
  imports: [Button, DatePipe],
  templateUrl: './organization-billing.html',
  // Same panel, field and list styles as the page it sits in.
  styleUrls: ['../../pages/organization-page/organization-page.scss', './organization-billing.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationBilling {
  readonly authToken = input.required<string>();
  readonly orgId = input.required<string>();
  /** Stripe's card form came back to the page (read and removed from the address by the route). */
  readonly cardReturn = input<CardReturn | null>(null);
  /** Fired when billing changed whether organization courses open, so the page reloads access. */
  readonly accessChanged = output<void>();

  private readonly organizations = inject(OrganizationService);
  private readonly confirm = inject(ConfirmService);
  protected readonly view = signal<OrgBillingView | null>(null);
  protected readonly loadError = signal('');
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busy = signal(false);
  protected readonly setupOpen = signal(false);
  protected readonly method = signal<'card' | 'invoice'>('invoice');
  protected readonly address = signal<BillingAddress>({ line1: '', postalCode: '', city: '' });
  protected readonly addressErrors = signal<Partial<Record<keyof BillingAddress, string>>>({});
  private handledReturn = false;

  // Tests replace this; a real browser leaves the page for Stripe.
  assignLocation = (url: string) => window.location.assign(url);

  constructor() {
    effect(() => {
      const token = this.authToken(), orgId = this.orgId();
      if (token && orgId) untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    const result = await this.organizations.billing(this.authToken(), this.orgId());
    if (!result.ok) { this.loadError.set(result.message); return; }
    this.loadError.set('');
    this.view.set(result.body);
    const back = this.cardReturn();
    if (back && !this.handledReturn) { this.handledReturn = true; await this.finishCardReturn(back); }
  }

  private async finishCardReturn(back: CardReturn): Promise<void> {
    if (back.outcome === 'cancelled' || !back.sessionId) { this.notice.set('Card setup cancelled. Nothing was saved.'); return; }
    await this.run(async () => {
      const result = await this.organizations.confirmCard(this.authToken(), this.orgId(), back.sessionId!);
      if (!result.ok) return `${result.message} Your card may still be saved: reload this page in a minute before trying again.`;
      this.apply(result.body);
      this.notice.set('Card saved. Your members can open their courses.');
      return '';
    });
  }

  protected setAddress(field: keyof BillingAddress, value: string): void {
    this.address.update((address) => ({ ...address, [field]: value }));
  }

  protected async setUp(event: Event): Promise<void> {
    event.preventDefault();
    const address = { line1: this.address().line1.trim(), postalCode: this.address().postalCode.trim(), city: this.address().city.trim() };
    const errors: Partial<Record<keyof BillingAddress, string>> = {};
    if (!address.line1) errors.line1 = 'Enter the street address.';
    if (!/^\d{4}$/.test(address.postalCode)) errors.postalCode = 'Enter the 4-digit postcode.';
    if (!address.city) errors.city = 'Enter the city.';
    this.addressErrors.set(errors);
    if (Object.keys(errors).length) {
      queueMicrotask(() => document.getElementById(`bill-${Object.keys(errors)[0]}`)?.focus());
      return;
    }
    await this.run(async () => {
      if (this.method() === 'card') {
        const result = await this.organizations.setupCard(this.authToken(), this.orgId(), address, returnAddress());
        if (!result.ok) return result.message;
        this.assignLocation(result.body.url);
        return '';
      }
      const result = await this.organizations.setupInvoice(this.authToken(), this.orgId(), address);
      if (!result.ok) return result.message;
      this.apply(result.body);
      this.notice.set('Invoice billing is set up. Invoices go to the billing contact with 14 days to pay.');
      return '';
    });
  }

  protected async setCancelled(cancel: boolean): Promise<void> {
    if (cancel && !await this.confirm.ask({ title: 'Cancel the subscription?', confirmLabel: 'Cancel subscription',
      message: 'Members keep organization courses until the end of the paid month. After that the courses close; their progress is kept.' })) return;
    await this.run(async () => {
      const result = await this.organizations.setCancellation(this.authToken(), this.orgId(), cancel);
      if (!result.ok) return result.message;
      this.apply(result.body);
      return '';
    });
  }

  protected async openPortal(): Promise<void> {
    await this.run(async () => {
      const result = await this.organizations.billingPortal(this.authToken(), this.orgId(), returnAddress());
      if (!result.ok) return result.message;
      this.assignLocation(result.body.url);
      return '';
    });
  }

  protected startSetup(): void {
    this.method.set(this.view()?.method ?? 'invoice');
    this.setupOpen.set(true);
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private apply(view: OrgBillingView): void {
    const opened = (state: string | undefined) => !['setup-needed', 'blocked', 'cancelled'].includes(state ?? '');
    const changed = opened(this.view()?.state) !== opened(view.state);
    this.view.set(view);
    this.setupOpen.set(false);
    if (changed) this.accessChanged.emit();
  }

  private async run(action: () => Promise<string>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try { this.error.set(await action()); }
    finally { this.busy.set(false); }
  }
}

function returnAddress(): string {
  return window.location.origin + window.location.pathname;
}
