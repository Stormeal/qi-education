import { describe, expect, it } from 'vitest';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryOrganizationRepository } from './organizationRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { careerPathContentSchema } from './careerPath.js';
import { OrganizationService } from './organizationService.js';
async function setup() {
  const repository = new InMemoryOrganizationRepository(), auth = new InMemoryAuthRepository(),
    careers = new InMemoryCareerPathRepository(), courses = new InMemoryCourseRepository();
  const catalog = await courses.listCourses(), demo = catalog[0];
  catalog.push(...['required', 'optional', 'archived', 'addon', 'outside'].map(id => ({ ...demo, id, status: id === 'archived' ? 'archived' as const : 'published' as const, priceDkk: 100 })));
  const published = careerPathContentSchema.parse({ schemaVersion: 2, title: 'Career', steps: [
    { id: 'required', title: 'Required', courses: [{ courseId: 'required' }], actions: [{ id: 'archived-action', kind: 'course', title: 'Archived', courseId: 'archived' }] },
    { id: 'optional', title: 'Optional', required: false, courses: [{ courseId: 'optional' }] },
  ] });
  await careers.savePath({ _id: 'career', published, draft: published, revision: 1, updatedAt: '' });
  await careers.savePath({ _id: 'draft', published: null, draft: published, revision: 1, updatedAt: '' });
  const service = new OrganizationService({ repository, auth, careers, courses, sender: { provider: 'local', available: true, send: async () => {} } });
  const owner = (await auth.findByEmail('student@qi-education.local'))!, member = (await auth.findByEmail('teacher@qi-education.local'))!;
  const orgId = 'org';
  await repository.createOrganization({ id: orgId, displayName: 'Team', companyName: 'Company', billingEmail: 'b@example.test', cvr: '12345678', state: 'active', originalOwnerId: owner.id, createdAt: '' });
  for (const user of [owner, member]) await repository.insertMembership({ userId: user.id, orgId, role: user === owner ? 'owner' : 'member', state: 'active', careerId: null, startedCourseIds: [], consentAt: '', joinedAt: '' });
  return { service, repository, auth, careers, courses, owner, member, orgId };
}
describe('US-O001 members, billed careers and add-ons', () => {
  it('AC07 AC08 refuses removing or leaving as the last owner with the exact message', async () => {
    const f = await setup();
    await expect(f.service.leave(f.owner.id)).rejects.toMatchObject({ status: 409, message: 'Make another member an owner first' });
    await expect(f.service.removeMember(f.owner.id, f.orgId, f.owner.id)).rejects.toMatchObject({ status: 409, message: 'Make another member an owner first' });
    expect(await f.service.listMembers(f.owner.id, f.orgId)).toMatchObject([{ userId: f.owner.id, role: 'owner' }, { userId: f.member.id, role: 'member' }]);
  });
  it('AC07 only the original owner promotes; an owner can leave when another owner exists', async () => {
    const f = await setup();
    expect(await f.service.promote(f.owner.id, f.orgId, f.member.id)).toMatchObject({ role: 'owner', userId: f.member.id });
    await expect(f.service.promote(f.member.id, f.orgId, f.owner.id)).rejects.toMatchObject({ status: 403 });
    await f.service.leave(f.owner.id);
    expect(await f.repository.getMembership(f.owner.id)).toBeNull();
    await expect(f.service.leave(f.member.id)).rejects.toMatchObject({ status: 409 });
  });
  it('AC09 accepts only a published career and allows clearing it', async () => {
    const f = await setup();
    await expect(f.service.setCareer(f.owner.id, f.orgId, f.member.id, 'draft')).rejects.toMatchObject({ status: 400 });
    expect(await f.service.setCareer(f.owner.id, f.orgId, f.member.id, 'career')).toMatchObject({ careerId: 'career' });
    await f.service.setCareer(f.owner.id, f.orgId, f.member.id, null);
    expect(await f.service.openCourseIds(f.member.id)).toEqual([]);
  });
  it('AC09 Review Focus 3 includes optional courses, excludes archived courses and withdrawn careers', async () => {
    const f = await setup(); await f.service.setCareer(f.owner.id, f.orgId, f.member.id, 'career');
    expect((await f.service.openCourseIds(f.member.id)).sort()).toEqual(['optional', 'required']);
    await f.service.setCareerPrice('career', 120);
    expect(await f.service.myOrganization(f.member.id)).toMatchObject({ careerId: 'career', seatPriceDkk: 120, openCourseIds: ['required', 'optional'] });
    const path = (await f.careers.listPaths()).find(v => v._id === 'career')!;
    await f.careers.savePath({ ...path, published: null });
    expect(await f.service.openCourseIds(f.member.id)).toEqual([]);
  });
  it('AC10 opens an approved add-on, refuses duplicates/already-open courses and preserves access on decline', async () => {
    const f = await setup(); await f.service.setCareer(f.owner.id, f.orgId, f.member.id, 'career'); await f.service.setCoursePrice('addon', 35);
    await expect(f.service.requestCourse(f.member.id, f.orgId, 'required')).rejects.toMatchObject({ status: 409 });
    const request = await f.service.requestCourse(f.member.id, f.orgId, 'addon');
    expect(request).toMatchObject({ state: 'pending', userName: f.member.displayName, addOnPriceDkk: 35 });
    await expect(f.service.requestCourse(f.member.id, f.orgId, 'addon')).rejects.toMatchObject({ status: 409 });
    expect(await f.service.decideCourseRequest(f.owner.id, f.orgId, request.id, 'approve')).toMatchObject({ state: 'approved' });
    expect(await f.service.openCourseIds(f.member.id)).toContain('addon');
    const declined = await f.service.requestCourse(f.member.id, f.orgId, 'outside');
    await f.service.decideCourseRequest(f.owner.id, f.orgId, declined.id, 'decline');
    expect(await f.service.openCourseIds(f.member.id)).not.toContain('outside');
    expect(await f.service.listCourseRequests(f.owner.id, f.orgId)).toHaveLength(2);
  });
  it('Review Focus 5 two owners decide once and the stored winning decision stays unchanged', async () => {
    const f = await setup(); await f.service.promote(f.owner.id, f.orgId, f.member.id);
    const request = await f.service.requestCourse(f.member.id, f.orgId, 'addon');
    const results = await Promise.allSettled([f.service.decideCourseRequest(f.owner.id, f.orgId, request.id, 'approve'), f.service.decideCourseRequest(f.member.id, f.orgId, request.id, 'decline')]);
    expect(results.filter(v => v.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(v => v.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    const winning = results.find(v => v.status === 'fulfilled')!;
    expect((await f.repository.listCourseRequests(f.orgId))[0].state).toBe(winning.status === 'fulfilled' ? winning.value.state : '');
  });
  it('AC07 AC08 AC12 start records organization courses separately; suspension/removal revoke access and keep own enrollments', async () => {
    const f = await setup(); await f.service.setCareer(f.owner.id, f.orgId, f.member.id, 'career');
    await f.auth.enrollUserInCourse(f.member.id, 'own-course');
    expect(await f.service.startCourse(f.member.id, 'outside')).toBe(false);
    expect(await f.service.startCourse(f.member.id, 'required')).toBe(true);
    expect(await f.service.learnableOrgCourseIds(f.member.id)).toEqual(['required']);
    await f.service.suspend(f.orgId);
    expect(await f.service.openCourseIds(f.member.id)).toEqual([]); expect(await f.service.learnableOrgCourseIds(f.member.id)).toEqual([]);
    await f.service.reactivate(f.orgId); expect(await f.service.learnableOrgCourseIds(f.member.id)).toEqual(['required']);
    await f.service.removeMember(f.owner.id, f.orgId, f.member.id);
    expect(await f.service.openCourseIds(f.member.id)).toEqual([]);
    expect((await f.auth.findById(f.member.id))?.enrolledCourseIds).toEqual(['own-course']);
  });
  it('AC09 concurrent course starts retain both IDs and enrollment is idempotent', async () => {
    const f = await setup(); await f.service.setCareer(f.owner.id, f.orgId, f.member.id, 'career');
    await Promise.all(['required', 'optional', 'required'].map(id => f.service.startCourse(f.member.id, id)));
    expect((await f.service.learnableOrgCourseIds(f.member.id)).sort()).toEqual(['optional', 'required']);
  });
  it('AC07 foreign resources are 404; members cannot manage members, and pending-email memberships have no access', async () => {
    const f = await setup();
    await expect(f.service.listMembers(f.member.id, f.orgId)).rejects.toMatchObject({ status: 403 });
    await expect(f.service.removeMember(f.owner.id, 'foreign', f.member.id)).rejects.toMatchObject({ status: 404 });
    await f.repository.updateMembership(f.member.id, f.orgId, { state: 'pending-email', careerId: 'career' });
    expect(await f.service.openCourseIds(f.member.id)).toEqual([]);
  });
  it('AC08 simultaneous owners leaving preserve one owner', async () => {
    const f = await setup(); await f.service.promote(f.owner.id, f.orgId, f.member.id);
    const results = await Promise.allSettled([f.service.leave(f.owner.id), f.service.leave(f.member.id)]);
    expect(results.filter(v => v.status === 'fulfilled')).toHaveLength(1);
    expect((await f.repository.listMembers(f.orgId)).filter(v => v.role === 'owner')).toHaveLength(1);
  });
});
