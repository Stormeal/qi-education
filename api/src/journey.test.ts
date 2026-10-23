// US-P001: one release-candidate journey across teacher, admin and learner roles.
// Runs the real Express app over HTTP with in-memory stores only: no shared user
// data is touched and any attempt to create a GitHub issue fails the run.
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { MongoCourseRepository } from './mongoCourseRepository.js';
import { fakeCourseCollection } from '../test/fakeCourseCollection.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';
import { FakePaymentService } from './paymentService.js';
import { InMemoryPaymentRepository } from './paymentRepository.js';
import { InMemoryOrganizationRepository, MongoOrganizationRepository } from './organizationRepository.js';
import { fakeOrganizationCollections } from './organizationTestSupport.js';
import type { MailMessage } from './mailSender.js';

const answers = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: `Answer ${id}`, description: `Why ${id}`, isCorrect: id === 'b' }));
const sections = [{ id: 'intro', title: 'Introduction', components: [
  { id: 'lesson', title: 'Welcome', type: 'text', content: 'Private lesson body' },
  { id: 'quiz', title: 'Check', type: 'quiz', quiz: { passPoints: 1, questions: [{ id: 'q1', question: 'Pick b', points: 1, answers }] } },
  { id: 'files', title: 'Files', type: 'resources' },
] }];

describe.each(['memory', 'mongodb'])('US-P001 release journey: author, review, enroll, learn (%s)', store => {
  let server: Server, base: string, auth: InMemoryAuthRepository;
  let teacher: AuthUser, otherTeacher: AuthUser, admin: AuthUser, student: AuthUser, earlyLearner: AuthUser;
  let courseId = '';
  const organizationMail: MailMessage[] = [];

  function request(path: string, user?: AuthUser, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers, ...(user ? {
      authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const review = async (user: AuthUser) =>
    (await (await request(`/courses/${courseId}/content?view=author`, user)).json()).review as { version: number; revisionId: string | null };
  // Authoring saves must name the revision they were based on (US-T005).
  const save = async (user: AuthUser, path: string, body: unknown) => {
    const { version, revisionId } = (await review(user).catch(() => null)) ?? { version: 0, revisionId: null };
    return request(path, user, 'PATCH', body, { 'X-Course-Revision': JSON.stringify({ version, revisionId }) });
  };
  const act = async (user: AuthUser, action: string) => {
    const { version, revisionId } = await review(admin);
    return request(`/courses/${courseId}/review`, user, 'POST', { action, expectedVersion: version, revisionId, reason: '' });
  };
  const catalogIds = async (user?: AuthUser) =>
    ((await (await request('/courses', user)).json()) as { id: string }[]).map((course) => course.id);

  beforeAll(async () => {
    auth = new InMemoryAuthRepository();
    teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    earlyLearner = await auth.createUser({ ...student, id: 'early-learner', email: 'early-learner@example.test' });
    otherTeacher = await auth.createUser({ ...teacher, id: 'other-teacher', email: 'other-teacher@example.test' });
    const content = new InMemoryCourseContentRepository(), assets = new InMemoryCourseAssetRepository();
    if (store === 'mongodb') { Object.defineProperty(content, 'storageType', { value: 'mongodb' }); Object.defineProperty(assets, 'storageType', { value: 'mongodb' }); }
    const collection = fakeCourseCollection().collection;
    server = createServer({ authRepository: auth,
      organizationRepository: store === 'mongodb' ? new MongoOrganizationRepository(fakeOrganizationCollections()) : new InMemoryOrganizationRepository(),
      mailSender: { provider: 'local', available: true, send: async message => { organizationMail.push(message); } },
      organizationOptions: { appPublicUrl: 'http://localhost:4301' },
      emailConfirmationOptions: { appPublicUrl: 'http://localhost:4301' },
      careerPathRepository: new InMemoryCareerPathRepository(),
      courseRepository: store === 'mongodb' ? new MongoCourseRepository(async () => collection) : new InMemoryCourseRepository(), courseContentRepository: content,
      courseAssetRepository: assets, feedbackRepository: new InMemoryFeedbackRepository(),
      muxVideoService: null, muxWebhookService: null,
      paymentService: new FakePaymentService(), paymentRepository: new InMemoryPaymentRepository(),
      gitHubFeedbackService: { createIssueFromFeedback: async () => { throw new Error('The journey must never create a GitHub issue.'); } },
    }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

  it('1. a teacher creates a private draft and writes a lesson and a quiz', async () => {
    const created = await request('/courses', teacher, 'POST',
      { title: 'Journey course', description: 'A course used by the release journey.', level: 'Beginner', teacher: 'Teacher Demo' });
    expect(created.status).toBe(201);
    courseId = (await created.json()).id;

    expect((await save(teacher, `/courses/${courseId}/content`, { sections })).status).toBe(200);
    // Resources lessons take handouts: PDF and Word are accepted, executables are not.
    const attach = (type: string) => fetch(`${base}/courses/${courseId}/content/components/files/attachments`, { method: 'PUT',
      headers: { 'Content-Type': type, 'X-Section-Id': 'intro', 'X-File-Name': 'handout',
        authorization: `Bearer ${createSessionToken(toAuthenticatedUser(teacher), apiConfig.AUTH_TOKEN_SECRET!)}` }, body: Buffer.from('file') });
    expect((await attach('application/pdf')).status).toBe(201);
    expect((await attach('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).status).toBe(201);
    expect((await attach('application/x-msdownload')).status).toBe(415);
    expect(await catalogIds()).not.toContain(courseId);
    expect(await catalogIds(student)).not.toContain(courseId);
    expect(await catalogIds(teacher)).toContain(courseId);
  });

  it('2. nobody else can author or read the draft', async () => {
    expect((await save(otherTeacher, `/courses/${courseId}/content`, { sections: [] })).status).toBe(403);
    expect((await save(student, `/courses/${courseId}/content`, { sections: [] })).status).toBe(403);
    expect((await request(`/courses/${courseId}/content`, undefined)).status).toBe(401);
    expect((await request(`/courses/${courseId}/content`, student)).status).toBe(403);
    expect((await request(`/courses/${courseId}/content?view=author`, otherTeacher)).status).toBe(403);
    expect((await request(`/users/me/courses/${courseId}`, student, 'POST')).status).toBe(403);
    expect((await request(`/courses/${courseId}/price`, teacher, 'PATCH', { priceDkk: 100 })).status).toBe(403);
  });

  it('3. the teacher submits; only an admin can publish', async () => {
    expect((await act(teacher, 'submit')).status).toBe(200);
    expect((await act(teacher, 'publish')).status).toBe(403);
    expect((await save(teacher, `/courses/${courseId}/content`, { sections })).status).toBe(409);
    expect(await catalogIds()).not.toContain(courseId);

    expect((await act(admin, 'publish')).status).toBe(200);
    expect(await catalogIds()).toContain(courseId);
  });

  it('4. US-L024-AC01 AC02 AC03 the learner buys access; an earlier enrollment stays free', async () => {
    const outline = await (await request(`/courses/${courseId}/outline`)).json();
    expect(JSON.stringify(outline)).not.toContain('Private lesson body');
    expect(outline.sections[0].components.map((component: { title: string }) => component.title)).toEqual(['Welcome', 'Check', 'Files']);
    expect((await request(`/courses/${courseId}/content`, student)).status).toBe(403);

    expect((await request(`/users/me/courses/${courseId}`, earlyLearner, 'POST')).status).toBe(200);
    expect((await request(`/courses/${courseId}/price`, admin, 'PATCH', { priceDkk: 100 })).status).toBe(200);
    expect((await request(`/courses/${courseId}/content`, earlyLearner)).status).toBe(200);
    expect((await request(`/users/me/courses/${courseId}`, student, 'POST')).status).toBe(402);
    const checkout = await request(`/users/me/courses/${courseId}/checkout`, student, 'POST',
      { returnUrl: `http://localhost:4200/courses/${courseId}` });
    expect(checkout.status).toBe(200);
    const sessionId = new URL((await checkout.json()).url).searchParams.get('session_id');
    expect(sessionId).toMatch(/^fake_cs_/);
    const confirmed = await request(`/users/me/courses/${courseId}/checkout/confirm`, student, 'POST', { sessionId });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({ paid: true, user: { enrolledCourseIds: [courseId] } });
    const content = await request(`/courses/${courseId}/content`, student);
    expect(content.status).toBe(200);
    const body = JSON.stringify(await content.json());
    expect(body).toContain('Private lesson body');
    expect(body).not.toContain('isCorrect');
    expect(body).not.toContain('"review"');
  });

  it('5. quiz progress is graded by the server: a wrong answer fails, the right one passes', async () => {
    const attempt = (answerId: string, user = student) =>
      request(`/courses/${courseId}/content/components/quiz/quiz-attempts`, user, 'POST',
        { sectionId: 'intro', answers: [{ questionId: 'q1', answerId }] });
    expect(await (await attempt('a')).json()).toMatchObject({ passed: false, score: 0, totalPoints: 1 });
    expect(await (await attempt('b')).json()).toMatchObject({ passed: true, score: 1 });
    expect((await attempt('b', otherTeacher)).status).toBe(403);
  });

  it('6. published learning cannot be changed without a new reviewed revision', async () => {
    expect((await save(teacher, `/courses/${courseId}/content`, { sections: [] })).status).toBe(409);
    expect((await request(`/courses/${courseId}/content`, student)).status).toBe(200);
    expect((await request('/feedback', student)).status).toBe(403);
  });

  it('US-A004-AC02 US-L019-AC02 US-L020-AC01 US-L020-AC03 US-L021-AC01 launch draft → publish → follow → declare → shared unlock', async () => {
    expect(await (await request('/career-paths')).json()).toEqual([]);
    const drafts = await (await request('/admin/career-paths', admin)).json();
    // Publishing these unapproved starting drafts is an isolated test action only.
    for (const id of ['technical-tester', 'test-manager', 'test-analyst']) {
      const { draft } = drafts.find((item: { id: string }) => item.id === id);
      expect(draft.schemaVersion).toBe(2);
      expect((await request(`/admin/career-paths/${id}`, admin, 'PUT', draft)).status).toBe(200);
      expect((await request(`/admin/career-paths/${id}/publish`, admin, 'POST')).status).toBe(200);
    }
    const enrollments = (await auth.findById(student.id))!.enrolledCourseIds;
    for (const id of ['technical-tester', 'test-manager']) {
      expect((await request(`/users/me/careers/${id}`, student, 'PUT')).status).toBe(200);
    }
    const locked = await request('/users/me/achievements', student, 'POST', { actionId: 'automation-engineer-exam' });
    expect(locked.status).toBe(409); expect(await locked.json()).toMatchObject({ code: 'milestone-locked' });
    const foundation = await request('/users/me/achievements', student, 'POST', { actionId: 'foundation-exam' });
    expect(foundation.status).toBe(200); expect(foundation.headers.get('cache-control')).toBe('private, no-store');
    const shared = await foundation.json();
    expect(shared).toMatchObject({ followedPathIds: ['technical-tester', 'test-manager'],
      milestoneStates: { foundation: 'achieved', 'technical-foundations': 'ready', 'test-manager-role': 'ready', 'test-design': 'ready' } });
    expect((await request('/users/me/achievements', student, 'POST', { actionId: 'technical-foundations-activity' })).status).toBe(200);
    const role = await (await request('/users/me/achievements', student, 'POST', { actionId: 'automation-engineer-exam' })).json();
    expect(role.milestoneStates).toMatchObject({ 'automation-engineer': 'achieved', 'technical-test-analyst': 'ready', 'automation-practice': 'ready' });
    const removed = await (await request('/users/me/careers/technical-tester', student, 'DELETE')).json();
    expect(removed).toMatchObject({ followedPathIds: ['test-manager'], focusPathId: null, achievements: role.achievements });
    expect((await auth.findById(student.id))!.enrolledCourseIds).toEqual(enrollments);
  });

  it('US-L023-AC02 US-L023-AC05 a learner saves a CV finding out of order', async () => {
    const before = await (await request('/users/me/careers', student)).json();
    expect(before.milestoneStates['advanced-test-manager']).toBe('locked');
    expect(before.milestoneStates['test-manager-role']).not.toBe('achieved');
    const response = await request('/users/me/achievements/cv', student, 'POST', {
      actionIds: ['advanced-test-manager-exam'],
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const saved = await response.json();
    expect(saved.milestoneStates['advanced-test-manager']).toBe('achieved');
    expect(saved.achievements).toContainEqual({ actionId: 'advanced-test-manager-exam', provenance: 'cv', declaredAt: expect.any(String) });
    expect(saved.milestoneStates['test-manager-role']).toBe(before.milestoneStates['test-manager-role']);
    expect(await (await request('/users/me/careers', student)).json()).toEqual(saved);
  });

  it('US-O001-AC01 AC02 AC04 AC07 AC09 request, invite, confirm, learn a priced course and revoke', async () => {
    const applied = await request('/users/me/organization-request', student, 'POST', {
      displayName: 'Journey organization', companyName: 'Journey Company', cvr: '12345678',
      billingEmail: 'billing@example.test', message: 'Train our team',
    });
    expect(applied.status).toBe(201); const application = await applied.json();
    const approved = await request(`/admin/organization-requests/${application.id}/decision`, admin, 'POST', { action: 'approve' });
    expect(approved.status).toBe(200); const orgId = (await approved.json()).organizationId;
    const email = `organization-${store}@example.test`;
    expect((await request(`/organizations/${orgId}/invitations`, student, 'POST', { email })).status).toBe(201);
    const invitationMail = organizationMail.findLast(message => message.to === email && message.subject === 'Join Journey organization')!;
    expect(invitationMail.text).toContain('Joining shares your career and course progress with Journey organization');
    const token = invitationMail.text.match(/#token=([A-Za-z0-9_-]+)/)![1];
    expect((await request('/organization-invitations/check', undefined, 'POST', { token })).status).toBe(200);
    expect((await request('/auth/signup', undefined, 'POST', { displayName: 'Organization learner', email, password: 'Password123!' })).status).toBe(201);
    const member = (await auth.findByEmail(email))!;
    expect((await request('/organization-invitations/accept', member, 'POST', { token, consent: true })).status).toBe(202);
    const confirmationMail = organizationMail.findLast(message => message.to === email && message.subject === 'Confirm your QI Academy email address')!;
    const confirmation = confirmationMail.text.match(/#token=([A-Za-z0-9_-]+)/)![1];
    expect((await request('/auth/email-confirmation/confirm', undefined, 'POST', { token: confirmation })).status).toBe(204);
    expect(await (await request('/auth/me', member)).json()).toMatchObject({ organization: { id: orgId, role: 'member' } });
    const career = { schemaVersion: 2, title: 'Organization journey career', steps: [{ id: 'organization-milestone', title: 'Learn together', required: true,
      actions: [{ id: 'organization-course', kind: 'course', title: 'Journey course', courseId }],
      requirementBundles: [['organization-course']], courses: [{ courseId }],
    }] };
    expect((await request('/admin/career-paths/organization-journey', admin, 'PUT', career)).status).toBe(200);
    expect((await request('/admin/career-paths/organization-journey/publish', admin, 'POST')).status).toBe(200);
    expect((await request(`/organizations/${orgId}/members/${member.id}/career`, student, 'PUT', { careerId: 'organization-journey' })).status).toBe(200);
    expect(await (await request('/users/me/organization', member)).json()).toMatchObject({ openCourseIds: [courseId] });
    expect((await request(`/courses/${courseId}/content`, member)).status).toBe(403);
    const organizationEnrollment = await request(`/users/me/courses/${courseId}`, member, 'POST');
    expect(organizationEnrollment.status).toBe(200);
    expect((await organizationEnrollment.json()).user.enrolledCourseIds).toEqual([courseId]);
    expect((await (await request('/auth/me', member)).json()).user.enrolledCourseIds).toEqual([courseId]);
    expect(await (await request('/users/me/organization', member)).json()).toMatchObject({ startedCourseIds: [courseId] });
    expect((await auth.findById(member.id))!.enrolledCourseIds).toEqual([]);
    expect((await request(`/courses/${courseId}/content`, member)).status).toBe(200);
    expect((await request(`/organizations/${orgId}/members/${member.id}`, student, 'DELETE')).status).toBe(204);
    expect((await request(`/courses/${courseId}/content`, member)).status).toBe(403);
    expect((await (await request('/auth/me', member)).json()).user.enrolledCourseIds).toEqual([]);
    expect((await auth.findById(member.id))!.enrolledCourseIds).toEqual([]);
  });

});
