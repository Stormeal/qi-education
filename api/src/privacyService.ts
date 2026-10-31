import type { AuthRepository } from './authRepository.js';
import type { AccountProfileRepository } from './accountProfileRepository.js';
import type { InstructorProfileRepository } from './instructorProfileRepository.js';
import type { LearningProgressRepository } from './learningProgressRepository.js';
import type { LessonNotesRepository } from './lessonNotesRepository.js';
import type { AccountCareersRepository } from './accountCareersRepository.js';
import type { CareerPathRepository } from './careerPathRepository.js';
import type { PaymentRepository } from './paymentRepository.js';
import type { OrganizationRepository } from './organizationRepository.js';
import type { FeedbackRepository } from './feedbackRepository.js';
import type { NotificationRepository } from './notificationRepository.js';
import type { PasswordResetRepository } from './passwordResetRepository.js';
import type { UserChangeRepository } from './userChangeRepository.js';
import type { CourseRepository } from './courseRepository.js';
import type { CourseContentRepository } from './courseContentRepository.js';
import { updateCourseSchema } from './course.js';
import { ensureSystemAccount, SYSTEM_ACCOUNT_ID } from './systemAccount.js';
import { KeyedSerialQueue } from './keyedSerialQueue.js';

export type PrivacyRepositories = {
  auth: AuthRepository; profile: AccountProfileRepository; instructorProfile: InstructorProfileRepository;
  progress: LearningProgressRepository; notes: LessonNotesRepository; careers: AccountCareersRepository;
  legacyCareers: CareerPathRepository; payments: PaymentRepository; organizations: OrganizationRepository;
  feedback: FeedbackRepository; notifications: NotificationRepository; resetTokens: PasswordResetRepository;
  confirmationTokens: PasswordResetRepository; audit: UserChangeRepository;
  courses: CourseRepository; content: CourseContentRepository;
};

// Every constructed personal-data store has an explicit export/erasure policy.
// The repository inventory regression also catches a new repository file with no policy.
export const PERSONAL_DATA_DOMAINS = {
  auth: { file: 'authRepository.ts', export: 'account/enrolments', erase: 'anonymizeForUser' },
  profile: { file: 'accountProfileRepository.ts', export: 'profile', erase: 'removeForUser' },
  instructorProfile: { file: 'instructorProfileRepository.ts', export: 'instructorProfile', erase: 'anonymizeForUser' },
  progress: { file: 'learningProgressRepository.ts', export: 'progress', erase: 'removeForUser' },
  notes: { file: 'lessonNotesRepository.ts', export: 'notes', erase: 'removeForUser' },
  careers: { file: 'accountCareersRepository.ts', export: 'careers', erase: 'removeForUser' },
  legacyCareers: { file: 'careerPathRepository.ts', export: 'careers.legacySelection', erase: 'removeForUser' },
  payments: { file: 'paymentRepository.ts', export: 'payments', erase: 'anonymizeForUser' },
  organizations: { file: 'organizationRepository.ts', export: 'organizations', erase: 'removeForUser' },
  feedback: { file: 'feedbackRepository.ts', export: 'feedback/lessonFeedback', erase: 'anonymizeForUser' },
  notifications: { file: 'notificationRepository.ts', export: 'notifications', erase: 'removeForUser' },
  resetTokens: { file: 'passwordResetRepository.ts', export: null, erase: 'removeForUser' },
  confirmationTokens: { file: 'emailConfirmationRepository.ts', export: null, erase: 'removeForUser' },
  audit: { file: 'userChangeRepository.ts', export: null, erase: 'anonymizeForUser' },
  courses: { file: 'courseRepository.ts', export: 'authoring', erase: 'transfer under course lock' },
  content: { file: 'courseContentRepository.ts', export: 'authoring', erase: 'pseudonymize review history under course lock' },
} satisfies Record<keyof PrivacyRepositories, { file: string; export: string | null; erase: string }>;

export class PrivacyError extends Error {
  constructor(readonly status: number, message: string, readonly organizations?: { id: string; name: string }[]) { super(message); }
}

type UserLock = <T>(userId: string, operation: () => Promise<T>) => Promise<T>;
export class PrivacyService {
  private readonly withUserLock: UserLock;
  constructor(private readonly stores: PrivacyRepositories, withUserLock?: UserLock) {
    const queue = new KeyedSerialQueue();
    this.withUserLock = withUserLock ?? ((id, operation) => queue.run(id, operation));
  }

  exportUserData(userId: string) {
    return this.withUserLock(userId, async () => {
      const s = this.stores;
      const account = await s.auth.collectForExport(userId);
      if (!account || account.status !== 'active') throw new PrivacyError(401, 'Authentication required');
      const [profile, instructorProfile, progress, notes, careers, legacySelection, payments, organizations, feedback, notifications] = await Promise.all([
        s.profile.collectForExport(userId), s.instructorProfile.collectForExport(userId), s.progress.collectForExport(userId),
        s.notes.collectForExport(userId), s.careers.collectForExport(userId), s.legacyCareers.collectForExport(userId),
        s.payments.collectForExport(userId), s.organizations.collectForExport(userId, account.email),
        s.feedback.collectForExport(userId), s.notifications.collectForExport(userId),
      ]);
      const authoring = [];
      for (const course of await s.courses.listCourses()) {
        const doc = await s.content.getCourseContent(course.id);
        const reviewEvents = doc?.review?.history.filter(event => event.actorId === userId)
          .map(({ id, action, createdAt, reason }) => ({ id, action, createdAt, reason })) ?? [];
        if (course.ownerUserId === userId || course.teacherIds?.includes(userId) || course.reviewerIds?.includes(userId) || reviewEvents.length) {
          authoring.push({ courseId: course.id, title: course.title, owner: course.ownerUserId === userId,
            teacher: (course.teacherIds ?? [course.ownerUserId]).includes(userId), reviewer: course.reviewerIds?.includes(userId) ?? false, reviewEvents });
        }
      }
      return { exportedAt: new Date().toISOString(), account, profile, instructorProfile,
        enrolments: [...account.enrolledCourseIds], progress, notes, lessonFeedback: feedback.filter(entry => entry.lessonFeedbackKind),
        careers: { current: careers, legacySelection }, payments, organizations,
        feedback: feedback.filter(entry => !entry.lessonFeedbackKind), notifications, authoring };
    });
  }

  erasureBlockers(userId: string) { return this.stores.organizations.erasureBlockers(userId); }

  eraseUser(userId: string, expectedPasswordHash: string): Promise<void> {
    return this.withUserLock(userId, async () => {
      const s = this.stores;
      let user = await s.auth.findById(userId, { fresh: true });
      if (!user || userId === SYSTEM_ACCOUNT_ID) throw new PrivacyError(401, 'Authentication required');
      if (user.privacyErasure?.state === 'complete') return;
      if (s.auth.readOnly || s.courses.readOnly || s.feedback.readOnly) throw new PrivacyError(503, 'Account deletion is temporarily unavailable during maintenance.');
      const organizations = await this.erasureBlockers(userId);
      if (organizations.length) throw new PrivacyError(409, 'transfer-organization-first', organizations);
      user = await s.auth.beginErasure(userId, expectedPasswordHash);
      if (!user) throw new PrivacyError(401, 'Authentication required');

      // In-flight writes admitted before closure finish before cleanup. New
      // writes cannot obtain a lease once beginErasure has disabled the account.
      const deadline = Date.now() + 4000;
      for (;;) {
        const current = await s.auth.findById(userId, { fresh: true });
        if (!current) throw new PrivacyError(401, 'Authentication required');
        if (!Object.values(current.privacyMutations ?? {}).some(expiresAt => expiresAt > Date.now())) break;
        if (Date.now() >= deadline) throw new PrivacyError(503, 'Account deletion is waiting for an earlier operation. Retry this request shortly.');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      const finalBlockers = await this.erasureBlockers(userId);
      if (finalBlockers.length) {
        await s.auth.cancelErasure(userId, expectedPasswordHash);
        throw new PrivacyError(409, 'transfer-organization-first', finalBlockers);
      }
      await s.auth.markErasureCleaning(userId);

      // The original credential is retained only while pending, to authenticate a
      // narrowly scoped retry. All ordinary API authentication rejects disabled users.
      await ensureSystemAccount(s.auth);
      await this.eraseCourseIdentity(userId, user.displayName);
      await s.instructorProfile.anonymizeForUser(userId);
      await s.organizations.removeForUser(userId, user.email);
      for (const [key, policy] of Object.entries(PERSONAL_DATA_DOMAINS)) {
        if (['auth', 'courses', 'content', 'instructorProfile', 'organizations', 'resetTokens', 'confirmationTokens'].includes(key)) continue;
        const repository = s[key as keyof PrivacyRepositories] as unknown as Record<string, (id: string) => Promise<void>>;
        await repository[policy.erase](userId);
      }
      await s.resetTokens.removeForUser(userId);
      await s.confirmationTokens.removeForUser(userId);
      // Write the idempotent marker before the final credential destruction: a
      // failed audit write must still be resumable through the pending credential.
      await s.audit.recordErasure(userId, user.privacyErasure!.startedAt);
      await s.auth.anonymizeForUser(userId);
    });
  }

  private async eraseCourseIdentity(userId: string, displayName: string): Promise<void> {
    const s = this.stores;
    for (const candidate of await s.courses.listCourses()) {
      await s.content.withCourseMutationLock(candidate.id, async () => {
        const course = (await s.courses.listCourses()).find(item => item.id === candidate.id);
        if (!course) return;
        const ids = course.teacherIds ?? (course.ownerUserId ? [course.ownerUserId] : []);
        const teacherAffected = ids.includes(userId) || course.ownerUserId === userId;
        const remaining = ids.filter(id => id !== userId);
        const names = (await Promise.all(remaining.filter(id => id !== SYSTEM_ACCOUNT_ID).map(id => s.auth.findById(id))))
          .filter(user => user?.status === 'active').map(user => user!.displayName);
        const teacher = names.join(', ') || 'Former instructor';
        if (teacherAffected) {
          await s.courses.updateCourse(course.id, updateCourseSchema.parse({ ...course, teacher }));
        }
        if (course.reviewerIds?.includes(userId)) await s.courses.updateCourseReviewers(course.id, course.reviewerIds.filter(id => id !== userId));
        const doc = await s.content.getCourseContent(course.id);
        if (doc?.review) {
          const review = structuredClone(doc.review);
          let changed = false;
          for (const snapshot of [review.live, review.working]) {
            if (snapshot && (teacherAffected || snapshot.metadata.teacher === displayName)) { snapshot.metadata.teacher = teacher; changed = true; }
          }
          for (const event of review.history) {
            if (event.actorId === userId && event.actorName !== 'Deleted user') { event.actorName = 'Deleted user'; changed = true; }
          }
          if (changed) { review.version++; await s.content.saveCourseReview(course.id, review); }
        }
        // Keep the ownership marker until every name/snapshot write succeeds so
        // a retry can still discover the course after any partial failure.
        if (teacherAffected) await s.courses.updateCourseTeachers(course.id,
          course.ownerUserId === userId ? [SYSTEM_ACCOUNT_ID, ...remaining.filter(id => id !== SYSTEM_ACCOUNT_ID)] : remaining.length ? remaining : [SYSTEM_ACCOUNT_ID]);
      });
    }
  }
}

export type PrivacyExport = Awaited<ReturnType<PrivacyService['exportUserData']>>;
