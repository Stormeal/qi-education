import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { authStoreDouble } from '../test/authStoreDouble.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { createSessionToken } from './auth.js';
import { apiConfig } from './config.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryPaymentRepository } from './paymentRepository.js';
import { FakePaymentService } from './paymentService.js';
import { createServer } from './server.js';
let servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve())))); servers = []; vi.restoreAllMocks(); });
it.each([['', false, false], ['/api', false, false], ['', true, false], ['/api', true, false], ['', true, true], ['/api', true, true]] as const)('DEF-050 two instances classify purchases atomically (%s, same-session=%s, distinct-after-replay=%s)', async (prefix, replay, extra) => {
  const user = (await new InMemoryAuthRepository().findByEmail('student@qi-education.local'))!;
  const store = authStoreDouble([user]); const courses = new InMemoryCourseRepository();
  const payments = new InMemoryPaymentRepository(), service = new FakePaymentService();
  await courses.updateCoursePrice('demo-course-1', { priceDkk: 499 });
  const bases = [store.repository(), store.repository()].map(auth => {
    const server = createServer({ authRepository: auth, courseRepository: courses, paymentRepository: payments, paymentService: service }).listen(0);
    servers.push(server); return `http://127.0.0.1:${(server.address() as AddressInfo).port}${prefix}`;
  });
  const request = (base: string, path: string, body: unknown) => fetch(base + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + createSessionToken(user, apiConfig.AUTH_TOKEN_SECRET) }, body: JSON.stringify(body) });
  const path = '/users/me/courses/demo-course-1/checkout';
  const sessionIds = await Promise.all(bases.map(async base => {
    const response = await request(base, path, { returnUrl: 'http://localhost:4200/courses/demo-course-1' });
    expect(response.status).toBe(200); return new URL((await response.json()).url).searchParams.get('session_id')!;
  }));
  const secondSession = sessionIds[1];
  if (replay) sessionIds[1] = sessionIds[0];
  let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; }); let arrived = 0;
  const add = payments.add.bind(payments);
  vi.spyOn(payments, 'add').mockImplementation(async record => {
    const result = await add(record);
    if (replay && (!result || record._id !== sessionIds[0])) return result;
    if (!replay && ++arrived === 2) release();
    await barrier; return result;
  });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const confirm = request(bases[0], path + '/confirm', { sessionId: sessionIds[0] });
  const webhook = fetch(bases[1] + '/webhooks/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 'fake-signature' },
    body: JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: sessionIds[1], payment_status: 'paid' } } }) });
  if (replay) {
    try {
      expect((await webhook).status).toBe(200);
      if (extra) expect((await request(bases[1], path + '/confirm', { sessionId: secondSession })).status).toBe(200);
    } finally { release(); }
  }
  expect((await Promise.all([confirm, webhook])).map(response => response.status)).toEqual([200, 200]);
  expect((await store.repository().findById(user.id))?.enrolledCourseIds).toEqual(['demo-course-1']);
  expect(await payments.latestCustomerId(user.id)).toBe(`fake_cus_${user.id}`);
  expect(await add({ _id: sessionIds[0], userId: user.id, courseId: 'demo-course-1', amountDkk: 499, stripeCustomerId: 'fixture', paidAt: '2026-10-20' })).toBe(false);
  expect(await add({ _id: sessionIds[1], userId: user.id, courseId: 'demo-course-1', amountDkk: 499, stripeCustomerId: 'fixture', paidAt: '2026-10-20' })).toBe(false);
  expect(log.mock.calls.filter(call => call[0] === 'Duplicate course purchase')).toHaveLength(replay && !extra ? 0 : 1);
  if (extra) expect(log).toHaveBeenCalledWith('Duplicate course purchase', { sessionId: secondSession, userId: user.id, courseId: 'demo-course-1' });
  expect((await request(bases[0], path + '/confirm', { sessionId: sessionIds[0] })).status).toBe(200);
  expect(log.mock.calls.filter(call => call[0] === 'Duplicate course purchase')).toHaveLength(replay && !extra ? 0 : 1);
});
