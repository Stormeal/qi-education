import { describe, expect, it } from 'vitest';
import { toAuthenticatedUser } from './auth.js';
import { createCourseSchema } from './course.js';
import { SYSTEM_ACCOUNT_ID } from './systemAccount.js';
import { privacyFixture } from '../test/privacyFixture.js';
import { NotificationService } from './notificationService.js';
import { PrivacyMutationCoordinator } from './privacyMutationCoordinator.js';
import { PrivacyService } from './privacyService.js';
import { OrganizationService } from './organizationService.js';

describe('US-P021 privacy service', () => {
  it('exports all caller records, including more than one notification page, without another user or credentials', async () => {
    const { stores, service, user, other } = await privacyFixture();
    await stores.progress.complete(user.id, 'retained-course', 'lesson');
    await stores.progress.complete(other.id, 'bob-course', 'secret');
    await stores.instructorProfile.save(user.id, 'My teaching bio');
    await stores.feedback.createFeedback({ page: 'lesson', rating: 'great', message: 'My lesson comment', lessonFeedbackKind: 'helpful' }, toAuthenticatedUser(user));
    await stores.feedback.createFeedback({ page: 'home', rating: 'okay', message: 'Bob secret comment' }, toAuthenticatedUser(other));
    for (let i = 0; i < 55; i++) await stores.notifications.create({ userId: user.id, type: 'course-published', title: `Item ${i}`, link: '/home' });
    const result = await service.exportUserData(user.id);
    expect(result.enrolments).toEqual(['retained-course']);
    expect(result.notifications).toHaveLength(55);
    expect(result.lessonFeedback).toHaveLength(1);
    expect(result.progress).toEqual([expect.objectContaining({ completedIds: ['lesson'] })]);
    expect(result).toHaveProperty('authoring');
    expect(JSON.stringify(result)).not.toMatch(/Bob|bob@example|passwordHash|scrypt|tokens|privacyErasure/);
  });

  it('erases the caller, transfers teaching ownership and removes personal review names while preserving learners and publication', async () => {
    const { stores, service, user, other, passwordHash } = await privacyFixture();
    const course = await stores.courses.createCourse(createCourseSchema.parse({ title: 'Privacy course', description: 'A published course kept for learners', teacher: user.displayName, level: 'Beginner', careerGoals: [], status: 'published' }),
      { id: 'retained-course', createdAt: user.createdAt, ownerUserId: user.id, teacherIds: [user.id] });
    await stores.content.saveCourseReview(course.id, { version: 1, liveStatus: 'published', live: { id: 'live', metadata: course, sections: [] }, working: null,
      history: [{ id: 'event', revisionId: 'live', action: 'publish', actorId: user.id, actorName: user.displayName, createdAt: user.createdAt, reason: '' }] });
    await stores.instructorProfile.save(user.id, 'Private bio');
    await stores.progress.complete(user.id, course.id, 'lesson');
    await stores.progress.complete(other.id, course.id, 'bob-lesson');
    await stores.payments.add({ _id: 'paid', userId: user.id, courseId: course.id, amountDkk: 499, stripeCustomerId: 'cus_retained', paidAt: user.createdAt });
    await service.eraseUser(user.id, passwordHash);
    expect(await stores.auth.findById(user.id)).toMatchObject({ displayName: 'Deleted user', passwordHash: '', status: 'disabled', enrolledCourseIds: [course.id], privacyErasure: { state: 'complete' } });
    expect(await stores.auth.countEnrolledUsers(course.id)).toBe(2);
    expect((await stores.courses.listCourses()).find(c => c.id === course.id)).toMatchObject({ ownerUserId: SYSTEM_ACCOUNT_ID, teacherIds: [SYSTEM_ACCOUNT_ID], teacher: 'Former instructor', status: 'published' });
    expect(JSON.stringify(await stores.content.getCourseContent(course.id))).not.toContain(user.displayName);
    expect(await stores.progress.list(user.id)).toEqual([]);
    expect(await stores.progress.list(other.id)).toHaveLength(1);
    expect(await stores.payments.findById('paid')).toMatchObject({ amountDkk: 499, stripeCustomerId: 'cus_retained' });
    await service.eraseUser(user.id, passwordHash);
    expect((await stores.audit.recent()).filter(c => c.id === `account-erasure:${user.id}`)).toHaveLength(1);
  });

  it('leaves a disabled pending account on failure and safely resumes with no normal login restoration', async () => {
    const { stores, service, user, passwordHash } = await privacyFixture();
    const remove = stores.notes.removeForUser.bind(stores.notes);
    stores.notes.removeForUser = async () => { throw new Error('Synthetic failure'); };
    await expect(service.eraseUser(user.id, passwordHash)).rejects.toThrow('Synthetic failure');
    expect(await stores.auth.findById(user.id)).toMatchObject({ status: 'disabled', privacyErasure: { state: 'pending' } });
    stores.notes.removeForUser = remove;
    await service.eraseUser(user.id, passwordHash);
    expect(await stores.auth.findById(user.id)).toMatchObject({ passwordHash: '', privacyErasure: { state: 'complete' } });
  });

  it('checks owner blockers before changing an account or its course data', async () => {
    const { stores, service, user, passwordHash } = await privacyFixture();
    await stores.organizations.createOrganization({ id: 'org', displayName: 'Academy org', companyName: 'Company', cvr: '12345678', billingEmail: user.email,
      state: 'active', originalOwnerId: user.id, createdAt: user.createdAt });
    await stores.organizations.insertMembership({ userId: user.id, orgId: 'org', role: 'owner', state: 'active', careerId: null, startedCourseIds: [], joinedAt: user.createdAt, consentAt: user.createdAt });
    await expect(service.eraseUser(user.id, passwordHash)).rejects.toMatchObject({ status: 409, organizations: [{ id: 'org', name: 'Academy org' }] });
    expect(await stores.auth.findById(user.id)).toEqual(user);
  });

  it('retries a failed course-name write without losing the ownership marker needed for cleanup', async () => {
    const { stores, service, user, passwordHash } = await privacyFixture();
    const course = await stores.courses.createCourse(createCourseSchema.parse({ title: 'Retained course', description: 'A course that remains after deletion', teacher: user.displayName, level: 'Beginner', careerGoals: [], status: 'published' }),
      { id: 'retry-course', createdAt: user.createdAt, ownerUserId: user.id });
    const update = stores.courses.updateCourse.bind(stores.courses);
    let fail = true;
    stores.courses.updateCourse = async (...args) => { if (fail) { fail = false; throw new Error('Synthetic name-write failure'); } return update(...args); };
    await expect(service.eraseUser(user.id, passwordHash)).rejects.toThrow('Synthetic name-write failure');
    await service.eraseUser(user.id, passwordHash);
    expect((await stores.courses.listCourses()).find(item => item.id === course.id)).toMatchObject({ teacher: 'Former instructor', ownerUserId: SYSTEM_ACCOUNT_ID });
  });

  it('drains an admitted recipient notification before removing it and refuses new recipient writes', async () => {
    const { stores, user, passwordHash } = await privacyFixture();
    const coordinator = new PrivacyMutationCoordinator(stores.organizations, stores.auth);
    const service = new PrivacyService(stores, coordinator.run);
    const notifications = new NotificationService({ auth: stores.auth, profiles: stores.profile, organizations: stores.organizations, repository: stores.notifications });
    let release!: () => void; let entered!: () => void; let closing!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const closed = new Promise<void>(resolve => { closing = resolve; });
    const create = stores.notifications.create.bind(stores.notifications);
    stores.notifications.create = async input => { entered(); await gate; return create(input); };
    const begin = stores.auth.beginErasure.bind(stores.auth);
    stores.auth.beginErasure = async (...args) => { const value = await begin(...args); closing(); return value; };
    const delivery = notifications.notify({ recipientUserId: user.id, type: 'course-published', title: 'Published', link: '/home' });
    await waiting;
    const erasure = service.eraseUser(user.id, passwordHash);
    await closed;
    release();
    await Promise.all([delivery, erasure]);
    expect(await stores.notifications.collectForExport(user.id)).toEqual([]);
    await notifications.notify({ recipientUserId: user.id, type: 'course-published', title: 'Too late', link: '/home' });
    expect(await stores.notifications.collectForExport(user.id)).toEqual([]);
  });

  it('rechecks organization ownership after an admitted approval and restores access before refusing deletion', async () => {
    const { stores, user, passwordHash } = await privacyFixture();
    const coordinator = new PrivacyMutationCoordinator(stores.organizations, stores.auth);
    const privacy = new PrivacyService(stores, coordinator.run);
    const organizations = new OrganizationService({ repository: stores.organizations, auth: stores.auth,
      sender: { provider: 'local', available: false, send: async () => {} }, withUserMutation: coordinator.mutate });
    const admin = (await stores.auth.findByEmail('admin@qi-education.local'))!;
    const request = await organizations.submitRequest(user, { displayName: 'New company', companyName: 'Company', cvr: '12345678', billingEmail: user.email });
    await stores.progress.complete(user.id, 'retained-course', 'keep-until-erasure');
    let release!: () => void; let entered!: () => void; let closing!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const closed = new Promise<void>(resolve => { closing = resolve; });
    const create = stores.organizations.createOrganization.bind(stores.organizations);
    stores.organizations.createOrganization = async input => { entered(); await gate; return create(input); };
    const begin = stores.auth.beginErasure.bind(stores.auth);
    stores.auth.beginErasure = async (...args) => { const result = await begin(...args); closing(); return result; };
    const approval = organizations.decide(admin.id, request.id, { action: 'approve' });
    await waiting;
    const erasure = privacy.eraseUser(user.id, passwordHash).then(() => null, error => error);
    await closed;
    release();
    await approval;
    expect(await erasure).toMatchObject({ status: 409, organizations: [{ id: request.id, name: 'New company' }] });
    expect(await stores.auth.findById(user.id)).toMatchObject({ email: user.email, status: 'active', passwordHash });
    expect((await stores.auth.findById(user.id))?.privacyErasure).toBeUndefined();
    expect(await stores.progress.list(user.id)).toHaveLength(1);
    // After the owner blocker is resolved, a fresh erasure can finish normally.
    await stores.organizations.setOrganizationState(request.id, 'suspended');
    await privacy.eraseUser(user.id, passwordHash);
    expect(await stores.organizations.getMembership(user.id)).toBeNull();
    expect((await stores.organizations.getOrganization(request.id))?.billingEmail).toBe('');
  });

  it('transfers an erased owner to the system while preserving co-teacher assignment', async () => {
    const { stores, service, user, other, passwordHash } = await privacyFixture();
    const course = await stores.courses.createCourse(createCourseSchema.parse({ title: 'Shared course', description: 'A shared course that remains published', teacher: `${user.displayName}, ${other.displayName}`, level: 'Beginner', careerGoals: [], status: 'published' }),
      { id: 'co-teaching', createdAt: user.createdAt, teacherIds: [user.id, other.id] });
    await service.eraseUser(user.id, passwordHash);
    expect((await stores.courses.listCourses()).find(item => item.id === course.id)).toMatchObject({ ownerUserId: SYSTEM_ACCOUNT_ID,
      teacherIds: [SYSTEM_ACCOUNT_ID, other.id], teacher: other.displayName, status: 'published' });
  });
});
