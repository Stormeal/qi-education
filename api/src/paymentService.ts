import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { z } from 'zod';
import { apiConfig, getServicesMode, hasStripeConfig } from './config.js';

export type CheckoutSession = {
  id: string; paid: boolean; userId: string; courseId: string; amountDkk: number; customerId: string | null;
};
export type PaidCheckoutEvent = { sessionId: string } | { paymentIntentId: string } | null;
export type CreateCheckoutInput = {
  userId: string; email: string; courseId: string; courseTitle: string; amountDkk: number;
  customerId: string | null; successUrl: string; cancelUrl: string;
};
export interface PaymentService {
  createCheckout(input: CreateCheckoutInput): Promise<{ url: string }>;
  readCheckout(sessionId: string): Promise<CheckoutSession | null>;
  findCheckoutByPaymentIntent(paymentIntentId: string): Promise<CheckoutSession | null>;
  createPortal(customerId: string, returnUrl: string): Promise<{ url: string }>;
  /** Stripe's hosted receipt for a paid Checkout session; null when Stripe has none. */
  receiptUrl(sessionId: string): Promise<string | null>;
  readWebhookEvent(rawBody: string, signature: string | undefined): PaidCheckoutEvent;
}
export class PaymentSignatureError extends Error {}

function paidEvent(event: unknown): PaidCheckoutEvent {
  const { type } = z.object({ type: z.string() }).parse(event);
  if (type === 'charge.refunded') {
    const parsed = z.object({ data: z.object({ object: z.object({
      refunded: z.boolean().optional(), amount: z.number().int().nonnegative().optional(), amount_refunded: z.number().int().nonnegative().optional(),
      payment_intent: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]).nullish(),
    }) }) }).safeParse(event);
    if (!parsed.success) return null;
    const charge = parsed.data.data.object;
    const full = charge.refunded === true || (charge.amount !== undefined && charge.amount > 0 && charge.amount_refunded !== undefined && charge.amount_refunded >= charge.amount);
    const intent = charge.payment_intent;
    return full && intent ? { paymentIntentId: typeof intent === 'string' ? intent : intent.id } : null;
  }
  if (type !== 'checkout.session.completed' && type !== 'checkout.session.async_payment_succeeded') return null;
  const parsed = z.object({ type: z.string(), data: z.object({ object: z.object({ id: z.string(), payment_status: z.string().optional() }) }) }).parse(event);
  if (parsed.type === 'checkout.session.async_payment_succeeded' ||
    parsed.type === 'checkout.session.completed' && parsed.data.object.payment_status === 'paid') return { sessionId: parsed.data.object.id };
  return null;
}

export class FakePaymentService implements PaymentService {
  private readonly sessions = new Map<string, CheckoutSession>();
  async createCheckout(input: CreateCheckoutInput): Promise<{ url: string }> {
    const id = `fake_cs_${randomUUID()}`;
    this.sessions.set(id, { id, paid: true, userId: input.userId, courseId: input.courseId,
      amountDkk: input.amountDkk, customerId: input.customerId ?? `fake_cus_${input.userId}` });
    return { url: input.successUrl.replace('{CHECKOUT_SESSION_ID}', id) };
  }
  async readCheckout(sessionId: string): Promise<CheckoutSession | null> {
    return structuredClone(this.sessions.get(sessionId) ?? null);
  }
  async findCheckoutByPaymentIntent(paymentIntentId: string): Promise<CheckoutSession | null> {
    if (!paymentIntentId.startsWith('fake_pi_')) return null;
    return this.readCheckout(paymentIntentId.slice('fake_pi_'.length));
  }
  async createPortal(_customerId: string, returnUrl: string): Promise<{ url: string }> { return { url: returnUrl }; }
  // Offline runs have no Stripe receipt page to open.
  async receiptUrl(): Promise<string | null> { return null; }
  readWebhookEvent(rawBody: string, signature: string | undefined): PaidCheckoutEvent {
    if (signature !== 'fake-signature') throw new PaymentSignatureError('Invalid Stripe webhook signature.');
    return paidEvent(JSON.parse(rawBody));
  }
}

export class StripePaymentService implements PaymentService {
  constructor(private readonly client: Stripe = new Stripe(apiConfig.STRIPE_SECRET_KEY!, { apiVersion: '2026-09-30.endive' }),
    private readonly webhookSecret = apiConfig.STRIPE_WEBHOOK_SECRET) {}
  async createCheckout(input: CreateCheckoutInput): Promise<{ url: string }> {
    const session = await this.client.checkout.sessions.create({
      mode: 'payment', success_url: input.successUrl, cancel_url: input.cancelUrl,
      client_reference_id: input.userId, metadata: { userId: input.userId, courseId: input.courseId },
      ...(input.customerId ? { customer: input.customerId } : { customer_creation: 'always', customer_email: input.email }),
      payment_intent_data: { setup_future_usage: 'on_session' },
      line_items: [{ quantity: 1, price_data: { currency: 'dkk', unit_amount: Math.round(input.amountDkk * 100), product_data: { name: input.courseTitle } } }],
    });
    if (!session.url) throw new Error('Checkout URL missing.');
    return { url: session.url };
  }
  async readCheckout(sessionId: string): Promise<CheckoutSession | null> {
    let session: Stripe.Checkout.Session;
    try { session = await this.client.checkout.sessions.retrieve(sessionId); }
    catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === 'resource_missing') return null;
      throw error;
    }
    return checkoutSession(session);
  }
  async findCheckoutByPaymentIntent(paymentIntentId: string): Promise<CheckoutSession | null> {
    const sessions = await this.client.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
    return sessions.data[0] ? checkoutSession(sessions.data[0]) : null;
  }

  async createPortal(customerId: string, returnUrl: string): Promise<{ url: string }> {
    const session = await this.client.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return { url: session.url };
  }
  async receiptUrl(sessionId: string): Promise<string | null> {
    const session = await this.client.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] });
    const intent = session.payment_intent;
    const charge = intent && typeof intent !== 'string' ? intent.latest_charge : null;
    return charge && typeof charge !== 'string' ? charge.receipt_url : null;
  }
  readWebhookEvent(rawBody: string, signature: string | undefined): PaidCheckoutEvent {
    if (!this.webhookSecret || !signature) throw new PaymentSignatureError('Invalid Stripe webhook signature.');
    try { return paidEvent(this.client.webhooks.constructEvent(rawBody, signature, this.webhookSecret)); }
    catch (error) {
      if (error instanceof Stripe.errors.StripeSignatureVerificationError) throw new PaymentSignatureError('Invalid Stripe webhook signature.');
      throw error;
    }
  }
}
function checkoutSession(session: Stripe.Checkout.Session): CheckoutSession | null {
  // Refund lookup uses the same course-session boundary as paid confirmation.
  if (session.mode !== 'payment' || session.currency !== 'dkk' || !session.metadata?.userId || !session.metadata?.courseId) return null;
  return { id: session.id, paid: session.payment_status === 'paid', userId: session.metadata.userId,
    courseId: session.metadata.courseId, amountDkk: (session.amount_total ?? 0) / 100,
    customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null };
}
export function createPaymentService(): PaymentService | null {
  if (getServicesMode() === 'isolated') return new FakePaymentService();
  return hasStripeConfig() ? new StripePaymentService() : null;
}
