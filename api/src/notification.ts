export type NotificationType = 'review-requested' | 'course-submitted' | 'review-changes-requested' |
  'course-published' | 'org-invitation' | 'org-request-received' | 'org-request-approved' |
  'org-request-declined' | 'org-member-joined';
export type Notification = {
  id: string; userId: string; type: NotificationType; title: string; link: string;
  createdAt: string; readAt: string | null;
};
export type NewNotification = Omit<Notification, 'id' | 'createdAt' | 'readAt'>;
