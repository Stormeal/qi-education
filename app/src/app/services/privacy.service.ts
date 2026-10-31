import { Injectable, inject } from '@angular/core';
import { ApiClientService } from './api-client.service';
import type { CourseRequest, Invitation, OrgRequest } from './organization.service';

type PrivacyFeedback = {
  id: string; userId: string; userEmail: string; userRole: string; createdAt: string;
  page: string; message: string; type?: 'feedback' | 'defect' | 'change-request'; summary?: string;
  rating?: 'great' | 'okay' | 'needs-work'; userAgent?: string; path?: string;
  reproductionSteps?: string; expectedBehavior?: string; courseId?: string; componentId?: string;
  lessonFeedbackKind?: 'helpful' | 'not-helpful' | 'problem';
  problemCategory?: 'video' | 'content-error' | 'unclear' | 'files' | 'other';
  workStatus?: 'work' | 'completed' | 'wont-do'; priority?: 'low' | 'medium' | 'high';
  githubIssueNumber?: number; githubIssueUrl?: string;
};

/** Mirrors api/src/privacyService.ts exportUserData, including stored document metadata. */
export type PrivacyExport = {
  exportedAt: string;
  termsAcceptances: { documentId: 'tos' | 'purchase'; version: number; acceptedAt: string }[];
  courseRatings: { courseId: string; stars: number; comment?: string; hidden: boolean; createdAt: string; updatedAt: string }[];
  account: { id: string; email: string; displayName: string; role: 'student' | 'teacher' | 'admin';
    status: 'active' | 'disabled'; createdAt: string; enrolledCourseIds: string[]; emailConfirmed: boolean };
  profile: { _id: string; bio: string; jobTitle: string; company: string; learningGoals: string; avatarColor: string;
    notificationPrefs: { reviewActivity: boolean; organization: boolean; adminInbox: boolean }; updatedAt: string } | null;
  instructorProfile: { _id: string; description: string } | null;
  enrolments: string[];
  progress: { _id: string; userId: string; courseId: string; completedIds: string[]; passedQuizzes: string[] }[];
  notes: { id: string; courseId: string; componentId: string; text: string; videoSeconds: number | null;
    createdAt: string; updatedAt: string }[];
  lessonFeedback: PrivacyFeedback[];
  careers: {
    current: { _id: string; version: number; followedPathIds: string[]; focusPathId: string | null;
      achievements: { actionId: string; provenance: 'self-reported' | 'cv'; declaredAt: string }[] } | null;
    legacySelection: { _id: string; pathId: string; revision: number; selectedAt: string } | null;
  };
  payments: { _id: string; userId: string; courseId: string; amountDkk: number; stripeCustomerId: string;
    paidAt: string; refundedAt?: string }[];
  organizations: {
    membership: { userId: string; orgId: string; role: 'member' | 'owner'; state: 'pending-email' | 'active';
      careerId: string | null; startedCourseIds: string[]; consentAt: string; joinedAt: string } | null;
    ownedOrganizations: { id: string; displayName: string }[];
    requests: (Omit<OrgRequest, 'requesterName' | 'requesterEmail'> & { userId: string })[];
    courseRequests: (CourseRequest & { orgId: string })[];
    invitations: (Invitation & { orgId: string })[];
  };
  feedback: PrivacyFeedback[];
  notifications: { id: string; userId: string; type: 'review-requested' | 'course-submitted' | 'review-changes-requested' |
    'course-published' | 'org-invitation' | 'org-request-received' | 'org-request-approved' |
    'org-request-declined' | 'org-member-joined'; title: string; link: string; createdAt: string; readAt: string | null }[];
  authoring: { courseId: string; title: string; owner: boolean; teacher: boolean; reviewer: boolean;
    reviewEvents: { id: string; action: string; createdAt: string; reason: string }[] }[];
};

export type PrivacyBlockingOrganization = { id: string; name: string };
export type PrivacyResult<T> =
  | { ok: true; body: T }
  | { ok: false; status: number; message: string; code?: string; organizations?: PrivacyBlockingOrganization[] };

/** US-P021: caller-scoped privacy requests; personal data is never cached or stored. */
@Injectable({ providedIn: 'root' })
export class PrivacyService {
  private readonly apiClient = inject(ApiClientService);

  exportMyData(token: string): Promise<PrivacyResult<PrivacyExport>> {
    return this.request<PrivacyExport>(token, '/users/me/privacy/export');
  }

  eraseMyAccount(token: string, password: string, confirmation: string): Promise<PrivacyResult<void>> {
    return this.request<void>(token, '/users/me/privacy/erase', 'POST', { password, confirmation });
  }

  private async request<T>(token: string, path: string, method = 'GET', body?: unknown): Promise<PrivacyResult<T>> {
    try {
      const response = await this.apiClient.fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.status === 204) return { ok: true, body: undefined as T };
      const json = await response.json().catch(() => ({}));
      if (response.ok) return { ok: true, body: json as T };
      return { ok: false, status: response.status,
        message: typeof json?.message === 'string' ? json.message : 'The request could not be completed.',
        ...(typeof json?.code === 'string' ? { code: json.code } : {}),
        ...(Array.isArray(json?.organizations) ? { organizations: json.organizations as PrivacyBlockingOrganization[] } : {}),
      };
    } catch {
      return { ok: false, status: 0, message: 'Unable to reach the API. Please try again.' };
    }
  }
}
