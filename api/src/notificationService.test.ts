import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryAccountProfileRepository } from './accountProfileRepository.js';
import { accountProfileSchema } from './accountProfile.js';
import { InMemoryNotificationRepository } from './notificationRepository.js';
import { InMemoryOrganizationRepository } from './organizationRepository.js';
import { NotificationService, TYPE_GROUP } from './notificationService.js';

afterEach(() => vi.restoreAllMocks());
async function fixture() {
  const auth = new InMemoryAuthRepository(), profiles = new InMemoryAccountProfileRepository();
  const repository = new InMemoryNotificationRepository(), organizations = new InMemoryOrganizationRepository();
  const users = await auth.listUsers();
  const student = users.find(u => u.role === 'student')!, teacher = users.find(u => u.role === 'teacher')!, admin = users.find(u => u.role === 'admin')!;
  const service = new NotificationService({ repository, auth, profiles, organizations });
  return { auth, profiles, repository, organizations, service, student, teacher, admin };
}
const event = { type: 'org-invitation' as const, title: 'You are invited', link: '/organization' };
describe('US-P019 A3 notification recipient policy', () => {
  it('defaults to delivery, skips missing/disabled recipients and respects muted preferences', async () => {
    const f = await fixture();
    await f.service.notify({ ...event, recipientUserId: f.student.id });
    expect(await f.repository.countUnread(f.student.id)).toBe(1);
    await f.profiles.save(f.student.id, accountProfileSchema.parse({ bio: '', jobTitle: '', company: '', learningGoals: '', avatarColor: '#123456', notificationPrefs: { organization: false } }));
    await f.service.notify({ ...event, recipientUserId: f.student.id });
    await f.service.notify({ ...event, recipientUserId: 'missing' });
    await f.auth.updateStatus(f.teacher.id, 'disabled');
    await f.service.notify({ ...event, recipientUserId: f.teacher.id });
    expect(await f.repository.countUnread(f.student.id)).toBe(1);
    expect(await f.repository.countUnread(f.teacher.id)).toBe(0);
  });
  it('maps all nine event types and enforces review/admin roles', async () => {
    expect(TYPE_GROUP).toEqual({ 'review-requested': 'reviewActivity', 'course-submitted': 'reviewActivity',
      'review-changes-requested': 'reviewActivity', 'course-published': 'reviewActivity', 'org-invitation': 'organization',
      'org-request-received': 'adminInbox', 'org-request-approved': 'organization', 'org-request-declined': 'organization', 'org-member-joined': 'organization' });
    const f = await fixture();
    for (const type of ['course-published', 'org-request-received'] as const) await f.service.notify({ ...event, type, recipientUserId: f.student.id });
    await f.service.notify({ ...event, type: 'org-request-received', recipientUserId: f.teacher.id });
    expect(await f.repository.countUnread(f.student.id)).toBe(0);
    expect(await f.repository.countUnread(f.teacher.id)).toBe(0);
  });
  it('fans out to active admins and organization owners only', async () => {
    const f = await fixture(), now = new Date().toISOString();
    const second = await f.auth.createUser({ ...f.admin, id: 'second-admin', email: 'second@example.test' });
    await f.service.notifyAdmins({ ...event, type: 'course-submitted' });
    expect(await f.repository.countUnread(f.admin.id)).toBe(1);
    expect(await f.repository.countUnread(second.id)).toBe(1);
    expect(await f.repository.countUnread(f.student.id)).toBe(0);
    for (const [userId, role] of [[f.student.id, 'owner'], [f.teacher.id, 'member']] as const) {
      await f.organizations.insertMembership({ userId, orgId: 'org', role, state: 'active', careerId: null, startedCourseIds: [], consentAt: now, joinedAt: now });
    }
    await f.service.notifyOrgOwners('org', { ...event, type: 'org-member-joined' });
    expect(await f.repository.countUnread(f.student.id)).toBe(1);
    expect(await f.repository.countUnread(f.teacher.id)).toBe(0);
  });
  it('isolates recipient, preference, fan-out and notification-store failures without exposing details', async () => {
    const f = await fixture(), warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(f.repository, 'create').mockRejectedValue(new Error('secret provider detail'));
    await expect(f.service.notify({ ...event, recipientUserId: f.student.id })).resolves.toBeUndefined();
    vi.spyOn(f.auth, 'listUsers').mockRejectedValue(new Error('secret provider detail'));
    await expect(f.service.notifyAdmins(event)).resolves.toBeUndefined();
    vi.spyOn(f.organizations, 'listMembers').mockRejectedValue(new Error('secret provider detail'));
    await expect(f.service.notifyOrgOwners('org', event)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret provider detail');
  });
});
