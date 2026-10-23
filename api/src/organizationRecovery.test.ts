import { describe, expect, it, vi } from 'vitest';
import type { Collection } from 'mongodb';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryOrganizationRepository, MongoOrganizationRepository } from './organizationRepository.js';
import { OrganizationService } from './organizationService.js';
import { fakeOrganizationCollections } from './organizationTestSupport.js';
import { MongoCourseMutationLock, type CourseMutationLockDocument } from './courseMutationLock.js';

async function setup(repository = new InMemoryOrganizationRepository()) {
  const auth = new InMemoryAuthRepository(), courses = new InMemoryCourseRepository();
  const owner = (await auth.findByEmail('student@qi-education.local'))!, admin = (await auth.findByEmail('admin@qi-education.local'))!, member = (await auth.findByEmail('teacher@qi-education.local'))!;
  const service = new OrganizationService({ repository, auth, courses, sender: { provider: 'local', available: true, send: async () => {} }, options: { newToken: () => 'a'.repeat(43) } });
  const request = await service.submitRequest(owner, { displayName: 'Team', companyName: 'Company', cvr: '12345678', billingEmail: 'b@example.test' });
  return { repository, auth, courses, service, owner, admin, member, request };
}
describe('US-O001 interrupted writes and membership recovery', () => {
  it.each(['before', 'after'])('recovers approval when membership insertion fails %s persistence', async stage => {
    const f = await setup(), insert = f.repository.insertMembership.bind(f.repository);
    f.repository.insertMembership = async value => { if (stage === 'after') await insert(value); throw new Error('isolated insert failure'); };
    await expect(f.service.decide(f.admin.id, f.request.id, { action: 'approve' })).rejects.toThrow();
    f.repository.insertMembership = insert;
    expect(await f.service.decide(f.admin.id, f.request.id, { action: 'approve' })).toMatchObject({ state: 'approved' });
    expect(await f.repository.listOrganizations()).toHaveLength(1);
    expect(await f.repository.getMembership(f.owner.id)).toMatchObject({ orgId: f.request.id, role: 'owner' });
  });
  it('recovers approval when the final request update failed', async () => {
    const f = await setup(), update = f.repository.updateRequest.bind(f.repository);
    f.repository.updateRequest = async () => { throw new Error('isolated request failure'); };
    await expect(f.service.decide(f.admin.id, f.request.id, { action: 'approve' })).rejects.toThrow();
    f.repository.updateRequest = update;
    expect(await f.service.decide(f.admin.id, f.request.id, { action: 'approve' })).toMatchObject({ state: 'approved' });
  });
  it.each(['before', 'after'])('recovers acceptance when insertion fails %s persistence without reusing completed invitations', async stage => {
    const f = await setup(); await f.service.decide(f.admin.id, f.request.id, { action: 'approve' });
    await f.service.invite(f.owner.id, f.request.id, f.member.email);
    const insert = f.repository.insertMembership.bind(f.repository);
    f.repository.insertMembership = async value => { if (stage === 'after') await insert(value); throw new Error('isolated join failure'); };
    await expect(f.service.acceptInvitation(f.member, 'a'.repeat(43))).rejects.toThrow();
    f.repository.insertMembership = insert;
    expect(await f.service.acceptInvitation(f.member, 'a'.repeat(43))).toMatchObject({ role: 'member' });
    await f.service.leave(f.member.id);
    await expect(f.service.acceptInvitation(f.member, 'a'.repeat(43))).rejects.toMatchObject({ status: 410 });
  });
  it('retires pending requests on departure so a member can request the course in the next organization', async () => {
    const f = await setup(); await f.service.decide(f.admin.id, f.request.id, { action: 'approve' });
    await f.service.invite(f.owner.id, f.request.id, f.member.email); await f.service.acceptInvitation(f.member, 'a'.repeat(43));
    const request = await f.service.requestCourse(f.member.id, f.request.id, 'demo-course-1');
    await f.service.leave(f.member.id);
    await f.repository.createOrganization({ id: 'next-org', displayName: 'Next', companyName: 'Next', cvr: '12345678', billingEmail: 'next@example.test', state: 'active', originalOwnerId: f.admin.id, createdAt: '' });
    await f.repository.insertMembership({ userId: f.member.id, orgId: 'next-org', role: 'member', state: 'active', careerId: null, startedCourseIds: [], joinedAt: '', consentAt: '' });
    expect(await f.service.requestCourse(f.member.id, 'next-org', 'demo-course-1')).toMatchObject({ state: 'pending' });
    expect((await f.repository.listCourseRequests(f.request.id)).find(v => v.id === request.id)?.state).toBe('declined');
  });
  it('retains the real Mongo lock around an uncertain membership deletion', async () => {
    const rows = new Map<string, CourseMutationLockDocument>();
    const collection = {
      find: () => ({ toArray: async () => structuredClone([...rows.values()]) }),
      findOne: async ({ _id }: { _id: string }) => structuredClone(rows.get(_id) ?? null),
      insertOne: async (row: CourseMutationLockDocument) => { if (rows.has(row._id)) throw Object.assign(new Error('duplicate'), { code: 11000 }); rows.set(row._id, structuredClone(row)); return { acknowledged: true }; },
      deleteOne: async ({ _id, owner }: { _id: string; owner: string }) => ({ acknowledged: true, deletedCount: rows.get(_id)?.owner === owner && rows.delete(_id) ? 1 : 0 }),
    } as unknown as Collection<CourseMutationLockDocument>;
    const lock = new MongoCourseMutationLock(async () => collection), collections = fakeOrganizationCollections();
    const repository = new MongoOrganizationRepository(collections, lock), f = await setup(repository);
    await f.service.decide(f.admin.id, f.request.id, { action: 'approve' });
    await f.service.invite(f.owner.id, f.request.id, f.member.email); await f.service.acceptInvitation(f.member, 'a'.repeat(43));
    await f.service.promote(f.owner.id, f.request.id, f.member.id);
    const memberships = await collections('memberships'), remove = memberships.deleteOne.bind(memberships);
    let finish = async () => {};
    memberships.deleteOne = async (...args) => { finish = async () => { await remove(...args); }; throw new Error('connection lost while deleting'); };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(f.service.leave(f.owner.id)).rejects.toThrow();
      expect(await lock.list()).toMatchObject([{ courseId: f.request.id, state: 'held' }]);
      await finish();
      expect((await repository.listMembers(f.request.id)).filter(v => v.role === 'owner')).toHaveLength(1);
    } finally { quiet.mockRestore(); }
  });
});

describe.each(['memory', 'mongodb'])('US-O001 unique state transitions (%s)', kind => {
  it('refuses reopening an expired invitation while a newer invitation is open', async () => {
    const repo = kind === 'memory' ? new InMemoryOrganizationRepository() : new MongoOrganizationRepository(fakeOrganizationCollections());
    const invite = { id: 'old', orgId: 'org', email: 'x@example.test', state: 'sent' as const, tokenHash: 'old-hash', createdAt: '', expiresAt: '' };
    await repo.createInvitation(invite); await repo.updateInvitation('old', 'sent', { state: 'expired' });
    await repo.createInvitation({ ...invite, id: 'new', tokenHash: 'new-hash' });
    await expect(repo.updateInvitation('old', 'expired', { state: 'not-sent', tokenHash: 'third-hash' })).rejects.toMatchObject({ status: 409 });
    expect((await repo.listInvitations('org')).filter(v => ['sent', 'not-sent'].includes(v.state))).toHaveLength(1);
  });
});
