import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { FakePaymentService, StripePaymentService, PaymentSignatureError } from './paymentService.js';

const session = { id: 'cs_refund', mode: 'payment', currency: 'dkk', payment_status: 'paid', amount_total: 49900,
  metadata: { userId: 'learner', courseId: 'course' }, customer: 'cus_fixture' };
describe.each(['fake', 'stripe'])('US-L025 offline webhook adapter (%s)', kind => {
  function setup() {
    const client = new Stripe('sk_test_synthetic_offline');
    const list = vi.spyOn(client.checkout.sessions, 'list').mockResolvedValue({ data: [session], has_more: false } as never);
    const service = kind === 'fake' ? new FakePaymentService() : new StripePaymentService(client, 'whsec_synthetic_offline');
    const read = (object: unknown, signatureValid = true) => {
      const body = JSON.stringify({ type: 'charge.refunded', data: { object } });
      const signature = kind === 'fake' ? 'fake-signature' : client.webhooks.generateTestHeaderString({ payload: body, secret: 'whsec_synthetic_offline' });
      return service.readWebhookEvent(body, signatureValid ? signature : 'wrong');
    };
    return { service, list, read };
  }
  it.each([{ refunded: true }, { amount: 49900, amount_refunded: 49900 }, { amount: 49900, amount_refunded: 50000 }])('US-L025-AC01 recognizes a full refund (%j)', fields => {
    const { read } = setup();
    expect(read({ id: 'ch_fixture', payment_intent: 'pi_fixture', ...fields })).toEqual({ paymentIntentId: 'pi_fixture' });
    expect(read({ id: 'ch_fixture', payment_intent: { id: 'pi_fixture' }, ...fields })).toEqual({ paymentIntentId: 'pi_fixture' });
  });
  it('US-L025-AC02 partial and zero-amount events do not revoke access, signatures stay required', () => {
    const { read } = setup();
    expect(read({ payment_intent: 'pi_fixture', amount: 49900, amount_refunded: 100, refunded: false })).toBeNull();
    expect(read({ payment_intent: 'pi_fixture', amount: 0, amount_refunded: 0 })).toBeNull();
    expect(() => read({ payment_intent: 'pi_fixture', refunded: true }, false)).toThrow(PaymentSignatureError);
    expect(read({ payment_intent: 'pi_fixture', refunded: true })).toEqual({ paymentIntentId: 'pi_fixture' });
  });
  it('US-L025-AC04 missing intent is ignored, unknown intent returns no Checkout', async () => {
    const { service, list, read } = setup();
    expect(read({ refunded: true })).toBeNull();
    expect(typeof service.findCheckoutByPaymentIntent).toBe('function');
    list.mockResolvedValue({ data: [], has_more: false } as never);
    expect(await service.findCheckoutByPaymentIntent('pi_unknown')).toBeNull();
  });
});
it('US-L025-AC01 Stripe finds the original Checkout by payment intent using only injected SDK transport', async () => {
  const client = new Stripe('sk_test_synthetic_offline');
  const list = vi.spyOn(client.checkout.sessions, 'list').mockResolvedValue({ data: [session], has_more: false } as never);
  const service = new StripePaymentService(client, 'whsec_synthetic_offline');
  expect(typeof service.findCheckoutByPaymentIntent).toBe('function');
  expect(await service.findCheckoutByPaymentIntent('pi_fixture')).toEqual({ id: 'cs_refund', paid: true, userId: 'learner', courseId: 'course', amountDkk: 499, customerId: 'cus_fixture' });
  expect(list).toHaveBeenCalledWith({ payment_intent: 'pi_fixture', limit: 1 });
  list.mockResolvedValue({ data: [{ ...session, currency: 'eur' }], has_more: false } as never);
  expect(await service.findCheckoutByPaymentIntent('pi_foreign')).toBeNull();
});
