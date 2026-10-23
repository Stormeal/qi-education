import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from './server.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { apiConfig, getCorsOrigins } from './config.js';
import { InMemoryOrganizationRepository } from './organizationRepository.js';
import { OrganizationService } from './organizationService.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { careerPathContentSchema } from './careerPath.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryEmailConfirmationRepository } from './emailConfirmationRepository.js';
import { resetTokenHash } from './passwordResetDelivery.js';
import { InMemoryPaymentRepository } from './paymentRepository.js';
import { FakePaymentService } from './paymentService.js';

const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
const fields = { displayName: 'Team', companyName: 'Company', cvr: '12345678', billingEmail: 'bill@example.test', message: '' };
async function setup() {
  const auth = new InMemoryAuthRepository(), repository = new InMemoryOrganizationRepository(), courses = new InMemoryCourseRepository(), careers = new InMemoryCareerPathRepository(), content = new InMemoryCourseContentRepository();
  const owner = (await auth.findByEmail('student@qi-education.local'))!, member = (await auth.findByEmail('teacher@qi-education.local'))!, admin = (await auth.findByEmail('admin@qi-education.local'))!;
  const foreign = await auth.createUser({ ...owner, id: 'foreign', email: 'foreign@example.test' }), target = await auth.createUser({ ...owner, id: 'target', email: 'target@example.test', emailConfirmed: false });
  const catalog = await courses.listCourses(); catalog.push(...['included', 'addon', 'outside'].map(id => ({ ...catalog[0], id, priceDkk: 100 })));
  await content.createEmptyCourseContent('included');
  await content.updateCourseContent('included', [{ id: 'section', title: 'Section', components: [{ id: 'lesson', title: 'Lesson', type: 'text', content: 'Private lesson', durationMinutes: null, attachments: [] }] }]);
  const published = careerPathContentSchema.parse({ title: 'Career', steps: [{ id: 's', title: 'Step', courses: [{ courseId: 'included' }] }] });
  await careers.savePath({ _id: 'career', published, draft: published, revision: 1, updatedAt: '' });
  const sender = { provider: 'local' as const, available: true, send: async () => {} }, raw = 'a'.repeat(43);
  const service = new OrganizationService({ repository, auth, careers, courses, sender, options: { newToken: () => raw } });
  const orgRequest = await service.submitRequest(owner, fields), orgId = (await service.decide(admin.id, orgRequest.id, { action: 'approve' })).organizationId!;
  await repository.createOrganization({ id: 'foreign-org', ...fields, state: 'active', originalOwnerId: foreign.id, createdAt: '' });
  await repository.insertMembership({ userId: member.id, orgId, role: 'member', state: 'active', careerId: 'career', startedCourseIds: [], consentAt: '', joinedAt: '' });
  await repository.insertMembership({ userId: foreign.id, orgId: 'foreign-org', role: 'member', state: 'active', careerId: null, startedCourseIds: [], consentAt: '', joinedAt: '' });
  const invitation = await service.invite(owner.id, orgId, target.email);
  const courseRequest = await service.requestCourse(member.id, orgId, 'addon');
  const pending = await service.submitRequest(target, { ...fields, displayName: 'Other' });
  const confirmations = new InMemoryEmailConfirmationRepository();
  const server = createServer({ authRepository: auth, organizationRepository: repository, careerPathRepository: careers,
    courseRepository: courses, courseContentRepository: content, mailSender: sender, emailConfirmationRepository: confirmations,
    paymentService: new FakePaymentService(), paymentRepository: new InMemoryPaymentRepository(),
    muxVideoService: null, muxWebhookService: null }).listen(0); servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, user?: AuthUser, method = 'GET', body?: unknown) => fetch(base + path, { method,
    headers: { 'content-type': 'application/json', ...(user ? { authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { request, repository, service, auth, courses, careers, owner, member, foreign, admin, target, orgId, raw, invitation, courseRequest, pending, confirmations, sender };
}
type Role = 'owner' | 'member' | 'foreign' | 'admin' | 'guest';
const roles: Role[] = ['owner', 'member', 'foreign', 'admin', 'guest'];
describe.each(['', '/api'])('US-O001 HTTP permission matrix (%s)', prefix => {
  it('A7 projects started organization courses in enroll, auth/me, me and both sign-in replies without storing them', async () => {
    const f = await setup();
    await f.auth.enrollUserInCourse(f.member.id, 'outside');
    expect(await (await f.request(prefix + '/users/me/organization', f.member)).json()).toMatchObject({
      openCourseIds: ['included'], startedCourseIds: [],
    });
    expect((await (await f.request(prefix + '/auth/me', f.member)).json()).user.enrolledCourseIds).toEqual(['outside']);
    for (let i = 0; i < 2; i++) {
      const enrolled = await f.request(prefix + '/users/me/courses/included', f.member, 'POST');
      expect(enrolled.status).toBe(200);
      expect((await enrolled.json()).user.enrolledCourseIds).toEqual(['outside', 'included']);
      expect((await f.auth.findById(f.member.id))?.enrolledCourseIds).toEqual(['outside']);
    }
    for (const path of ['/auth/me', '/me']) {
      const response = await f.request(prefix + path, f.member);
      expect(response.status).toBe(200);
      expect((await response.json()).user.enrolledCourseIds).toEqual(['outside', 'included']);
    }
    for (const path of ['/auth/login', '/login']) {
      const response = await f.request(prefix + path, undefined, 'POST', { email: f.member.email, password: 'Password123!' });
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.token).toEqual(expect.any(String));
      expect(result.user.enrolledCourseIds).toEqual(['outside', 'included']);
      expect(result.user).not.toHaveProperty('passwordHash');
    }
    expect(await (await f.request(prefix + '/users/me/organization', f.member)).json()).toMatchObject({ startedCourseIds: ['included'] });
    expect((await f.auth.findById(f.member.id))?.enrolledCourseIds).toEqual(['outside']);
  });
  it.each(['leave', 'suspend'])('A7 removes organization enrollments from responses after %s while retaining personal courses', async action => {
    const f = await setup(); await f.auth.enrollUserInCourse(f.member.id, 'outside');
    expect((await f.request(prefix + '/users/me/courses/included', f.member, 'POST')).status).toBe(200);
    expect((await f.auth.findById(f.member.id))?.enrolledCourseIds).toEqual(['outside']);
    if (action === 'leave') expect((await f.request(prefix + '/users/me/organization', f.member, 'DELETE')).status).toBe(204);
    else expect((await f.request(prefix + `/admin/organizations/${f.orgId}/suspend`, f.admin, 'POST')).status).toBe(200);
    for (const path of ['/auth/me', '/me']) {
      const response = await f.request(prefix + path, f.member);
      expect(response.status).toBe(200);
      expect((await response.json()).user.enrolledCourseIds).toEqual(['outside']);
    }
    const login = await f.request(prefix + '/auth/login', undefined, 'POST', { email: f.member.email, password: 'Password123!' });
    expect(login.status).toBe(200); expect((await login.json()).user.enrolledCourseIds).toEqual(['outside']);
    const mine = await (await f.request(prefix + '/users/me/organization', f.member)).json();
    expect(mine).toMatchObject(action === 'suspend' ? { startedCourseIds: [] } : { organization: null });
    expect((await f.auth.findById(f.member.id))?.enrolledCourseIds).toEqual(['outside']);
  });
  it.each(roles)('checks every organization route as %s with private responses', async role => {
    const f = await setup(), who = role === 'guest' ? undefined : f[role];
    const signed = role !== 'guest', admin = role === 'admin', owner = role === 'owner';
    const scoped = !signed ? 401 : owner ? 200 : role === 'member' ? 403 : 404;
    const global = !signed ? 401 : admin ? 200 : 403;
    const cases: [string, string, unknown, number][] = [
      ['GET', '/users/me/organization', undefined, signed ? 200 : 401],
      ['GET', '/organization-prices', undefined, signed ? 200 : 401],
      ['POST', '/users/me/organization-request', fields, !signed ? 401 : admin ? 201 : 409],
      ['PUT', '/users/me/organization-request', fields, signed ? 409 : 401],
      ['GET', '/admin/organization-requests?state=pending', undefined, global],
      ['POST', `/admin/organization-requests/${f.pending.id}/decision`, { action: 'decline', reason: 'Please correct' }, global],
      ['GET', '/admin/organizations', undefined, global],
      ['PUT', '/admin/organization-prices/careers/career', { priceDkk: 50 }, global],
      ['PUT', '/admin/organization-prices/courses/addon', { priceDkk: 10 }, global],
      ['GET', `/organizations/${f.orgId}/members`, undefined, scoped],
      ['GET', `/organizations/${f.orgId}/invitations`, undefined, scoped],
      ['POST', `/organizations/${f.orgId}/invitations`, { email: 'another@example.test' }, scoped === 200 ? 201 : scoped],
      ['POST', `/organizations/${f.orgId}/invitations/${f.invitation.id}/resend`, {}, scoped],
      ['DELETE', `/organizations/${f.orgId}/invitations/${f.invitation.id}`, undefined, scoped === 200 ? 204 : scoped],
      ['GET', `/organizations/${f.orgId}/course-requests`, undefined, scoped],
      ['POST', `/organizations/${f.orgId}/course-requests`, { courseId: 'outside' }, !signed ? 401 : owner || role === 'member' ? 201 : 404],
      ['POST', `/organizations/${f.orgId}/course-requests/${f.courseRequest.id}/decision`, { action: 'approve' }, scoped],
      ['PUT', `/organizations/${f.orgId}/members/${f.member.id}/career`, { careerId: 'career' }, scoped],
      ['POST', `/organizations/${f.orgId}/members/${f.member.id}/promote`, {}, scoped],
      ['DELETE', `/organizations/${f.orgId}/members/${f.member.id}`, undefined, scoped === 200 ? 204 : scoped],
      ['POST', `/admin/organizations/${f.orgId}/suspend`, {}, global],
      ['POST', `/admin/organizations/${f.orgId}/reactivate`, {}, global],
      ['POST', '/organization-invitations/check', { token: 'invalid' }, 410],
      ['POST', '/organization-invitations/accept', { token: 'invalid', consent: true }, signed ? 410 : 401],
      ['DELETE', '/users/me/organization', undefined, !signed ? 401 : admin ? 404 : owner ? 409 : 204],
    ];
    for (const [method, path, body, expected] of cases) {
      const response = await f.request(prefix + path, who, method, body);
      expect(response.status, `${role}: ${method} ${path}: ${await response.clone().text()}`).toBe(expected);
      expect(response.headers.get('cache-control'), path).toBe('private, no-store');
      expect(response.headers.get('vary'), path).toContain('Authorization');
    }
  });
  it('AC09 enrolls free, gates lesson/progress/notes, and revokes after leaving', async () => {
    const f = await setup();
    expect((await f.request(prefix + '/courses/included/content', f.member)).status).toBe(403);
    expect((await f.request(prefix + '/users/me/courses/included', f.member, 'POST')).status).toBe(200);
    expect((await f.auth.findById(f.member.id))?.enrolledCourseIds).not.toContain('included');
    expect((await f.request(prefix + '/courses/included/content', f.member)).status).toBe(200);
    expect((await f.request(prefix + '/users/me/learning-progress/included/lessons/lesson', f.member, 'PUT', {})).status).toBe(200);
    expect((await f.request(prefix + '/courses/included/notes', f.member)).status).toBe(200);
    expect(await (await f.request(prefix + '/auth/me', f.member)).json()).toMatchObject({ organization: { id: f.orgId, role: 'member' } });
    expect((await f.request(prefix + '/users/me/organization', f.member, 'DELETE')).status).toBe(204);
    for (const path of ['/courses/included/content', '/courses/included/notes']) expect((await f.request(prefix + path, f.member)).status).toBe(403);
    expect((await f.request(prefix + '/users/me/learning-progress/included/lessons/lesson', f.member, 'PUT', {})).status).toBe(403);
  });
  it('Review Focus 4 an organization learner can buy the course and keeps it after leaving', async () => {
    const f = await setup(); expect((await f.request(prefix + '/users/me/courses/included', f.member, 'POST')).status).toBe(200);
    expect((await f.auth.findById(f.member.id))?.enrolledCourseIds).not.toContain('included');
    const checkout = await f.request(prefix + '/users/me/courses/included/checkout', f.member, 'POST', { returnUrl: `${getCorsOrigins()[0]}/courses/included` });
    expect(checkout.status).toBe(200); const sessionId = new URL((await checkout.json()).url).searchParams.get('session_id');
    expect((await f.request(prefix + '/users/me/courses/included/checkout/confirm', f.member, 'POST', { sessionId })).status).toBe(200);
    expect((await f.auth.findById(f.member.id))?.enrolledCourseIds).toContain('included');
    expect((await (await f.request(prefix + '/auth/me', f.member)).json()).user.enrolledCourseIds).toEqual(['included']);
    await f.request(prefix + '/users/me/organization', f.member, 'DELETE');
    expect((await f.request(prefix + '/courses/included/content', f.member)).status).toBe(200);
    expect((await (await f.request(prefix + '/auth/me', f.member)).json()).user.enrolledCourseIds).toEqual(['included']);
  });
  it('AC04 confirms pending membership and auth/me retries a previously missed activation', async () => {
    const f = await setup();
    expect((await f.request(prefix + '/organization-invitations/accept', f.target, 'POST', { token: f.raw, consent: true })).status).toBe(202);
    const confirmation = 'b'.repeat(43); await f.confirmations.reserve(f.target.id, resetTokenHash(confirmation)!, Date.now()); await f.confirmations.activate(f.target.id, resetTokenHash(confirmation)!);
    expect((await f.request(prefix + '/auth/email-confirmation/confirm', undefined, 'POST', { token: confirmation })).status).toBe(204);
    expect((await f.repository.getMembership(f.target.id))?.state).toBe('active');
    await f.repository.updateMembership(f.target.id, f.orgId, { state: 'pending-email' });
    expect((await f.request(prefix + '/auth/login', undefined, 'POST', { email: f.target.email, password: 'Password123!' })).status).toBe(200);
    expect((await f.repository.getMembership(f.target.id))?.state).toBe('active');
    await f.repository.updateMembership(f.target.id, f.orgId, { state: 'pending-email' });
    expect((await f.request(prefix + '/auth/me', f.target)).status).toBe(200);
    expect((await f.repository.getMembership(f.target.id))?.state).toBe('active');
  });
  it('AC04 confirmation succeeds when membership activation fails, then auth/me recovers', async () => {
    const f = await setup(); await f.service.acceptInvitation(f.target, f.raw);
    const raw = 'c'.repeat(43), hash = resetTokenHash(raw)!;
    await f.confirmations.reserve(f.target.id, hash, Date.now()); await f.confirmations.activate(f.target.id, hash);
    const update = f.repository.updateMembership.bind(f.repository);
    f.repository.updateMembership = async () => { throw new Error('isolated store failure'); };
    expect((await f.request(prefix + '/auth/email-confirmation/confirm', undefined, 'POST', { token: raw })).status).toBe(204);
    expect((await f.repository.getMembership(f.target.id))?.state).toBe('pending-email');
    f.repository.updateMembership = update;
    expect((await f.request(prefix + '/auth/me', f.target)).status).toBe(200);
    expect((await f.repository.getMembership(f.target.id))?.state).toBe('active');
  });
});
it('AC04 mail failure returns 201 with a not-sent invitation', async () => {
  const f = await setup(); f.sender.available = false;
  const response = await f.request(`/organizations/${f.orgId}/invitations`, f.owner, 'POST', { email: 'failed@example.test' });
  expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ state: 'not-sent' });
});
it('check is limited by the existing client limit and invalid consent is 400', async () => {
  const f = await setup();
  expect((await f.request('/organization-invitations/accept', f.target, 'POST', { token: f.raw, consent: false })).status).toBe(400);
  for (let i = 0; i < 10; i++) expect((await f.request('/organization-invitations/check', undefined, 'POST', { token: f.raw })).status).toBe(200);
  const limited = await f.request('/organization-invitations/check', undefined, 'POST', { token: f.raw });
  expect(limited.status).toBe(429); expect(limited.headers.get('retry-after')).toBeTruthy();
});
it('store failures are safe 503 responses and disabled/stale roles are re-read', async () => {
  const f = await setup();
  await f.auth.updateRole(f.admin.id, 'student'); expect((await f.request('/admin/organizations', f.admin)).status).toBe(403);
  await f.auth.updateStatus(f.owner.id, 'disabled'); expect((await f.request(`/organizations/${f.orgId}/members`, f.owner)).status).toBe(401);
  f.repository.getMembership = async () => { throw new Error('private connection detail'); };
  const response = await f.request('/users/me/organization', f.member); expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private connection detail');
});
