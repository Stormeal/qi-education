import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, type AuthUser } from './auth.js';
import { apiConfig } from './config.js';
import { createCourseSchema } from './course.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryNotificationRepository } from './notificationRepository.js';
import { NotificationService } from './notificationService.js';
import { InMemoryOrganizationRepository } from './organizationRepository.js';
import { InMemoryEmailConfirmationRepository } from './emailConfirmationRepository.js';
import { LocalMailSender } from './mailSender.js';
import { freshAuthoringFetch } from './authoringTestRequest.js';
import { createServer } from './server.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  vi.restoreAllMocks();
});
const fields = { displayName: 'Test Team', companyName: 'Test Company', cvr: '12345678', billingEmail: 'billing@example.test', message: '' };
async function fixture(failStore = false) {
  const auth = new InMemoryAuthRepository(), courses = new InMemoryCourseRepository(), content = new InMemoryCourseContentRepository();
  const organizations = new InMemoryOrganizationRepository(), notifications = new InMemoryNotificationRepository();
  const confirmations = new InMemoryEmailConfirmationRepository(), mail = new LocalMailSender(() => {});
  const users = await auth.listUsers(), owner = users.find(u => u.role === 'student')!, teacher = users.find(u => u.role === 'teacher')!, admin = users.find(u => u.role === 'admin')!;
  const reviewer = await auth.createUser({ ...teacher, id: 'reviewer', email: 'reviewer@example.test' });
  const invitee = await auth.createUser({ ...owner, id: 'invitee', email: 'invitee@example.test', emailConfirmed: true });
  await courses.createCourse(createCourseSchema.parse({ title: 'Notification course', description: 'A course for event checks', teacher: 'Author', level: 'Beginner' }), { id: 'notify-course', createdAt: new Date().toISOString(), teacherIds: [teacher.id] });
  await content.createEmptyCourseContent('notify-course');
  await content.updateCourseContent('notify-course', [{ id: 'section', title: 'Section', components: [{ id: 'lesson', title: 'Lesson', type: 'text', content: 'Learn something.', durationMinutes: null, attachments: [] }] }]);
  if (failStore) { vi.spyOn(notifications, 'create').mockRejectedValue(new Error('private store detail')); vi.spyOn(console, 'warn').mockImplementation(() => {}); }
  const server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
    organizationRepository: organizations, notificationRepository: notifications, mailSender: mail,
    emailConfirmationRepository: confirmations }).listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, user: AuthUser, method = 'POST', body?: unknown) => freshAuthoringFetch(base + path, {
    method, headers: { authorization: `Bearer ${createSessionToken(user, apiConfig.AUTH_TOKEN_SECRET)}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  async function act(action: string, user = teacher, reason = '') {
    const state = (await (await request('/courses/notify-course/content?view=author', teacher, 'GET')).json()).review;
    return request('/courses/notify-course/review', user, 'POST', { action, reason, expectedVersion: state.version, revisionId: state.revisionId });
  }
  return { auth, organizations, notifications, mail, request, act, owner, teacher, admin, reviewer, invitee };
}
describe('US-P019 A6 workflow notification triggers', () => {
  it('notifies assigned reviewers, admins on submit, and the owner on changes/publication', async () => {
    const f = await fixture();
    const assign = () => f.request('/courses/notify-course/reviewers', f.admin, 'PUT', { reviewerIds: [f.reviewer.id] });
    expect((await assign()).status).toBe(200);
    expect((await assign()).status).toBe(200);
    expect((await f.notifications.listForUser(f.reviewer.id)).map(n => n.type)).toEqual(['review-requested']);
    expect((await f.act('submit')).status).toBe(200);
    expect((await f.notifications.listForUser(f.admin.id)).map(n => n.type)).toContain('course-submitted');
    expect((await f.act('request-changes', f.reviewer, 'Please clarify')).status).toBe(200);
    expect((await f.notifications.listForUser(f.teacher.id)).map(n => n.type)).toContain('review-changes-requested');
    expect((await f.act('return', f.admin, 'Clarify the lesson')).status).toBe(200);
    expect((await f.act('submit')).status).toBe(200);
    expect((await f.act('approve', f.reviewer)).status).toBe(200);
    expect((await f.act('publish', f.admin)).status).toBe(200);
    const notices = await f.notifications.listForUser(f.teacher.id);
    expect(notices.map(n => n.type)).toContain('course-published');
    expect(notices.filter(n => n.type === 'review-changes-requested')).toHaveLength(2);
    expect(notices.every(n => n.title.includes('Notification course') && n.link === '/courses/notify-course/edit')).toBe(true);
    expect(await f.notifications.countUnread(f.owner.id)).toBe(0);
  });
  it('notifies organization request decisions, existing invitees and owners after accepting', async () => {
    const f = await fixture();
    const submitted = await f.request('/users/me/organization-request', f.owner, 'POST', fields);
    expect(submitted.status).toBe(201);
    const orgRequest = await submitted.json();
    expect((await f.notifications.listForUser(f.admin.id)).map(n => n.type)).toEqual(['org-request-received']);
    expect((await f.request(`/admin/organization-requests/${orgRequest.id}/decision`, f.admin, 'POST', { action: 'decline', reason: 'Check details' })).status).toBe(200);
    expect((await f.notifications.listForUser(f.owner.id)).map(n => n.type)).toContain('org-request-declined');
    expect((await f.request('/users/me/organization-request', f.owner, 'PUT', fields)).status).toBe(200);
    const approved = await f.request(`/admin/organization-requests/${orgRequest.id}/decision`, f.admin, 'POST', { action: 'approve' });
    expect(approved.status).toBe(200);
    const orgId = (await approved.json()).organizationId;
    expect((await f.notifications.listForUser(f.owner.id)).map(n => n.type)).toContain('org-request-approved');
    const create = vi.spyOn(f.notifications, 'create');
    expect((await f.request(`/organizations/${orgId}/invitations`, f.owner, 'POST', { email: 'no-account@example.test' })).status).toBe(201);
    expect(create).not.toHaveBeenCalled();
    expect((await f.request(`/organizations/${orgId}/invitations`, f.owner, 'POST', { email: f.invitee.email })).status).toBe(201);
    expect((await f.notifications.listForUser(f.invitee.id)).map(n => n.type)).toEqual(['org-invitation']);
    const invitationMail = f.mail.messages.findLast(message => message.to === f.invitee.email)!;
    const token = invitationMail.text.match(/#token=([A-Za-z0-9_-]+)/)![1];
    const response = await f.request('/organization-invitations/accept', f.invitee, 'POST', { token, consent: true });
    expect(response.status).toBe(200);
    expect((await f.notifications.listForUser(f.owner.id)).map(n => n.type)).toContain('org-member-joined');
    expect(JSON.stringify(await f.notifications.listForUser(f.invitee.id))).not.toContain(token);
  });
  it('notifies owners once after pending membership becomes active through auth/me', async () => {
    const f = await fixture();
    const pending = await f.auth.createUser({ ...f.owner, id: 'pending-member', email: 'pending@example.test', emailConfirmed: false });
    const submitted = await f.request('/users/me/organization-request', f.owner, 'POST', fields);
    const approved = await f.request(`/admin/organization-requests/${(await submitted.json()).id}/decision`, f.admin, 'POST', { action: 'approve' });
    const orgId = (await approved.json()).organizationId;
    await f.request(`/organizations/${orgId}/invitations`, f.owner, 'POST', { email: pending.email });
    const token = f.mail.messages.findLast(message => message.to === pending.email)!.text.match(/#token=([A-Za-z0-9_-]+)/)![1];
    expect((await f.request('/organization-invitations/accept', pending, 'POST', { token, consent: true })).status).toBe(202);
    const joinedCount = async () => (await f.notifications.listForUser(f.owner.id)).filter(n => n.type === 'org-member-joined').length;
    expect(await joinedCount()).toBe(0);
    await f.auth.confirmEmail(pending.id);
    expect((await f.request('/auth/me', pending, 'GET')).status).toBe(200);
    expect((await f.request('/auth/me', pending, 'GET')).status).toBe(200);
    expect(await joinedCount()).toBe(1);
  });
  it.each(['store', 'service'])('keeps submit, publish, organization request and invitation successful during notification %s failure', async failure => {
    const f = await fixture(failure === 'store');
    if (failure === 'service') {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(NotificationService.prototype, 'notify').mockRejectedValue(new Error('private service detail'));
      vi.spyOn(NotificationService.prototype, 'notifyAdmins').mockRejectedValue(new Error('private service detail'));
    }
    expect((await f.request('/courses/notify-course/reviewers', f.admin, 'PUT', { reviewerIds: [f.reviewer.id] })).status).toBe(200);
    expect((await f.act('submit')).status).toBe(200);
    expect((await f.act('approve', f.reviewer)).status).toBe(200);
    expect((await f.act('publish', f.admin)).status).toBe(200);
    const request = await f.request('/users/me/organization-request', f.owner, 'POST', fields);
    expect(request.status).toBe(201);
    const approved = await f.request(`/admin/organization-requests/${(await request.json()).id}/decision`, f.admin, 'POST', { action: 'approve' });
    expect(approved.status).toBe(200);
    expect((await f.request(`/organizations/${(await approved.json()).organizationId}/invitations`, f.owner, 'POST', { email: f.invitee.email })).status).toBe(201);
    expect(console.warn).toHaveBeenCalled();
  });
});
