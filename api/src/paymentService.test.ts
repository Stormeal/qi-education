import { afterEach, describe, expect, it, vi } from 'vitest';
import * as config from './config.js';
import { createPaymentService, FakePaymentService, PaymentSignatureError } from './paymentService.js';

describe('US-L024 offline payments', () => {
  afterEach(() => vi.restoreAllMocks());
  it('createPaymentService returns a FakePaymentService in isolated mode', () => {
    expect(createPaymentService()).toBeInstanceOf(FakePaymentService);
  });
  it('fake checkout returns a paid session on the success URL and unknown ids are absent', async () => {
    const service = new FakePaymentService();
    const { url } = await service.createCheckout({ userId: 'u1', email: 'u@example.test', courseId: 'c1', courseTitle: 'Course', amountDkk: 499,
      customerId: null, successUrl: 'http://localhost:4200/courses/c1?payment=success&session_id={CHECKOUT_SESSION_ID}', cancelUrl: 'http://localhost:4200/courses/c1?payment=cancelled' });
    const parsed = new URL(url), id = parsed.searchParams.get('session_id')!;
    expect(id).toMatch(/^fake_cs_/);
    expect(parsed.searchParams.get('payment')).toBe('success');
    expect(await service.readCheckout(id)).toEqual({ id, paid: true, userId: 'u1', courseId: 'c1', amountDkk: 499, customerId: 'fake_cus_u1' });
    expect(await service.readCheckout('unknown')).toBeNull();
  });
  it.each([
    ['checkout.session.completed', 'paid', { sessionId: 'cs_1' }],
    ['checkout.session.completed', 'unpaid', null],
    ['checkout.session.async_payment_succeeded', 'paid', { sessionId: 'cs_1' }],
    ['customer.created', 'paid', null],
  ])('parses signed %s (%s)', (type, payment_status, expected) => {
    expect(new FakePaymentService().readWebhookEvent(JSON.stringify({ type, data: { object: { id: 'cs_1', payment_status } } }), 'fake-signature')).toEqual(expected);
  });
  it('refuses a wrong or absent signature', () => {
    for (const signature of ['wrong', undefined]) expect(() => new FakePaymentService().readWebhookEvent('{}', signature)).toThrow(PaymentSignatureError);
  });
  it.each([['sk_test_x', 'test'], ['sk_live_x', 'live'], [undefined, null]])('reports key mode without exposing the key', (key, expected) => {
    expect(config.stripeKeyMode(key)).toBe(expected);
  });
  it('has no real service in hosted mode without a key', () => {
    vi.spyOn(config, 'getServicesMode').mockReturnValue('hosted');
    expect(createPaymentService()).toBeNull();
  });
});
