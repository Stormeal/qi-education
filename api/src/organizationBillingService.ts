import { randomUUID, createHash } from 'node:crypto';
import Stripe from 'stripe';
import { apiConfig, getServicesMode, hasStripeConfig } from './config.js';
import { OrganizationError, type Organization } from './organization.js';
import { billingState, type BillingAddress, type BillingLine, type OrganizationBilling, type UnpaidInvoice } from './organizationBilling.js';

export type BillingSnapshot = Pick<OrganizationBilling, 'subscriptionId' | 'method' | 'status' | 'periodEnd' | 'endsAt' | 'unpaid'>;
export type BillingEvent = { customerId: string; sessionId?: string } | null;
export interface OrganizationBillingService {
  ensureCustomer(org: Organization, billing: OrganizationBilling, address: BillingAddress): Promise<string>;
  createCardSetup(org: Organization, billing: OrganizationBilling, successUrl: string, cancelUrl: string): Promise<{ url: string }>;
  confirmCard(org: Organization, billing: OrganizationBilling, sessionId: string): Promise<boolean>;
  sync(org: Organization, billing: OrganizationBilling, lines: BillingLine[], proration: 'create_prorations' | 'none'): Promise<BillingSnapshot>;
  refresh(org: Organization, billing: OrganizationBilling): Promise<BillingSnapshot>;
  cancellation(org: Organization, billing: OrganizationBilling, cancel: boolean): Promise<BillingSnapshot>;
  cancelNow(billing: OrganizationBilling): Promise<void>;
  portal(customerId: string, returnUrl: string): Promise<{ url: string }>;
  readWebhook(rawBody: string, signature: string | undefined): BillingEvent;
}
export class BillingSignatureError extends Error {}
const id = (value: string | { id: string } | null | undefined): string | null => typeof value === 'string' ? value : value?.id ?? null;
const iso = (seconds: number | null | undefined): string | null => seconds ? new Date(seconds * 1000).toISOString() : null;

export class FakeOrganizationBillingService implements OrganizationBillingService {
  private readonly customers = new Map<string, BillingSnapshot>();
  private readonly sessions = new Map<string, { orgId: string; customerId: string }>();
  constructor(private readonly now: () => number = Date.now) {}
  async ensureCustomer(org: Organization, billing: OrganizationBilling, _address: BillingAddress) {
    const customerId = billing.customerId ?? `org-customer-${org.id}`;
    if (!this.customers.has(customerId)) this.customers.set(customerId, { subscriptionId: null, method: null, status: 'none', periodEnd: null, endsAt: null, unpaid: [] });
    return customerId;
  }
  async createCardSetup(org: Organization, billing: OrganizationBilling, successUrl: string, _cancelUrl: string) {
    const sessionId = `org-setup-${randomUUID()}`;
    this.sessions.set(sessionId, { orgId: org.id, customerId: billing.customerId! });
    return { url: successUrl.replace('{CHECKOUT_SESSION_ID}', sessionId) };
  }
  async confirmCard(org: Organization, billing: OrganizationBilling, sessionId: string) {
    const session = this.sessions.get(sessionId);
    return session?.orgId === org.id && session.customerId === billing.customerId;
  }
  async sync(_org: Organization, billing: OrganizationBilling, _lines: BillingLine[], _proration: 'create_prorations' | 'none'): Promise<BillingSnapshot> {
    const previous = this.customers.get(billing.customerId!);
    const expired = billingState(billing, this.now()) === 'cancelled' || previous?.status === 'cancelled' ||
      previous?.status === 'cancelling' && !!previous.endsAt && Date.parse(previous.endsAt) <= this.now();
    const end = new Date(this.now()); end.setUTCMonth(end.getUTCMonth() + 1);
    const snapshot: BillingSnapshot = { subscriptionId: !expired && (billing.subscriptionId || previous?.subscriptionId) || `org-sub-${randomUUID()}`, method: billing.method,
      status: !expired && billing.status === 'cancelling' ? 'cancelling' : 'active', periodEnd: !expired && previous?.periodEnd || end.toISOString(),
      endsAt: !expired ? billing.endsAt : null, unpaid: previous?.unpaid ?? [] };
    this.customers.set(billing.customerId!, snapshot); return structuredClone(snapshot);
  }
  async refresh(_org: Organization, billing: OrganizationBilling) { return structuredClone(this.customers.get(billing.customerId!)!); }
  async cancellation(org: Organization, billing: OrganizationBilling, cancel: boolean) {
    const snapshot = await this.refresh(org, billing);
    snapshot.status = cancel ? 'cancelling' : 'active'; snapshot.endsAt = cancel ? snapshot.periodEnd : null;
    this.customers.set(billing.customerId!, snapshot); return structuredClone(snapshot);
  }
  async cancelNow(billing: OrganizationBilling) { const current = this.customers.get(billing.customerId!); if (current) current.status = 'cancelled'; }
  async portal(_customerId: string, returnUrl: string) { return { url: returnUrl }; }
  setUnpaid(customerId: string, invoices: UnpaidInvoice[]) { this.customers.get(customerId)!.unpaid = structuredClone(invoices); }
  readWebhook(rawBody: string, signature: string | undefined): BillingEvent {
    if (signature !== 'fake-billing-signature') throw new BillingSignatureError();
    try { const event = JSON.parse(rawBody); return typeof event.customerId === 'string' ? { customerId: event.customerId, ...(event.sessionId ? { sessionId: event.sessionId } : {}) } : null; }
    catch { throw new BillingSignatureError(); }
  }
}

// No calls are made by construction. Isolated runs select the fake factory below.
export class StripeOrganizationBillingService implements OrganizationBillingService {
  constructor(private readonly client: Stripe = new Stripe(apiConfig.STRIPE_SECRET_KEY!, { apiVersion: '2026-09-30.endive', timeout: 15000, maxNetworkRetries: 1 }),
    private readonly secret = apiConfig.STRIPE_BILLING_WEBHOOK_SECRET, private readonly taxRate = apiConfig.STRIPE_ORG_TAX_RATE_ID) {}
  async ensureCustomer(org: Organization, billing: OrganizationBilling, address: BillingAddress) {
    const fields = { name: org.companyName, email: org.billingEmail,
      address: { line1: address.line1, postal_code: address.postalCode, city: address.city, country: 'DK' }, metadata: { orgId: org.id } };
    if (billing.customerId) { await this.client.customers.update(billing.customerId, fields); return billing.customerId; }
    const customer = await this.client.customers.create({ ...fields, tax_id_data: [{ type: 'eu_vat', value: `DK${org.cvr}` }] }, { idempotencyKey: `org-customer-${org.id}` });
    return customer.id;
  }
  async createCardSetup(org: Organization, billing: OrganizationBilling, successUrl: string, cancelUrl: string) {
    const session = await this.client.checkout.sessions.create({ customer: billing.customerId!, mode: 'setup', currency: 'dkk', allowed_payment_method_types: ['card'],
      metadata: { orgId: org.id }, setup_intent_data: { metadata: { orgId: org.id } }, success_url: successUrl, cancel_url: cancelUrl });
    if (!session.url) throw new Error('Missing setup URL');
    return { url: session.url };
  }
  async confirmCard(org: Organization, billing: OrganizationBilling, sessionId: string) {
    let session: Stripe.Checkout.Session;
    try { session = await this.client.checkout.sessions.retrieve(sessionId, { expand: ['setup_intent'] }); }
    catch (error) { if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === 'resource_missing') return false; throw error; }
    if (session.mode !== 'setup' || session.metadata?.orgId !== org.id || id(session.customer) !== billing.customerId) return false;
    const intent = session.setup_intent;
    if (session.status !== 'complete' || !intent || typeof intent === 'string' || intent.status !== 'succeeded' || !id(intent.payment_method)) {
      throw new OrganizationError(409, 'Card setup is not complete.');
    }
    await this.client.customers.update(billing.customerId!, { invoice_settings: { default_payment_method: id(intent.payment_method)! } });
    return true;
  }
  private async product(line: BillingLine) {
    // Deterministic product identity avoids duplicates on concurrent/later retries.
    const productId = `qi_org_${createHash('sha256').update(`${line.kind}:${line.id}`).digest('hex').slice(0, 32)}`;
    try { return (await this.client.products.retrieve(productId)).id; }
    catch (error) {
      if (!(error instanceof Stripe.errors.StripeInvalidRequestError) || error.code !== 'resource_missing') throw error;
      try { return (await this.client.products.create({ id: productId, name: line.title, metadata: { kind: line.kind, id: line.id } }, { idempotencyKey: productId })).id; }
      catch (createError) { if (!(createError instanceof Stripe.errors.StripeInvalidRequestError) || createError.code !== 'resource_already_exists') throw createError; return productId; }
    }
  }
  async sync(org: Organization, billing: OrganizationBilling, lines: BillingLine[], proration: 'create_prorations' | 'none'): Promise<BillingSnapshot> {
    const existing = billing.subscriptionId ? await this.client.subscriptions.retrieve(billing.subscriptionId) : await this.latestSubscription(org.id, billing.customerId!);
    const current = existing?.status === 'canceled' || existing?.status === 'incomplete_expired' ? null : existing;
    const items: Stripe.SubscriptionUpdateParams.Item[] = [];
    for (const line of lines) {
      const previous = current?.items.data.find(item => item.metadata.kind === line.kind && item.metadata.id === line.id);
      const samePrice = previous?.price.unit_amount === line.unitDkk * 100;
      items.push({ ...(previous ? { id: previous.id } : {}), quantity: line.quantity, metadata: { orgId: org.id, kind: line.kind, id: line.id },
        ...(samePrice ? { price: previous.price.id } : { price_data: { currency: 'dkk', product: await this.product(line), unit_amount: line.unitDkk * 100, recurring: { interval: 'month' } } }) });
    }
    for (const item of current?.items.data ?? []) if (!items.some(value => value.id === item.id)) items.push({ id: item.id, deleted: true });
    const collection = billing.method === 'invoice' ? { collection_method: 'send_invoice' as const, days_until_due: 14 } : { collection_method: 'charge_automatically' as const };
    const taxes = this.taxRate ? { default_tax_rates: [this.taxRate] } : {};
    const key = createHash('sha256').update(JSON.stringify([billing.customerId, billing.revision, current?.id, lines, collection, proration])).digest('hex');
    if (current) await this.client.subscriptions.update(current.id, { items, ...collection, ...taxes, proration_behavior: proration,
      ...(billing.method === 'card' ? { default_payment_method: '' } : {}) }, { idempotencyKey: `org-sync-${key}` });
    else await this.client.subscriptions.create({ customer: billing.customerId!, metadata: { orgId: org.id },
      items: items as Stripe.SubscriptionCreateParams.Item[], ...taxes,
      ...(billing.method === 'invoice' ? { collection_method: 'send_invoice', days_until_due: 14 } : { collection_method: 'charge_automatically' }),
      payment_behavior: 'default_incomplete' }, { idempotencyKey: `org-subscription-${key}` });
    return this.refresh(org, billing);
  }
  async refresh(org: Organization, billing: OrganizationBilling): Promise<BillingSnapshot> {
    const subscription = await this.latestSubscription(org.id, billing.customerId!);
    const unpaid: UnpaidInvoice[] = [];
    for await (const invoice of this.client.invoices.list({ customer: billing.customerId!, limit: 100 })) {
      if (invoice.status !== 'open' && invoice.status !== 'uncollectible' || invoice.amount_remaining <= 0) continue;
      const dueAt = iso(invoice.due_date ?? invoice.status_transitions.finalized_at ?? invoice.created)!;
      unpaid.push({ id: invoice.id, amountDkk: invoice.amount_remaining / 100, dueAt, url: invoice.hosted_invoice_url ?? null });
    }
    const periodEnd = subscription ? iso(Math.min(...subscription.items.data.map(item => item.current_period_end))) : null;
    return { subscriptionId: subscription?.id ?? null, method: subscription ? subscription.collection_method === 'send_invoice' ? 'invoice' : 'card' : billing.method,
      status: !subscription ? 'none' : subscription.status === 'canceled' || subscription.status === 'incomplete_expired' ? 'cancelled' : subscription.cancel_at_period_end ? 'cancelling' : 'active',
      periodEnd, endsAt: subscription?.cancel_at_period_end ? iso(subscription.cancel_at) ?? periodEnd : null, unpaid };
  }
  private async latestSubscription(orgId: string, customerId: string): Promise<Stripe.Subscription | undefined> {
    let subscription: Stripe.Subscription | undefined;
    // Customer lookup also recovers a create that succeeded before local storage failed.
    for await (const candidate of this.client.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })) {
      if (candidate.metadata.orgId !== orgId) continue;
      const active = !['canceled', 'incomplete_expired'].includes(candidate.status);
      const previousActive = subscription && !['canceled', 'incomplete_expired'].includes(subscription.status);
      if (!subscription || active && !previousActive || active === !!previousActive && candidate.created > subscription.created) subscription = candidate;
    }
    return subscription;
  }
  async cancellation(org: Organization, billing: OrganizationBilling, cancel: boolean) {
    await this.client.subscriptions.update(billing.subscriptionId!, { cancel_at_period_end: cancel });
    return this.refresh(org, billing);
  }
  async cancelNow(billing: OrganizationBilling) { if (billing.subscriptionId) await this.client.subscriptions.cancel(billing.subscriptionId, { prorate: false, invoice_now: false }); }
  async portal(customerId: string, returnUrl: string) { return { url: (await this.client.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl })).url }; }
  readWebhook(rawBody: string, signature: string | undefined): BillingEvent {
    if (!signature || !this.secret) throw new BillingSignatureError();
    let event: Stripe.Event;
    try { event = this.client.webhooks.constructEvent(rawBody, signature, this.secret); } catch { throw new BillingSignatureError(); }
    const object = event.data.object as { customer?: string | { id: string } | null; id: string; mode?: string };
    const customerId = id(object.customer);
    return customerId ? { customerId, ...(event.type === 'checkout.session.completed' && object.mode === 'setup' ? { sessionId: object.id } : {}) } : null;
  }
}
export function createOrganizationBillingService(): OrganizationBillingService | null {
  if (getServicesMode() === 'isolated') return new FakeOrganizationBillingService();
  return hasStripeConfig() ? new StripeOrganizationBillingService() : null;
}
