import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer } from './server.js';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { apiConfig, getCorsOrigins } from './config.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryOrganizationRepository, MongoOrganizationRepository } from './organizationRepository.js';
import { fakeOrganizationCollections } from './organizationTestSupport.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { careerPathContentSchema } from './careerPath.js';
import { FakeOrganizationBillingService } from './organizationBillingService.js';
import { OrganizationService } from './organizationService.js';

const servers: Server[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve())))); });
const address = { line1: 'Main street 1', postalCode: '8000', city: 'Aarhus' };
const fields = { displayName: 'Team', companyName: 'Company', cvr: '12345678', billingEmail: 'bill@example.test' };
async function fixture(prefix: string, store: string, unavailable = false) {
  let now = Date.parse('2026-11-02T12:00:00.000Z');
  const auth = new InMemoryAuthRepository(), repository = store === 'mongo' ? new MongoOrganizationRepository(fakeOrganizationCollections()) : new InMemoryOrganizationRepository();
  const billing = new FakeOrganizationBillingService(() => now), courses = new InMemoryCourseRepository(), careers = new InMemoryCareerPathRepository();
  const catalog = await courses.listCourses();
  catalog.push(...['included', 'addon'].map(id => ({ ...catalog[0], id, title: id, priceDkk: 100 })));
  const published = careerPathContentSchema.parse({ title: 'Career', steps: [{ id: 'step', title: 'Step', courses: [{ courseId: 'included' }] }] });
  await careers.savePath({ _id: 'career', published, draft: published, revision: 1, updatedAt: '' });
  const owner = (await auth.findByEmail('student@qi-education.local'))!, admin = (await auth.findByEmail('admin@qi-education.local'))!, member = (await auth.findByEmail('teacher@qi-education.local'))!;
  const server = createServer({ authRepository: auth, organizationRepository: repository, organizationBillingService: unavailable ? null : billing,
    courseRepository: courses, careerPathRepository: careers, organizationOptions: { now: () => now },
    mailSender: { provider: 'local', available: true, send: async () => {} }, muxVideoService: null, muxWebhookService: null }).listen(0);
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, user: AuthUser | undefined = owner, method = 'GET', body?: unknown, signature?: string) => fetch(base + prefix + path, {
    method, headers: { 'content-type': 'application/json', ...(user ? { authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}` } : {}), ...(signature ? { 'stripe-signature': signature } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const applied = await (await request('/users/me/organization-request', owner, 'POST', fields)).json();
  const approved = await request(`/admin/organization-requests/${applied.id}/decision`, admin, 'POST', { action: 'approve' });
  expect(approved.status).toBe(200);
  const orgId = (await approved.json()).organizationId, root = `/organizations/${orgId}/billing`;
  await repository.insertMembership({ userId: member.id, orgId, role: 'member', state: 'active', careerId: 'career', startedCourseIds: [], consentAt: '', joinedAt: '' });
  await request('/admin/organization-prices/careers/career', admin, 'PUT', { priceDkk: 200 });
  await request('/admin/organization-prices/courses/addon', admin, 'PUT', { priceDkk: 50 });
  return { auth, repository, billing, courses, careers, owner, admin, member, request, orgId, root, move: (date: string) => { now = Date.parse(date); },
    otherService: new OrganizationService({ repository, auth, courses, careers, billingService: unavailable ? null : billing,
      options: { now: () => now }, sender: { provider: 'local', available: true, send: async () => {} } }),
    returnUrl: `${getCorsOrigins()[0]}/organization` };
}

describe.each(['memory', 'mongo'])('US-O002 billing %s', store => {
  describe.each(['', '/api'])('contract %s', prefix => {
    it('AC01–AC03/AC05 defaults paid, projects state, invoice opens courses and admin toggles Free/Paid', async () => {
      const f = await fixture(prefix, store);
      const read = await f.request(f.root); expect(read.headers.get('cache-control')).toBe('private, no-store');
      expect(await read.json()).toMatchObject({ state: 'setup-needed', method: null, monthlyTotalDkk: 200, nextInvoiceAt: null });
      expect(await (await f.request('/users/me/organization', f.member)).json()).toMatchObject({ billingState: 'setup-needed', openCourseIds: [] });
      const setup = await f.request(f.root + '/setup', f.owner, 'POST', { method: 'invoice', address });
      expect(setup.status).toBe(200); expect(await setup.json()).toMatchObject({ state: 'active', method: 'invoice', monthlyTotalDkk: 200, nextInvoiceAt: expect.any(String) });
      expect(await (await f.request('/users/me/organization', f.member)).json()).toMatchObject({ billingState: 'active', openCourseIds: ['included'] });
      expect(await (await f.request('/admin/organizations', f.admin)).json()).toEqual([expect.objectContaining({ billingState: 'active' })]);
      const free = await f.request(`/admin/organizations/${f.orgId}/billing`, f.admin, 'PUT', { free: true });
      expect(await free.json()).toMatchObject({ billingState: 'free' });
      expect((await f.request(f.root + '/setup', f.owner, 'POST', { method: 'invoice', address })).status).toBe(409);
      expect(await (await f.request(`/admin/organizations/${f.orgId}/billing`, f.admin, 'PUT', { free: false })).json()).toMatchObject({ billingState: 'setup-needed' });
    });
    it('AC01 older organizations read as free and an approval can explicitly choose free', async () => {
      const f = await fixture(prefix, store);
      const application = await (await f.request('/users/me/organization-request', f.admin, 'POST', fields)).json();
      const approved = await (await f.request(`/admin/organization-requests/${application.id}/decision`, f.admin, 'POST', { action: 'approve', billing: 'free' })).json();
      expect(await (await f.request(`/organizations/${approved.organizationId}/billing`, f.admin)).json()).toMatchObject({ state: 'free' });
      await f.repository.createOrganization({ id: 'legacy', ...fields, state: 'active', originalOwnerId: 'legacy-owner', createdAt: '' });
      expect(await (await f.request('/admin/organizations', f.admin)).json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'legacy', billingState: 'free' })]));
    });
    it('AC04 card return requires confirmation, foreign sessions are 404 and method switching works', async () => {
      const f = await fixture(prefix, store);
      const started = await f.request(f.root + '/setup', f.owner, 'POST', { method: 'card', address, returnUrl: f.returnUrl });
      expect(started.status).toBe(200);
      const url = new URL((await started.json()).url), sessionId = url.searchParams.get('session_id');
      expect(url.searchParams.get('billing')).toBe('card'); expect(sessionId).toBeTruthy();
      expect(await (await f.request(f.root)).json()).toMatchObject({ state: 'setup-needed' });
      expect((await f.request(f.root + '/card/confirm', f.owner, 'POST', { sessionId: 'foreign' })).status).toBe(404);
      expect(await (await f.request(f.root + '/card/confirm', f.owner, 'POST', { sessionId })).json()).toMatchObject({ state: 'active', method: 'card' });
      expect(await (await f.request(f.root + '/card/confirm', f.owner, 'POST', { sessionId })).json()).toMatchObject({ state: 'active' });
      expect(await (await f.request(f.root + '/portal', f.owner, 'POST', { returnUrl: f.returnUrl })).json()).toEqual({ url: f.returnUrl });
      expect(await (await f.request(f.root + '/setup', f.owner, 'POST', { method: 'invoice', address })).json()).toMatchObject({ method: 'invoice' });
    });
    it('AC04/AC09/AC10 replaying a confirmed card session cannot undo cancellation or restart expired billing', async () => {
      const f = await fixture(prefix, store);
      const url = new URL((await (await f.request(f.root + '/setup', f.owner, 'POST', { method: 'card', address, returnUrl: f.returnUrl })).json()).url);
      const sessionId = url.searchParams.get('session_id')!;
      await f.request(f.root + '/card/confirm', f.owner, 'POST', { sessionId });
      const cancelled = await (await f.request(f.root + '/cancellation', f.owner, 'PUT', { cancel: true })).json();
      const customerId = (await f.repository.getOrganization(f.orgId))!.billing!.customerId!;
      f.move(cancelled.endsAt);
      const replay = await f.request('/webhooks/stripe-billing', f.owner, 'POST', { customerId, sessionId }, 'fake-billing-signature');
      expect(replay.status).toBe(200);
      expect(await (await f.request(f.root)).json()).toMatchObject({ state: 'cancelled' });
      expect(await (await f.request(f.root + '/card/confirm', f.owner, 'POST', { sessionId })).json()).toMatchObject({ state: 'cancelled' });
    });
    it('AC06/AC07 syncs owner changes with prorations, keeps failed local changes and retries without prorating admin prices', async () => {
      const f = await fixture(prefix, store);
      await f.request(f.root + '/setup', f.owner, 'POST', { method: 'invoice', address });
      const sync = vi.spyOn(f.billing, 'sync');
      sync.mockRejectedValueOnce(new Error('offline'));
      const changed = await f.request(`/organizations/${f.orgId}/members/${f.member.id}/career`, f.owner, 'PUT', { careerId: null });
      expect(changed.status).toBe(200); expect((await f.repository.getOrganization(f.orgId))?.billing?.syncPending).toBe(true);
      expect(await (await f.request(f.root)).json()).toMatchObject({ syncPending: false, monthlyTotalDkk: 0 });
      expect(sync.mock.calls.at(-1)?.[3]).toBe('create_prorations');
      await f.request('/admin/organization-prices/careers/career', f.admin, 'PUT', { priceDkk: 300 });
      expect(sync.mock.calls.at(-1)?.[3]).toBe('none');
      const pending = await (await f.request(`/organizations/${f.orgId}/course-requests`, f.member, 'POST', { courseId: 'addon' })).json();
      expect((await f.request(`/organizations/${f.orgId}/course-requests/${pending.id}/decision`, f.owner, 'POST', { action: 'approve' })).status).toBe(200);
      expect(await (await f.request(f.root)).json()).toMatchObject({ monthlyTotalDkk: 50, lines: expect.arrayContaining([expect.objectContaining({ kind: 'course', quantity: 1 })]) });
      await f.request(`/organizations/${f.orgId}/members/${f.member.id}`, f.owner, 'DELETE');
      expect(await (await f.request(f.root)).json()).toMatchObject({ monthlyTotalDkk: 0 });
    });
    it('AC06 a departing member removes their seat with prorations, and suspension leaves billing alone', async () => {
      const f = await fixture(prefix, store);
      await f.request(f.root + '/setup', f.owner, 'POST', { method: 'invoice', address });
      const sync = vi.spyOn(f.billing, 'sync'), cancel = vi.spyOn(f.billing, 'cancelNow');
      expect((await f.request(`/admin/organizations/${f.orgId}/suspend`, f.admin, 'POST')).status).toBe(200);
      expect(sync).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled();
      expect(await (await f.request(f.root)).json()).toMatchObject({ state: 'active', monthlyTotalDkk: 200 });
      expect(await (await f.request('/users/me/organization', f.member)).json()).toMatchObject({ openCourseIds: [] });
      expect((await f.request('/users/me/organization', f.member, 'DELETE')).status).toBe(204);
      expect(sync.mock.calls.at(-1)?.[3]).toBe('create_prorations');
      expect(await (await f.request(f.root)).json()).toMatchObject({ monthlyTotalDkk: 0 });
    });
    it('AC03/AC06 recovers an interrupted subscription creation without creating another subscription', async () => {
      const f = await fixture(prefix, store), sync = f.billing.sync.bind(f.billing);
      vi.spyOn(f.billing, 'sync').mockImplementationOnce(async (...args) => { await sync(...args); throw new Error('response lost after creating subscription'); });
      expect((await f.request(f.root + '/setup', f.owner, 'POST', { method: 'invoice', address })).status).toBe(503);
      const org = (await f.repository.getOrganization(f.orgId))!;
      const remote = await f.billing.refresh(org, org.billing!);
      expect(remote.subscriptionId).toBeTruthy();
      expect(await (await f.request(f.root)).json()).toMatchObject({ state: 'active', syncPending: false });
      expect((await f.repository.getOrganization(f.orgId))!.billing!.subscriptionId).toBe(remote.subscriptionId);
    });
    it('AC03 serializes provider writes across separate API instances while local member changes can proceed', async () => {
      const f = await fixture(prefix, store), original = f.billing.sync.bind(f.billing);
      let entered!: () => void, release!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
      const sync = vi.spyOn(f.billing, 'sync').mockImplementationOnce(async (...args) => { entered(); await gate; return original(...args); });
      const first = f.request(f.root + '/setup', f.owner, 'POST', { method: 'invoice', address });
      await started;
      const second = f.otherService.setupBilling(f.owner.id, f.orgId, 'invoice', address);
      await new Promise<void>(resolve => setImmediate(resolve));
      const concurrentCalls = sync.mock.calls.length;
      release(); await first; await second;
      expect(concurrentCalls).toBe(1);
      expect(await (await f.request(f.root)).json()).toMatchObject({ state: 'active', syncPending: false });
    });
    it.each(['price-first', 'owner-first'])('AC06/AC07 preserves proration modes after mixed pending changes (%s)', async order => {
      const f = await fixture(prefix, store);
      await f.request(f.root + '/setup', f.owner, 'POST', { method: 'invoice', address });
      const sync = vi.spyOn(f.billing, 'sync').mockRejectedValueOnce(new Error('offline'));
      const price = () => f.request('/admin/organization-prices/careers/career', f.admin, 'PUT', { priceDkk: 300 });
      const career = () => f.request(`/organizations/${f.orgId}/members/${f.member.id}/career`, f.owner, 'PUT', { careerId: null });
      if (order === 'price-first') { await price(); await career(); } else { await career(); await price(); }
      expect(sync).toHaveBeenCalledTimes(3);
      expect(sync.mock.calls.slice(-2).map(call => call[3])).toEqual(order === 'price-first' ? ['none', 'create_prorations'] : ['create_prorations', 'none']);
      expect(await (await f.request(f.root)).json()).toMatchObject({ monthlyTotalDkk: 0, syncPending: false });
    });
    it('AC09 fresh setup after cancellation discards pending lines from the old subscription', async () => {
      const f = await fixture(prefix, store);
      await f.request(f.root + '/setup', f.owner, 'POST', { method: 'invoice', address });
      const sync = vi.spyOn(f.billing, 'sync').mockRejectedValueOnce(new Error('offline'));
      await f.request(`/organizations/${f.orgId}/members/${f.owner.id}/career`, f.owner, 'PUT', { careerId: 'career' });
      const cancelled = await (await f.request(f.root + '/cancellation', f.owner, 'PUT', { cancel: true })).json();
      f.move(cancelled.endsAt);
      await f.request(`/organizations/${f.orgId}/members/${f.owner.id}/career`, f.owner, 'PUT', { careerId: null });
      await f.request(`/organizations/${f.orgId}/members/${f.member.id}/career`, f.owner, 'PUT', { careerId: null });
      sync.mockClear();
      const setup = await f.request(f.root + '/setup', f.owner, 'POST', { method: 'invoice', address });
      expect(setup.status).toBe(200); expect(await setup.json()).toMatchObject({ state: 'active', monthlyTotalDkk: 0 });
      expect(sync.mock.calls.map(call => call[2])).toEqual([[{ kind: 'base', id: 'organization', title: 'QI Academy organization', quantity: 1, unitDkk: 0 }]]);
    });
    it('AC06/AC07 a concurrent owner quantity change cannot prorate a new admin price', async () => {
      const f = await fixture(prefix, store);
      await f.request(f.root + '/setup', f.owner, 'POST', { method: 'invoice', address });
      await f.request(`/organizations/${f.orgId}/members/${f.owner.id}/career`, f.owner, 'PUT', { careerId: 'career' });
      const sync = vi.spyOn(f.billing, 'sync'), setPrice = f.repository.setCareerPrice.bind(f.repository), lock = f.repository.withOrganizationLock.bind(f.repository);
      let priceVisible = false, persisted!: () => void, release!: () => void, attempting!: () => void;
      const ready = new Promise<void>(resolve => { persisted = resolve; }), gate = new Promise<void>(resolve => { release = resolve; }), attempt = new Promise<void>(resolve => { attempting = resolve; });
      vi.spyOn(f.repository, 'setCareerPrice').mockImplementationOnce(async (...args) => { await setPrice(...args); priceVisible = true; persisted(); await gate; });
      vi.spyOn(f.repository, 'withOrganizationLock').mockImplementation((id, operation) => { if (id === f.orgId && priceVisible) attempting(); return lock(id, operation); });
      const priceChange = f.otherService.setCareerPrice('career', 500); await ready;
      const memberChange = f.otherService.setCareer(f.owner.id, f.orgId, f.owner.id, null); await attempt;
      release(); await priceChange; await memberChange;
      expect(sync.mock.calls.map(call => ({ line: call[2].find(line => line.kind === 'seat'), proration: call[3] }))).toEqual([
        { line: expect.objectContaining({ unitDkk: 500, quantity: 2 }), proration: 'none' },
        { line: expect.objectContaining({ unitDkk: 500, quantity: 1 }), proration: 'create_prorations' },
      ]);
    });
    it('AC08/AC10 authoritative signed webhook is replay safe, preserves uncollectible debt and payment restores access', async () => {
      const f = await fixture(prefix, store);
      await f.request(f.root + '/setup', f.owner, 'POST', { method: 'invoice', address });
      const billing = (await f.repository.getOrganization(f.orgId))!.billing!;
      f.billing.setUnpaid(billing.customerId!, [{ id: 'unpaid', amountDkk: 250, dueAt: '2026-11-01T00:00:00.000Z', url: null }]);
      const event = { customerId: billing.customerId };
      expect((await f.request('/webhooks/stripe-billing', f.owner, 'POST', event)).status).toBe(400);
      expect((await f.request('/webhooks/stripe-billing', f.owner, 'POST', event, 'fake-billing-signature')).status).toBe(200);
      expect((await f.request('/webhooks/stripe-billing', f.owner, 'POST', event, 'fake-billing-signature')).status).toBe(200);
      f.move('2026-11-14T23:59:59.999Z'); expect(await (await f.request(f.root)).json()).toMatchObject({ state: 'overdue' });
      f.move('2026-11-15T00:00:00.000Z'); expect(await (await f.request('/users/me/organization', f.member)).json()).toMatchObject({ billingState: 'blocked', openCourseIds: [] });
      f.move('2026-11-15T00:00:00.001Z'); expect(await (await f.request(f.root)).json()).toMatchObject({ state: 'blocked' });
      f.billing.setUnpaid(billing.customerId!, []);
      await f.request('/webhooks/stripe-billing', f.owner, 'POST', event, 'fake-billing-signature');
      expect(await (await f.request('/users/me/organization', f.member)).json()).toMatchObject({ billingState: 'active', openCourseIds: ['included'] });
      expect((await f.request('/webhooks/stripe-billing', f.owner, 'POST', { customerId: 'unknown' }, 'fake-billing-signature')).status).toBe(200);
      vi.spyOn(f.repository, 'setBilling').mockRejectedValueOnce(new Error('storage down'));
      expect((await f.request('/webhooks/stripe-billing', f.owner, 'POST', event, 'fake-billing-signature')).status).toBe(500);
    });
    it('AC09 cancellation continues until period end, resumes and permits setup after expiry', async () => {
      const f = await fixture(prefix, store);
      expect((await f.request(f.root + '/cancellation', f.owner, 'PUT', { cancel: true })).status).toBe(409);
      await f.request(f.root + '/setup', f.owner, 'POST', { method: 'invoice', address });
      const cancelled = await (await f.request(f.root + '/cancellation', f.owner, 'PUT', { cancel: true })).json();
      expect(cancelled).toMatchObject({ state: 'cancelling', endsAt: expect.any(String) });
      expect(await (await f.request('/users/me/organization', f.member)).json()).toMatchObject({ openCourseIds: ['included'] });
      expect(await (await f.request(f.root + '/cancellation', f.owner, 'PUT', { cancel: false })).json()).toMatchObject({ state: 'active' });
      await f.request(f.root + '/cancellation', f.owner, 'PUT', { cancel: true });
      f.move(cancelled.endsAt);
      expect(await (await f.request('/users/me/organization', f.member)).json()).toMatchObject({ openCourseIds: [], billingState: 'cancelled' });
      expect((await f.request(f.root + '/cancellation', f.owner, 'PUT', { cancel: false })).status).toBe(409);
      await f.request(`/organizations/${f.orgId}/members/${f.member.id}/career`, f.owner, 'PUT', { careerId: null });
      await f.request('/admin/organization-prices/careers/career', f.admin, 'PUT', { priceDkk: 300 });
      expect(await (await f.request(f.root)).json()).toMatchObject({ state: 'cancelled' });
      expect(await (await f.request(f.root + '/setup', f.owner, 'POST', { method: 'invoice', address })).json()).toMatchObject({ state: 'active' });
    });
    it('AC08/AC09 an unpaid invoice does not prevent resuming cancellation before period end', async () => {
      const f = await fixture(prefix, store);
      await f.request(f.root + '/setup', f.owner, 'POST', { method: 'invoice', address });
      const customerId = (await f.repository.getOrganization(f.orgId))!.billing!.customerId!;
      f.billing.setUnpaid(customerId, [{ id: 'debt', amountDkk: 250, dueAt: '2026-11-02T12:00:00.000Z', url: null }]);
      await f.request('/webhooks/stripe-billing', f.owner, 'POST', { customerId }, 'fake-billing-signature');
      const cancelled = await (await f.request(f.root + '/cancellation', f.owner, 'PUT', { cancel: true })).json();
      expect(cancelled).toMatchObject({ state: 'overdue', endsAt: expect.any(String) });
      const resumed = await f.request(f.root + '/cancellation', f.owner, 'PUT', { cancel: false });
      expect(resumed.status).toBe(200); expect(await resumed.json()).toMatchObject({ state: 'overdue', endsAt: null });
    });
    it('AC05/AC11 rejects members, foreign owners, bad input and origins; missing provider is 503', async () => {
      const f = await fixture(prefix, store, true);
      for (const [suffix, method, body] of [['', 'GET', undefined], ['/setup', 'POST', { method: 'invoice', address }], ['/card/confirm', 'POST', { sessionId: 'x' }], ['/cancellation', 'PUT', { cancel: true }], ['/portal', 'POST', { returnUrl: f.returnUrl }]] as const) {
        expect((await f.request(f.root + suffix, f.member, method, body)).status).toBe(403);
        expect((await f.request(f.root + suffix, f.admin, method, body)).status).toBe(404);
        if (suffix) expect(await (await f.request(f.root + suffix, f.owner, method, body)).json()).toEqual({ message: 'Billing is temporarily unavailable.' });
      }
      expect((await f.request(f.root + '/setup', f.owner, 'POST', { method: 'invoice', address: { ...address, postalCode: '123' } })).status).toBe(400);
      expect((await f.request(f.root + '/setup', f.owner, 'POST', { method: 'card', address, returnUrl: 'https://evil.test/organization' })).status).toBe(400);
    });
    it('AC12 rejects a 21st line before saving the career', async () => {
      const f = await fixture(prefix, store);
      const template = (await f.careers.listPaths()).find(p => p._id === 'career')!;
      for (let i = 0; i < 19; i++) {
        const id = `career-${i}`;
        await f.careers.savePath({ ...template, _id: id }); await f.repository.setCareerPrice(id, 10);
        await f.repository.insertMembership({ userId: `member-${i}`, orgId: f.orgId, role: 'member', state: 'active', careerId: id, startedCourseIds: [], consentAt: '', joinedAt: '' });
      }
      await f.request(`/organizations/${f.orgId}/members/${f.member.id}/career`, f.owner, 'PUT', { careerId: null });
      const rejected = await f.request(`/organizations/${f.orgId}/members/${f.member.id}/career`, f.owner, 'PUT', { careerId: 'career' });
      expect(rejected.status).toBe(409); expect(await rejected.json()).toEqual({ message: 'Contact us to bill more different careers and courses.' });
      expect((await f.repository.getMembership(f.member.id))?.careerId).toBeNull();
      const pending = await (await f.request(`/organizations/${f.orgId}/course-requests`, f.member, 'POST', { courseId: 'addon' })).json();
      expect((await f.request(`/organizations/${f.orgId}/course-requests/${pending.id}/decision`, f.owner, 'POST', { action: 'approve' })).status).toBe(409);
      expect((await f.repository.listCourseRequests(f.orgId)).find(r => r.id === pending.id)?.state).toBe('pending');
    });
  });
});
