import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiConfig } from './config.js';
import { createSessionToken } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryOrganizationRepository } from './organizationRepository.js';
import { InMemoryPaymentRepository } from './paymentRepository.js';
import { FakePaymentService } from './paymentService.js';
import { createServer } from './server.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  vi.restoreAllMocks();
});
async function setup(emailConfirmed?: boolean) {
  const auth = new InMemoryAuthRepository(), courses = new InMemoryCourseRepository();
  const seed = (await auth.listUsers())[0];
  const user = await auth.createUser({ ...seed, id: 'confirmation-learner', email: 'confirm@example.test', role: 'student', enrolledCourseIds: [], emailConfirmed });
  const course = (await courses.listCourses())[0];
  course.status = 'published'; course.priceDkk = 0;
  const orgs = new InMemoryOrganizationRepository(), payments = new InMemoryPaymentRepository(), service = new FakePaymentService();
  const server = createServer({ authRepository: auth, courseRepository: courses,
    organizationRepository: orgs, paymentRepository: payments, paymentService: service }).listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body?: unknown) => fetch(base + path, { method: 'POST',
    headers: { authorization: `Bearer ${createSessionToken(user, apiConfig.AUTH_TOKEN_SECRET)}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { auth, courses, course, user, orgs, payments, service, post, path: `/users/me/courses/${course.id}` };
}
describe('US-P020 API-04 confirmation at course acquisition', () => {
  it.each(['', '/api'])('refuses free enrollment and paid checkout before writes/provider calls (%s)', async prefix => {
    const f = await setup(false), create = vi.spyOn(f.service, 'createCheckout');
    const enroll = vi.spyOn(f.auth, 'enrollUserInCourse');
    const free = await f.post(prefix + f.path);
    expect(free.status).toBe(403); expect(await free.json()).toEqual({ message: 'email-not-confirmed' });
    await f.courses.updateCoursePrice(f.course.id, { priceDkk: 499 });
    const paid = await f.post(prefix + f.path + '/checkout', { returnUrl: 'http://localhost:4200/courses/test' });
    expect(paid.status).toBe(403); expect(await paid.json()).toEqual({ message: 'email-not-confirmed' });
    expect(create).not.toHaveBeenCalled(); expect(enroll).not.toHaveBeenCalled();
    expect((await f.auth.findById(f.user.id))?.enrolledCourseIds).toEqual([]);
  });
  it.each([undefined, true])('lets grandfathered and confirmed users acquire courses (%s)', async confirmed => {
    const f = await setup(confirmed);
    expect((await f.post(f.path)).status).toBe(200);
    const paid = { ...f.course, id: 'paid', priceDkk: 499 };
    (await f.courses.listCourses()).push(paid);
    expect((await f.post('/users/me/courses/paid/checkout', { returnUrl: 'http://localhost:4200/courses/paid' })).status).toBe(200);
  });
  it('keeps already-held free enrollment idempotent for an unconfirmed user', async () => {
    const f = await setup(false);
    await f.auth.enrollUserInCourse(f.user.id, f.course.id);
    expect((await f.post(f.path)).status).toBe(200);
  });
  it('allows an unconfirmed active organization member to start an included course', async () => {
    const f = await setup(false), now = new Date().toISOString();
    await f.orgs.createOrganization({ id: 'org', displayName: 'Team', companyName: 'Team', cvr: '12345678', billingEmail: 'bill@example.test', state: 'active', originalOwnerId: f.user.id, createdAt: now });
    await f.orgs.insertMembership({ userId: f.user.id, orgId: 'org', role: 'member', state: 'active', careerId: null, startedCourseIds: [], joinedAt: now, consentAt: now });
    await f.orgs.createCourseRequest({ id: 'grant', orgId: 'org', userId: f.user.id, userName: 'Learner', courseId: f.course.id, state: 'approved', addOnPriceDkk: null, createdAt: now });
    const response = await f.post(f.path);
    expect(response.status).toBe(200);
    expect((await response.json()).user.enrolledCourseIds).toContain(f.course.id);
  });
  it('honors an already-paid checkout even when the account is unconfirmed', async () => {
    const f = await setup(false);
    const { url } = await f.service.createCheckout({ userId: f.user.id, email: f.user.email, courseId: f.course.id, courseTitle: f.course.title, amountDkk: 499, customerId: null, successUrl: 'http://localhost:4200/success?session_id={CHECKOUT_SESSION_ID}', cancelUrl: 'http://localhost:4200/cancel' });
    const sessionId = new URL(url).searchParams.get('session_id');
    const response = await f.post(f.path + '/checkout/confirm', { sessionId });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ paid: true, user: { enrolledCourseIds: [f.course.id] } });
  });
});
