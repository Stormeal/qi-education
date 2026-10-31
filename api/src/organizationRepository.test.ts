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

describe('X8 F6 organization lookups ask MongoDB for only what they need', () => {
  it('reads by id, token hash or organization instead of whole collections, with indexes for each', async () => {
    const finds: { table: string; filter: Record<string, unknown> }[] = [];
    const indexes: { table: string; keys: Record<string, unknown> }[] = [];
    const repo = new MongoOrganizationRepository(fakeOrganizationCollections({ finds, indexes }));
    const member = (userId: string, orgId: string) => ({ userId, orgId, role: 'member' as const, state: 'active' as const,
      careerId: null, startedCourseIds: [], consentAt: 'now', joinedAt: 'now' });
    for (let i = 0; i < 5; i++) await repo.insertMembership(member(`u${i}`, i % 2 ? 'o1' : 'o2'));
    await repo.createOrganization({ id: 'o1', displayName: 'One', companyName: 'One', cvr: '12345678', billingEmail: 'b@example.test',
      state: 'active', originalOwnerId: 'u1', createdAt: 'now' });
    finds.length = 0;

    expect((await repo.getMembership('u3'))?.orgId).toBe('o1');
    expect((await repo.listMembers('o1')).map(v => v.userId).sort()).toEqual(['u1', 'u3']);
    expect((await repo.getOrganization('o1'))?.displayName).toBe('One');
    expect(await repo.findInvitationByTokenHash('missing')).toBeNull();
    expect(await repo.listCourseRequests('o1')).toEqual([]);

    expect(finds).toEqual([
      { table: 'memberships', filter: { _id: 'u3' } },
      { table: 'memberships', filter: { orgId: 'o1' } },
      { table: 'organizations', filter: { _id: 'o1' } },
      { table: 'invitations', filter: { tokenHash: 'missing' } },
      { table: 'course_requests', filter: { orgId: 'o1' } },
    ]);
    expect(indexes).toEqual(expect.arrayContaining([
      { table: 'memberships', keys: { orgId: 1 } }, { table: 'course_requests', keys: { orgId: 1 } }, { table: 'invitations', keys: { tokenHash: 1 } },
    ]));
  });
});

describe.each(['memory', 'mongodb'])('US-P021 organization privacy (%s)', kind => {
  const store = () => kind === 'memory' ? new InMemoryOrganizationRepository() : new MongoOrganizationRepository(fakeOrganizationCollections());
  const member = (userId: string, orgId = 'o', role: 'member' | 'owner' = 'member') => ({ userId, orgId, role, state: 'active' as const, careerId: null, startedCourseIds: [], consentAt: 'now', joinedAt: 'now' });
  const org = (id = 'o') => ({ id, displayName: 'Organization', companyName: 'Company', cvr: '12345678', billingEmail: 'owner@example.test', state: 'active' as const, originalOwnerId: 'owner', createdAt: 'now' });
  const invite = (id: string, email: string) => ({ id, orgId: 'o', email, state: 'sent' as const, tokenHash: `secret-${id}`, expiresAt: 'later', createdAt: 'now' });
  it('exports only caller membership, personal requests and matching invitations without token hashes', async () => {
    const repo = store(); await repo.createOrganization(org());
    await repo.insertMembership(member('user')); await repo.insertMembership(member('other'));
    await repo.createInvitation(invite('mine', 'person@example.test')); await repo.createInvitation(invite('other', 'other@example.test'));
    await repo.createCourseRequest({ id: 'request', orgId: 'o', userId: 'user', userName: 'Person', courseId: 'course', state: 'pending', addOnPriceDkk: null, createdAt: 'now' });
    await repo.createCourseRequest({ id: 'other-request', orgId: 'o', userId: 'other', userName: 'Other', courseId: 'other-course', state: 'pending', addOnPriceDkk: null, createdAt: 'now' });
    const result = await repo.collectForExport('user', ' PERSON@example.test ');
    expect(result.membership).toEqual(member('user'));
    expect(result.courseRequests.map(value => value.id)).toEqual(['request']);
    expect(result.invitations.map(value => value.id)).toEqual(['mine']);
    expect(JSON.stringify(result)).not.toMatch(/secret-|tokenHash|other@example/);
  });
  it('removes caller data and half-complete invitation joins without touching another user, twice', async () => {
    const repo = store(); await repo.createOrganization(org());
    await repo.insertMembership(member('user')); await repo.insertMembership(member('other'));
    await repo.createInvitation({ ...invite('mine', 'person@example.test'), state: 'accepted', acceptedBy: 'user', joining: true });
    await repo.createInvitation(invite('other', 'other@example.test'));
    await repo.createCourseRequest({ id: 'request', orgId: 'o', userId: 'user', userName: 'Person', courseId: 'course', state: 'pending', addOnPriceDkk: null, createdAt: 'now' });
    await repo.removeForUser('user', 'person@example.test'); await repo.removeForUser('user', 'person@example.test');
    expect(await repo.getMembership('user')).toBeNull(); expect(await repo.getMembership('other')).toEqual(member('other'));
    expect(await repo.findInvitationByTokenHash('secret-mine')).toBeNull();
    expect(await repo.listInvitations()).toEqual([invite('other', 'other@example.test')]);
    expect(await repo.listCourseRequests('o')).toEqual([]);
  });
  it('refuses owner erasure before any mutation when another member needs ownership transfer', async () => {
    const repo = store(); await repo.createOrganization(org());
    await repo.insertMembership(member('owner', 'o', 'owner')); await repo.insertMembership(member('other'));
    await repo.createInvitation(invite('mine', 'owner@example.test'));
    expect(await repo.erasureBlockers('owner')).toEqual([{ id: 'o', name: 'Organization' }]);
    await expect(repo.removeForUser('owner', 'owner@example.test')).rejects.toMatchObject({ status: 409, message: 'transfer-organization-first' });
    expect(await repo.getMembership('owner')).toEqual(member('owner', 'o', 'owner'));
    expect(await repo.findInvitationByTokenHash('secret-mine')).not.toBeNull();
  });
});


it('US-P021 omits unexpected stored membership secrets from exports', async () => {
  const repo = new InMemoryOrganizationRepository();
  await repo.insertMembership({ userId: 'user', orgId: 'org', role: 'member', state: 'active', careerId: null, startedCourseIds: [], consentAt: 'now', joinedAt: 'now', tokenHash: 'private-secret' } as never);
  expect(JSON.stringify(await repo.collectForExport('user'))).not.toMatch(/tokenHash|private-secret/);
});


it('US-P021 historical ownership is anonymized after transfer without blocking or changing current owners', async () => {
  const repo = new InMemoryOrganizationRepository();
  await repo.createOrganization({ id: 'org', displayName: 'Org', companyName: 'Company', cvr: '12345678', billingEmail: 'person@example.test', state: 'active', originalOwnerId: 'user', createdAt: 'now' });
  const other = { userId: 'other', orgId: 'org', role: 'owner' as const, state: 'active' as const, careerId: null, startedCourseIds: [], consentAt: 'now', joinedAt: 'now' };
  await repo.insertMembership(other);
  expect(await repo.erasureBlockers('user')).toEqual([]);
  await repo.removeForUser('user', 'person@example.test'); await repo.removeForUser('user', 'person@example.test');
  expect(await repo.getMembership('other')).toEqual(other);
  expect(await repo.getOrganization('org')).toMatchObject({ originalOwnerId: 'qi-academy-system', billingEmail: '', state: 'active' });
});

it('US-P021 Mongo export queries are scoped to the caller rather than whole collections', async () => {
  const finds: { table: string; filter: Record<string, unknown> }[] = [], indexes: { table: string; keys: Record<string, unknown> }[] = [];
  const repo = new MongoOrganizationRepository(fakeOrganizationCollections({ finds, indexes }));
  expect(await repo.collectForExport('user', 'person@example.test')).toEqual({ membership: null, ownedOrganizations: [], requests: [], courseRequests: [], invitations: [] });
  expect(finds).toEqual(expect.arrayContaining([
    { table: 'memberships', filter: { _id: 'user' } }, { table: 'requests', filter: { userId: 'user' } },
    { table: 'course_requests', filter: { userId: 'user' } }, { table: 'invitations', filter: { acceptedBy: 'user' } }, { table: 'invitations', filter: { email: 'person@example.test' } },
  ]));
  expect(finds.every(value => Object.keys(value.filter).length > 0)).toBe(true);
});


it('US-P021 removes the erased billing contact email without changing organization ownership or business details', async () => {
  const repo = new InMemoryOrganizationRepository();
  await repo.createOrganization({ id: 'org', displayName: 'Org', companyName: 'Company', cvr: '12345678', billingEmail: 'person@example.test', state: 'active', originalOwnerId: 'other', createdAt: 'now' });
  await repo.removeForUser('user', 'person@example.test');
  expect(await repo.getOrganization('org')).toMatchObject({ billingEmail: '', originalOwnerId: 'other', companyName: 'Company' });
});
