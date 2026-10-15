import type { AddressInfo } from 'node:net';
import { createSessionToken, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryLessonNotesRepository } from './lessonNotesRepository.js';
import { InMemoryLessonVotesRepository } from './lessonVotesRepository.js';
import { createCourseSchema } from './course.js';
import { updateCourseContentSchema } from './courseContent.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

export async function learningFixture(prefix = '') {
  const auth = new InMemoryAuthRepository(), courses = new InMemoryCourseRepository();
  const content = new InMemoryCourseContentRepository(), feedback = new InMemoryFeedbackRepository();
  const notes = new InMemoryLessonNotesRepository(), votes = new InMemoryLessonVotesRepository();
  const teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
  const admin = (await auth.findByEmail('admin@qi-education.local'))!;
  const student = (await auth.findByEmail('student@qi-education.local'))!;
  const other = await auth.createUser({ ...student, id: 'other', email: 'other@example.test' });
  await auth.enrollUserInCourse(student.id, 'course');
  await courses.createCourse(createCourseSchema.parse({ title: 'Learning course', description: 'Isolated learning course.',
    teacher: 'Teacher', level: 'Beginner', status: 'published' }), { id: 'course', ownerUserId: teacher.id, createdAt: '2026-10-15T00:00:00Z' });
  await content.updateCourseContent('course', updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Lessons', components: [
    { id: 'video', title: 'Video', type: 'video' }, { id: 'text', title: 'Text', type: 'text', content: 'Instructions' },
  ] }] }).sections);
  const server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
    courseAssetRepository: new InMemoryCourseAssetRepository(), feedbackRepository: feedback,
    lessonNotesRepository: notes, lessonVotesRepository: votes,
    muxVideoService: null, muxWebhookService: null,
    gitHubFeedbackService: { createIssueFromFeedback: async () => { throw new Error('No external calls'); } },
  }).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, user: AuthUser | null = student, method = 'GET', body?: unknown) =>
    fetch(base + prefix + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? {
      Authorization: `Bearer ${createSessionToken(user, apiConfig.AUTH_TOKEN_SECRET!)}`,
    } : {}) }, ...(body === undefined || method === 'GET' ? {} : { body: JSON.stringify(body) }) });
  return { auth, courses, content, feedback, teacher, admin, student, other, request, base,
    close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}
