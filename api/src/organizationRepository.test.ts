import { describe, expect, it } from 'vitest';
import { InMemoryOrganizationRepository, MongoOrganizationRepository } from './organizationRepository.js';
import { fakeOrganizationCollections } from './organizationTestSupport.js';
import { organizationRequestInputSchema, priceSchema, acceptSchema } from './organization.js';

it('validates the exact request, price and consent boundaries', () => {
  const input = { displayName: ' A ', companyName: 'B', cvr: '12345678', billingEmail: ' BILL@example.test ' };
  expect(organizationRequestInputSchema.parse(input)).toMatchObject({ displayName: 'A', billingEmail: 'bill@example.test', message: '' });
  for (const patch of [{ cvr: '123' }, { displayName: '' }, { companyName: 'x'.repeat(121) }, { message: 'x'.repeat(1001) }]) {
    expect(organizationRequestInputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  }
  for (const priceDkk of [-1, 1.5, 1000000]) expect(priceSchema.safeParse({ priceDkk }).success).toBe(false);
  for (const priceDkk of [0, 999999, null]) expect(priceSchema.safeParse({ priceDkk }).success).toBe(true);
  expect(acceptSchema.safeParse({ token: 'token', consent: false }).success).toBe(false);
});

describe.each(['memory', 'mongodb'])('organization store (%s)', kind => {
  const store = () => kind === 'memory' ? new InMemoryOrganizationRepository() : new MongoOrganizationRepository(fakeOrganizationCollections());
  it('allows one membership per user and scopes updates/deletes to its organization', async () => {
    const repo = store();
    const member = { userId: 'u', orgId: 'o', role: 'member' as const, state: 'active' as const,
      careerId: null, startedCourseIds: [], consentAt: 'now', joinedAt: 'now' };
    expect(await repo.insertMembership(member)).toBe(true);
    expect(await repo.insertMembership({ ...member, orgId: 'other' })).toBe(false);
    expect(await repo.updateMembership('u', 'other', { role: 'owner' })).toBe(false);
    expect(await repo.deleteMembership('u', 'other')).toBe(false);
    expect(await repo.getMembership('u')).toEqual(member);
  });
  it('allows one pending request per person and compares state on update', async () => {
    const repo = store();
    const request = { id: 'r', userId: 'u', state: 'pending' as const, displayName: 'Org', companyName: 'Company',
      cvr: '12345678', billingEmail: 'bill@example.test', message: '', declineReason: null, submittedAt: 'now', decidedAt: null, organizationId: null };
    await repo.createRequest(request);
    await expect(repo.createRequest({ ...request, id: 'r2' })).rejects.toMatchObject({ status: 409 });
    expect(await repo.updateRequest('r', 'pending', { state: 'declined' })).toBe(true);
    expect(await repo.updateRequest('r', 'pending', { state: 'approved' })).toBe(false);
    expect((await repo.findPendingOrLatestRequest('u'))?.state).toBe('declined');
  });
  it('enforces unique open invitations and conditional token consumption', async () => {
    const repo = store();
    const invite = { id: 'i', orgId: 'o', email: 'x@example.test', state: 'sent' as const,
      tokenHash: 'hash', expiresAt: 'later', createdAt: 'now' };
    await repo.createInvitation(invite);
    await expect(repo.createInvitation({ ...invite, id: 'i2', tokenHash: 'hash2' })).rejects.toMatchObject({ status: 409 });
    expect(await repo.updateInvitation('i', 'sent', { state: 'accepted' })).toBe(true);
    expect(await repo.updateInvitation('i', 'sent', { state: 'cancelled' })).toBe(false);
    await repo.createInvitation({ ...invite, id: 'i2', tokenHash: 'hash2' });
  });
  it('allows one pending course request and only one concurrent decision', async () => {
    const repo = store();
    const request = { id: 'r', orgId: 'o', userId: 'u', userName: 'User', courseId: 'c', state: 'pending' as const, addOnPriceDkk: null, createdAt: 'now' };
    expect(await repo.createCourseRequest(request)).toBe(true);
    expect(await repo.createCourseRequest({ ...request, id: 'r2' })).toBe(false);
    expect(await Promise.all([repo.decideCourseRequest('r', 'approved'), repo.decideCourseRequest('r', 'declined')])).toEqual([true, false]);
    expect((await repo.listCourseRequests('o'))[0].state).toBe('approved');
  });
  it('isolates returned values and stores prices with null removing a price', async () => {
    const repo = store();
    await repo.setCareerPrice('career', 120); await repo.setCoursePrice('course', 0);
    const prices = await repo.getPrices(); prices.careers.career = 5;
    expect(await repo.getPrices()).toEqual({ careers: { career: 120 }, courses: { course: 0 } });
    await repo.setCareerPrice('career', null);
    expect(await repo.getPrices()).toEqual({ careers: {}, courses: { course: 0 } });
  });
});
