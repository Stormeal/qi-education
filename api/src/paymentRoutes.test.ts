import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryPaymentRepository, type CoursePayment } from './paymentRepository.js';
import { FakePaymentService } from './paymentService.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

class CountingPayments extends InMemoryPaymentRepository {
  readonly stored: CoursePayment[] = [];
  override async add(payment: CoursePayment) {
    const added = await super.add(payment);
    if (added) this.stored.push(structuredClone(payment));
    return added;
  }
}
describe('US-L024 course payments HTTP contract', () => {
  let server: Server, base: string, auth: InMemoryAuthRepository, courses: InMemoryCourseRepository;
  let payments: CountingPayments, service: FakePaymentService, student: AuthUser, teacher: AuthUser, admin: AuthUser;
  const id = 'demo-course-1', coursePath = `/users/me/courses/${id}`, returnUrl = `http://localhost:4200/courses/${id}`;
  const request = (path: string, user: AuthUser | undefined = student, body?: unknown, method = 'POST') => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(user ? { authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const webhook = (sessionId: string, signature = 'fake-signature', prefix = '') => fetch(base + prefix + '/webhooks/stripe', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
    body: JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: sessionId, payment_status: 'paid' } } }),
  });
  async function start(user = student) {
    const response = await request(coursePath + '/checkout', user, { returnUrl });
    expect(response.status).toBe(200);
    const { url } = await response.json();
    return new URL(url).searchParams.get('session_id')!;
  }
  beforeEach(async () => {
    auth = new InMemoryAuthRepository(); courses = new InMemoryCourseRepository();
    student = (await auth.findByEmail('student@qi-education.local'))!;
    teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    (await courses.listCourses())[0].ownerUserId = teacher.id;
    payments = new CountingPayments(); service = new FakePaymentService();
    const content = new InMemoryCourseContentRepository();
    await content.createEmptyCourseContent(id, '2026-10-20T00:00:00.000Z');
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content, paymentRepository: payments, paymentService: service }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect((await request(`/courses/${id}/price`, admin, { priceDkk: 499 }, 'PATCH')).status).toBe(200);
  });
  afterEach(async () => { vi.restoreAllMocks(); await new Promise<void>(resolve => server.close(() => resolve())); });
  it('US-L024-AC01 checkout answers a success URL for a priced published course', async () => {
    const sessionId = await start();
    expect(await service.readCheckout(sessionId)).toMatchObject({ paid: true, amountDkk: 499, userId: student.id, courseId: id });
    expect(payments.stored).toHaveLength(0);
  });
  it('checkout refuses free, unpublished, unknown and enrolled courses', async () => {
    expect((await request('/users/me/courses/missing/checkout', student, { returnUrl })).status).toBe(404);
    expect((await request(`/courses/${id}/price`, admin, { priceDkk: 0 }, 'PATCH')).status).toBe(200);
    expect((await request(coursePath + '/checkout', student, { returnUrl })).status).toBe(400);
    (await courses.listCourses())[0].status = 'draft';
    expect((await request(coursePath + '/checkout', student, { returnUrl })).status).toBe(403);
    (await courses.listCourses())[0].status = 'published';
    await courses.updateCoursePrice(id, { priceDkk: 499 });
    await auth.enrollUserInCourse(student.id, id);
    expect((await request(coursePath + '/checkout', student, { returnUrl })).status).toBe(409);
  });
  it.each(['https://foreign.test/courses/c1', 'not a URL', 'http://localhost:4200.evil.test/'])('refuses a foreign return address %s', async address => {
    for (const path of [coursePath + '/checkout', '/users/me/billing-portal']) {
      const response = await request(path, student, { returnUrl: address });
      expect(response.status).toBe(400); expect(await response.json()).toEqual({ message: 'Return address is not allowed.' });
    }
  });
  it('US-L024-AC01 AC04 confirm enrolls once and answers paid with user', async () => {
    const sessionId = await start();
    for (let i = 0; i < 2; i++) {
      const response = await request(coursePath + '/checkout/confirm', student, { sessionId });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ paid: true, user: { id: student.id, enrolledCourseIds: [id] }, permissions: expect.any(Object) });
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
    expect(payments.stored).toHaveLength(1);
    expect(payments.stored[0]).toMatchObject({ _id: sessionId, amountDkk: 499, stripeCustomerId: `fake_cus_${student.id}` });
  });
  it('US-L024-AC05 confirm answers paid false for an unpaid session', async () => {
    const sessionId = await start(), session = (await service.readCheckout(sessionId))!;
    vi.spyOn(service, 'readCheckout').mockResolvedValue({ ...session, paid: false });
    const response = await request(coursePath + '/checkout/confirm', student, { sessionId });
    expect(await response.json()).toEqual({ paid: false }); expect(payments.stored).toHaveLength(0);
    expect((await auth.findById(student.id))!.enrolledCourseIds).not.toContain(id);
  });
  it('refuses a foreign session for another user or course and unknown sessions', async () => {
    const sessionId = await start();
    for (const [path, user, sid] of [[coursePath, teacher, sessionId], ['/users/me/courses/other', student, sessionId], [coursePath, student, 'missing']] as const) {
      expect((await request(path + '/checkout/confirm', user, { sessionId: sid })).status).toBe(404);
    }
    expect(payments.stored).toHaveLength(0);
  });
  it('US-L024-AC04 records once when confirm and webhook race', async () => {
    const sessionId = await start();
    const responses = await Promise.all([request(coursePath + '/checkout/confirm', student, { sessionId }), webhook(sessionId), webhook(sessionId, 'fake-signature', '/api')]);
    expect(responses.map(r => r.status)).toEqual([200, 200, 200]);
    expect(payments.stored).toHaveLength(1);
    expect((await auth.findById(student.id))!.enrolledCourseIds.filter(c => c === id)).toHaveLength(1);
  });
  it('US-L024-AC04 webhook first, duplicate webhook then confirm are harmless', async () => {
    const sessionId = await start();
    expect((await webhook(sessionId)).status).toBe(200);
    expect((await webhook(sessionId)).status).toBe(200);
    expect((await request(coursePath + '/checkout/confirm', student, { sessionId })).status).toBe(200);
    expect(payments.stored).toHaveLength(1);
  });
  it('US-L024-AC06 webhook with a wrong signature answers 400 and stores nothing', async () => {
    expect((await webhook(await start(), 'wrong')).status).toBe(400);
    expect(payments.stored).toHaveLength(0);
    expect((await auth.findById(student.id))!.enrolledCourseIds).not.toContain(id);
  });
  it('storage failure answers 500 for webhook retries', async () => {
    const sessionId = await start(); vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(payments, 'add').mockRejectedValue(new Error('Storage unavailable'));
    expect((await webhook(sessionId)).status).toBe(500);
    expect((await auth.findById(student.id))!.enrolledCourseIds).not.toContain(id);
  });
  it('retries enrollment after payment was stored but enrollment failed', async () => {
    const sessionId = await start(); vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(auth, 'enrollUserInCourse').mockRejectedValueOnce(new Error('Account store unavailable'));
    expect((await webhook(sessionId)).status).toBe(500);
    expect((await webhook(sessionId)).status).toBe(200);
    expect(payments.stored).toHaveLength(1);
    expect((await auth.findById(student.id))!.enrolledCourseIds).toContain(id);
  });
  it('US-L024-AC03 enroll in a priced course answers 402; author and admin enroll free', async () => {
    const response = await request(coursePath);
    expect(response.status).toBe(402); expect(await response.json()).toEqual({ message: 'This course must be bought.' });
    expect((await auth.findById(student.id))!.enrolledCourseIds).not.toContain(id);
    for (const user of [teacher, admin]) expect((await request(coursePath, user)).status).toBe(200);
  });
  it('US-L024-AC02 learner enrolled before the price keeps access', async () => {
    await courses.updateCoursePrice(id, { priceDkk: null });
    expect((await request(coursePath)).status).toBe(200);
    await request(`/courses/${id}/price`, admin, { priceDkk: 499 }, 'PATCH');
    expect((await request(`/courses/${id}/content`, student, undefined, 'GET')).status).toBe(200);
  });
  it('US-L024-AC07 billing portal answers 404 before a payment and a URL after', async () => {
    const response = await request('/users/me/billing-portal', student, { returnUrl });
    expect(response.status).toBe(404); expect(await response.json()).toEqual({ message: 'No payments yet.' });
    await request(coursePath + '/checkout/confirm', student, { sessionId: await start() });
    expect(await (await request('/users/me/billing-portal', student, { returnUrl })).json()).toEqual({ url: returnUrl });
  });
  it('US-L024-AC05 provider failures answer 503 for checkout, confirm and portal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sessionId = await start();
    await request(coursePath + '/checkout/confirm', student, { sessionId });
    vi.spyOn(service, 'createCheckout').mockRejectedValue(new Error('Offline'));
    vi.spyOn(service, 'readCheckout').mockRejectedValue(new Error('Offline'));
    vi.spyOn(service, 'createPortal').mockRejectedValue(new Error('Offline'));
    for (const [path, body] of [[coursePath + '/checkout', { returnUrl }], [coursePath + '/checkout/confirm', { sessionId }], ['/users/me/billing-portal', { returnUrl }]] as const) {
      const response = await request(path, path.endsWith('/checkout') ? teacher : student, body);
      expect(response.status).toBe(503); expect(await response.json()).toEqual({ message: 'Purchases are temporarily unavailable.' });
    }
  });
  it('no payment service answers 503 and health reports its availability', async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    server = createServer({ authRepository: auth, courseRepository: courses, paymentRepository: payments, paymentService: null }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const [path, body] of [[coursePath + '/checkout', { returnUrl }], [coursePath + '/checkout/confirm', { sessionId: 'cs_1' }], ['/users/me/billing-portal', { returnUrl }]] as const) {
      const response = await request(path, student, body);
      expect(response.status).toBe(503); expect(await response.json()).toEqual({ message: 'Purchases are temporarily unavailable.' });
    }
    expect(await (await request('/health/config', undefined, undefined, 'GET')).json()).toMatchObject({ payments: { configured: false, keyMode: null } });
  });
  it('disabled accounts cannot start checkout but a completed payment still enrolls', async () => {
    const sessionId = await start(); await auth.updateStatus(student.id, 'disabled');
    expect((await request(coursePath + '/checkout', student, { returnUrl })).status).toBe(401);
    expect((await webhook(sessionId)).status).toBe(200);
    expect((await auth.findById(student.id))!.enrolledCourseIds).toContain(id);
  });
  it('price changes and archival during checkout preserve the paid price and grant access', async () => {
    const sessionId = await start(); await courses.updateCoursePrice(id, { priceDkk: 900 });
    (await courses.listCourses())[0].status = 'archived';
    expect((await request(coursePath + '/checkout/confirm', student, { sessionId })).status).toBe(200);
    expect(payments.stored[0].amountDkk).toBe(499);
    expect((await request(`/courses/${id}/content`, student, undefined, 'GET')).status).toBe(200);
  });
});
