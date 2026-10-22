import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAuthCollection } from '../test/fakeAuthCollection.js';
import { fakePaymentCollection } from '../test/fakePaymentCollection.js';
import { createSessionToken, type AuthUser } from './auth.js';
import { InMemoryAuthRepository, type AuthRepository } from './authRepository.js';
import { ReadOnlyAuthRepository } from './authStore.js';
import { MongoAuthRepository } from './mongoAuthRepository.js';
import { InMemoryPaymentRepository, MongoPaymentRepository, type PaymentRepository } from './paymentRepository.js';
import { FakePaymentService } from './paymentService.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { InMemoryLessonNotesRepository } from './lessonNotesRepository.js';
import { InMemoryAccountCareersRepository } from './accountCareersRepository.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

const courseId = 'demo-course-1', path = '/users/me/courses/' + courseId + '/checkout';
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
describe.each(['memory', 'mongo'])('US-L025 refund HTTP (%s)', kind => {
  describe.each(['', '/api'])('alias %s', prefix => {
    let servers: Server[], base: string, auth: AuthRepository, payments: PaymentRepository, user: AuthUser;
    let courses: InMemoryCourseRepository, content: InMemoryCourseContentRepository, service: FakePaymentService;
    let progress: InMemoryLearningProgressRepository, notes: InMemoryLessonNotesRepository, careers: InMemoryAccountCareersRepository;
    let authFake: ReturnType<typeof fakeAuthCollection>;
    async function start(repository = auth) {
      const server = createServer({ authRepository: repository, courseRepository: courses, courseContentRepository: content,
        paymentRepository: payments, paymentService: service, learningProgressRepository: progress, lessonNotesRepository: notes,
        accountCareersRepository: careers, muxVideoService: null, muxWebhookService: null,
      }).listen(0, '127.0.0.1');
      servers.push(server); await new Promise<void>(resolve => server.once('listening', resolve));
      return `http://127.0.0.1:${(server.address() as AddressInfo).port}${prefix}`;
    }
    const request = (route: string, body?: unknown, method = 'POST', origin = base) => fetch(origin + route, { method,
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + createSessionToken(user, apiConfig.AUTH_TOKEN_SECRET) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    async function checkout() {
      const response = await request(path, { returnUrl: 'http://localhost:4200/courses/' + courseId });
      expect(response.status).toBe(200); return new URL((await response.json()).url).searchParams.get('session_id')!;
    }
    async function buy(id?: string) {
      const sessionId = id ?? await checkout();
      expect((await request(path + '/confirm', { sessionId })).status).toBe(200); return sessionId;
    }
    const webhook = (body: unknown, origin = base, signature = 'fake-signature') => fetch(origin + '/webhooks/stripe', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': signature }, body: JSON.stringify(body) });
    const refund = (id: string, full = true, origin = base) => webhook({ type: 'charge.refunded', data: { object: {
      id: 'charge-fixture', payment_intent: 'fake_pi_' + id, amount: 49900, amount_refunded: full ? 49900 : 24900, refunded: full,
    } } }, origin);
    async function enrolled() { return (await auth.findById(user.id))!.enrolledCourseIds; }
    beforeEach(async () => {
      servers = []; const seed = new InMemoryAuthRepository(); user = (await seed.findByEmail('student@qi-education.local'))!;
      authFake = fakeAuthCollection(); auth = kind === 'memory' ? seed : new MongoAuthRepository(async () => authFake.collection);
      if (kind === 'mongo') for (const account of await seed.listUsers()) await auth.createUser(account);
      const paymentFake = fakePaymentCollection(); payments = kind === 'memory' ? new InMemoryPaymentRepository() : new MongoPaymentRepository(async () => paymentFake.collection);
      courses = new InMemoryCourseRepository(); await courses.updateCoursePrice(courseId, { priceDkk: 499 });
      content = new InMemoryCourseContentRepository(); await content.updateCourseContent(courseId, [{ id: 's', title: 'Lessons', components: [{ id: 'lesson', type: 'text', title: 'Read', content: 'Keep this learning material', durationMinutes: 0, resourceUrl: '', attachments: [] }] }]);
      service = new FakePaymentService(); progress = new InMemoryLearningProgressRepository(); notes = new InMemoryLessonNotesRepository(); careers = new InMemoryAccountCareersRepository();
      await auth.enrollUserInCourse(user.id, 'other-course');
      await progress.complete(user.id, courseId, 'lesson');
      await notes.add(user.id, courseId, { componentId: 'lesson', text: 'Keep my note', videoSeconds: null });
      await careers.mutate(user.id, { followedPathIds: [], focusPathId: null, achievements: [{ actionId: 'earned-proof', provenance: 'self-reported', declaredAt: '2026-10-22' }] }, () => {});
      base = await start(); vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(async () => { await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve())))); vi.restoreAllMocks(); });

    it('US-L025-AC01 full refund removes access and preserves learning records and other enrollments', async () => {
      const id = await buy(), savedProgress = await progress.get(user.id, courseId), savedNotes = await notes.list(user.id, courseId), savedAchievements = await careers.get(user.id);
      const response = await refund(id); expect(response.status).toBe(200); expect(await response.json()).toEqual({ received: true });
      expect(await enrolled()).toEqual(['other-course']);
      expect((await payments.findById(id))?.refundedAt).toEqual(expect.any(String));
      expect(await careers.get(user.id)).toEqual(savedAchievements);
      expect(await progress.get(user.id, courseId)).toEqual(savedProgress); expect(await notes.list(user.id, courseId)).toEqual(savedNotes);
      expect((await (await request('/me', undefined, 'GET')).json()).user.enrolledCourseIds).toEqual(['other-course']);
      const login = await request('/auth/login', { email: user.email, password: 'Password123!' });
      expect((await login.json()).user.enrolledCourseIds).toEqual(['other-course']);
      expect((await request('/courses/' + courseId + '/content', undefined, 'GET')).status).toBe(403);
      if (kind === 'mongo') expect(authFake.documents.get(user.id)?.enrollmentPurchases?.[createHash('sha256').update(courseId).digest('hex')]).toBeUndefined();
    });
    it('US-L025-AC02 partial refund keeps access until the remainder is fully refunded', async () => {
      const id = await buy(); expect((await refund(id, false)).status).toBe(200); expect(await enrolled()).toContain(courseId);
      expect((await request('/courses/' + courseId + '/content', undefined, 'GET')).status).toBe(200);
      expect((await refund(id)).status).toBe(200); expect(await enrolled()).not.toContain(courseId);
    });
    it('US-L025-AC03 refund of one duplicate purchase keeps access until both are refunded', async () => {
      const first = await checkout(), second = await checkout(); await buy(first); await buy(second);
      expect((await refund(first)).status).toBe(200); expect(await enrolled()).toContain(courseId);
      if (kind === 'mongo') expect(authFake.documents.get(user.id)?.enrollmentPurchases?.[createHash('sha256').update(courseId).digest('hex')]).toBe(second);
      expect((await refund(second)).status).toBe(200); expect(await enrolled()).not.toContain(courseId);
    });
    it('US-L025-AC04 repeated, unknown and late refunds are harmless and safely logged', async () => {
      const id = await buy(); expect((await refund(id)).status).toBe(200); expect((await refund(id)).status).toBe(200);
      expect(await enrolled()).not.toContain(courseId);
      expect((await refund('unknown')).status).toBe(200);
      expect(console.warn).toHaveBeenCalledWith('Refund for unknown payment', { paymentIntentId: 'fake_pi_unknown' });
      const newId = await buy(); expect((await refund(id)).status).toBe(200); expect(await enrolled()).toContain(courseId);
      expect((await refund(newId)).status).toBe(200); expect(await enrolled()).not.toContain(courseId);
    });
    it('US-L025-AC05 buying again restores access and earlier progress, old paid replays do not', async () => {
      const id = await buy(); expect((await refund(id)).status).toBe(200);
      await buy(id); expect(await enrolled()).not.toContain(courseId);
      const newId = await buy(); expect(newId).not.toBe(id); expect(await enrolled()).toContain(courseId);
      expect((await progress.get(user.id, courseId))?.completedIds).toEqual(['lesson']); expect(await notes.list(user.id, courseId)).toHaveLength(1);
      expect(console.error).not.toHaveBeenCalledWith('Duplicate course purchase', expect.objectContaining({ sessionId: newId }));
    });
    it.each(['marker', 'account', 'purchase-query'] as const)('US-L025-AC01 storage failure at %s retries without losing the refund', async stage => {
      const id = await buy();
      const fail = new Error('SYNTHETIC_PRIVATE_STORAGE_FAILURE');
      if (stage === 'marker') vi.spyOn(payments, 'markRefunded').mockRejectedValueOnce(fail);
      else if (stage === 'account') vi.spyOn(auth, 'reconcileCoursePurchase').mockRejectedValueOnce(fail);
      else vi.spyOn(payments, 'findUnrefundedPurchase').mockRejectedValueOnce(fail);
      const failed = await refund(id); expect(failed.status).toBe(500);
      expect(await failed.json()).toEqual({ message: 'Unexpected server error' }); expect(await enrolled()).toContain(courseId);
      expect((await refund(id)).status).toBe(200); expect(await enrolled()).not.toContain(courseId);
      expect((await payments.findById(id))?.refundedAt).toEqual(expect.any(String));
    });
    it('US-L025-AC04 unknown stored session and invalid signatures do not mutate enrollments', async () => {
      const unknown = await checkout();
      expect((await refund(unknown)).status).toBe(200);
      expect(console.warn).toHaveBeenCalledWith('Refund for unknown payment', { sessionId: unknown });
      const id = await buy(unknown);
      const event = { type: 'charge.refunded', data: { object: { refunded: true, payment_intent: 'fake_pi_' + id } } };
      expect((await webhook(event, base, 'wrong-signature')).status).toBe(400);
      expect((await payments.findById(id))?.refundedAt).toBeUndefined(); expect(await enrolled()).toContain(courseId);
    });
    it.each(['teacher', 'admin'] as const)('US-L025-AC01 refund keeps %s author access', async role => {
      const id = await buy(); await auth.updateRole(user.id, role);
      (await courses.listCourses())[0].ownerUserId = user.id;
      expect((await refund(id)).status).toBe(200); expect(await enrolled()).not.toContain(courseId);
      expect((await request('/courses/' + courseId + '/content', undefined, 'GET')).status).toBe(200);
    });
    it('US-L025-AC01 a refund arriving during a paid grant cannot be undone by that grant', async () => {
      const id = await checkout(); const entered = deferred(), release = deferred();
      const grant = auth.enrollUserInCourseWithChange.bind(auth);
      vi.spyOn(auth, 'enrollUserInCourseWithChange').mockImplementationOnce(async (...args) => { entered.resolve(); await release.promise; return grant(...args); });
      const otherAuth = kind === 'mongo' ? new MongoAuthRepository(async () => authFake.collection) : auth;
      const other = await start(otherAuth);
      const paid = request(path + '/confirm', { sessionId: id }); await entered.promise;
      try { expect((await refund(id, true, other)).status).toBe(200); }
      finally { release.resolve(); }
      expect((await paid).status).toBe(200); expect(await enrolled()).not.toContain(courseId);
    });
    it('US-L025-AC05 a purchase during an older refund reconciliation retains access', async () => {
      const first = await checkout(), second = await checkout(); await buy(first);
      const entered = deferred(), release = deferred(), reconcile = auth.reconcileCoursePurchase.bind(auth);
      vi.spyOn(auth, 'reconcileCoursePurchase').mockImplementationOnce(async (...args) => { entered.resolve(); await release.promise; return reconcile(...args); });
      const otherAuth = kind === 'mongo' ? new MongoAuthRepository(async () => authFake.collection) : auth;
      const other = await start(otherAuth); const refunded = refund(first); await entered.promise;
      try { expect((await request(path + '/confirm', { sessionId: second }, 'POST', other)).status).toBe(200); }
      finally { release.resolve(); }
      expect((await refunded).status).toBe(200); expect(await enrolled()).toContain(courseId);
      expect(console.error).not.toHaveBeenCalledWith('Duplicate course purchase', expect.objectContaining({ sessionId: second }));
      expect((await auth.enrollUserInCourseWithChange(user.id, courseId, second))?.purchaseSessionId).toBe(second);
    });
    it('US-L025-AC03 overlapping refunds of both purchases cannot leave access', async () => {
      const first = await checkout(), second = await checkout(); await buy(first); await buy(second);
      const entered = deferred(), release = deferred(), reconcile = auth.reconcileCoursePurchase.bind(auth);
      vi.spyOn(auth, 'reconcileCoursePurchase').mockImplementationOnce(async (...args) => { entered.resolve(); await release.promise; return reconcile(...args); });
      const otherAuth = kind === 'mongo' ? new MongoAuthRepository(async () => authFake.collection) : auth;
      const other = await start(otherAuth); const firstRefund = refund(first); await entered.promise;
      try { expect((await refund(second, true, other)).status).toBe(200); }
      finally { release.resolve(); }
      expect((await firstRefund).status).toBe(200); expect(await enrolled()).not.toContain(courseId);
    });
    it('US-L025-AC01 maintenance freeze refuses removal and replay finishes after unfreezing', async () => {
      const id = await buy(); const frozen = await start(new ReadOnlyAuthRepository(auth));
      expect((await refund(id, true, frozen)).status).toBe(503); expect(await enrolled()).toContain(courseId);
      expect((await refund(id)).status).toBe(200); expect(await enrolled()).not.toContain(courseId);
    });
  });
});
