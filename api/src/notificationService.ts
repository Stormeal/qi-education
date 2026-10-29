import { accountProfileResponse, type NotificationPrefs } from './accountProfile.js';
import type { AccountProfileRepository } from './accountProfileRepository.js';
import type { AuthRepository } from './authRepository.js';
import type { NewNotification, NotificationType } from './notification.js';
import type { NotificationRepository } from './notificationRepository.js';
import type { OrganizationRepository } from './organizationRepository.js';

export const TYPE_GROUP: Record<NotificationType, keyof NotificationPrefs> = {
  'review-requested': 'reviewActivity', 'course-submitted': 'reviewActivity',
  'review-changes-requested': 'reviewActivity', 'course-published': 'reviewActivity',
  'org-invitation': 'organization', 'org-request-received': 'adminInbox',
  'org-request-approved': 'organization', 'org-request-declined': 'organization', 'org-member-joined': 'organization',
};
export type NotificationEvent = Omit<NewNotification, 'userId'>;
const warn = () => console.warn('Notification delivery unavailable; the original action is preserved.');

export async function safelyNotify(operation: () => Promise<unknown>): Promise<void> {
  try { await operation(); } catch { warn(); }
}

export class NotificationService {
  constructor(private readonly dependencies: {
    repository: NotificationRepository; auth: AuthRepository; profiles: AccountProfileRepository;
    organizations: OrganizationRepository;
  }) {}
  async notify(input: NotificationEvent & { recipientUserId: string }): Promise<void> {
    try {
      const { repository, auth, profiles } = this.dependencies;
      const user = await auth.findById(input.recipientUserId, { fresh: true });
      if (!user || user.status !== 'active') return;
      const group = TYPE_GROUP[input.type];
      if (group === 'adminInbox' && user.role !== 'admin') return;
      if (group === 'reviewActivity' && user.role === 'student') return;
      if (!accountProfileResponse(await profiles.get(user.id)).notificationPrefs[group]) return;
      await repository.create({ userId: user.id, type: input.type, title: input.title, link: input.link });
    } catch { warn(); }
  }
  async notifyAdmins(input: NotificationEvent): Promise<void> {
    try {
      const users = await this.dependencies.auth.listUsers({ fresh: true });
      await Promise.all(users.filter(user => user.role === 'admin' && user.status === 'active')
        .map(user => this.notify({ ...input, recipientUserId: user.id })));
    } catch { warn(); }
  }
  async notifyOrgOwners(orgId: string, input: NotificationEvent): Promise<void> {
    try {
      const members = await this.dependencies.organizations.listMembers(orgId);
      await Promise.all(members.filter(member => member.role === 'owner' && member.state === 'active')
        .map(member => this.notify({ ...input, recipientUserId: member.userId })));
    } catch { warn(); }
  }
}
