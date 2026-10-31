import { hashPassword, toAuthenticatedUser } from '../src/auth.js';
import { InMemoryAuthRepository } from '../src/authRepository.js';
import { InMemoryAccountProfileRepository } from '../src/accountProfileRepository.js';
import { InMemoryInstructorProfileRepository } from '../src/instructorProfileRepository.js';
import { InMemoryLearningProgressRepository } from '../src/learningProgressRepository.js';
import { InMemoryLessonNotesRepository } from '../src/lessonNotesRepository.js';
import { InMemoryAccountCareersRepository } from '../src/accountCareersRepository.js';
import { InMemoryCareerPathRepository } from '../src/careerPathRepository.js';
import { InMemoryPaymentRepository } from '../src/paymentRepository.js';
import { InMemoryOrganizationRepository } from '../src/organizationRepository.js';
import { InMemoryFeedbackRepository } from '../src/feedbackRepository.js';
import { InMemoryNotificationRepository } from '../src/notificationRepository.js';
import { InMemoryPasswordResetRepository } from '../src/passwordResetRepository.js';
import { InMemoryEmailConfirmationRepository } from '../src/emailConfirmationRepository.js';
import { InMemoryUserChangeRepository } from '../src/userChangeRepository.js';
import { InMemoryCourseRepository } from '../src/courseRepository.js';
import { InMemoryCourseContentRepository } from '../src/courseContentRepository.js';
import { createCourseSchema } from '../src/course.js';
import { PrivacyService } from '../src/privacyService.js';

export async function privacyFixture() {
  const auth = new InMemoryAuthRepository();
  const passwordHash = hashPassword('Password123!');
  const user = await auth.createUser({ id: 'privacy-ada', email: 'ada@example.test', displayName: 'Ada Private',
    role: 'teacher', status: 'active', createdAt: '2026-10-31T12:00:00.000Z', passwordHash, enrolledCourseIds: ['retained-course'] });
  const other = await auth.createUser({ ...user, id: 'privacy-bob', email: 'bob@example.test', displayName: 'Bob Secret' });
  const stores = { auth, profile: new InMemoryAccountProfileRepository(), instructorProfile: new InMemoryInstructorProfileRepository(),
    progress: new InMemoryLearningProgressRepository(), notes: new InMemoryLessonNotesRepository(), careers: new InMemoryAccountCareersRepository(),
    legacyCareers: new InMemoryCareerPathRepository(), payments: new InMemoryPaymentRepository(), organizations: new InMemoryOrganizationRepository(),
    feedback: new InMemoryFeedbackRepository(), notifications: new InMemoryNotificationRepository(), resetTokens: new InMemoryPasswordResetRepository(),
    confirmationTokens: new InMemoryEmailConfirmationRepository(), audit: new InMemoryUserChangeRepository(),
    courses: new InMemoryCourseRepository(), content: new InMemoryCourseContentRepository() };
  const service = new PrivacyService(stores);
  return { stores, service, user, other, passwordHash };
}

