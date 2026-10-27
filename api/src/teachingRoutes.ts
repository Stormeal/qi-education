import type { Express, Request, RequestHandler } from 'express';
import type { AuthenticatedUser } from './auth.js';
import type { AuthRepository } from './authRepository.js';
import { courseTeacherIds } from './course.js';
import type { CourseContentRepository } from './courseContentRepository.js';
import type { CourseRepository } from './courseRepository.js';
import type { FeedbackEntry } from './feedback.js';
import type { FeedbackRepository } from './feedbackRepository.js';
import type { LearningProgressRepository } from './learningProgressRepository.js';

type LessonFeedback = FeedbackEntry & {
  componentId: string;
  lessonFeedbackKind: NonNullable<FeedbackEntry['lessonFeedbackKind']>;
};

export function registerTeachingRoutes(app: Express, dependencies: {
  authenticate: RequestHandler;
  auth: Pick<AuthRepository, 'listUsers'>;
  courses: CourseRepository;
  content: CourseContentRepository;
  progress: LearningProgressRepository;
  feedback: Pick<FeedbackRepository, 'listFeedback'>;
}): void {
  const path = '/teaching/courses';
  app.use(path, (_request, response, next) => {
    response.set('Cache-Control', 'private, no-store'); response.vary('Authorization'); next();
  });
  app.get(path, dependencies.authenticate, async (request, response) => {
    const { user } = request as Request & { user: AuthenticatedUser };
    if (user.role !== 'teacher' || user.status !== 'active') {
      response.status(403).json({ message: 'Active teacher access is required.' }); return;
    }
    const assigned = (await dependencies.courses.listCourses())
      .filter(course => courseTeacherIds(course).includes(user.id))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    if (!assigned.length) { response.json({ courses: [] }); return; }
    const [accounts, feedback] = await Promise.all([
      dependencies.auth.listUsers({ fresh: true }), dependencies.feedback.listFeedback(),
    ]);
    const courses = await Promise.all(assigned.map(async course => {
      const enrolled = accounts.filter(account => account.enrolledCourseIds.includes(course.id));
      const [document, progress] = await Promise.all([
        dependencies.content.getCourseContent(course.id),
        dependencies.progress.listForCourse(course.id, enrolled.map(account => account.id)),
      ]);
      const lessons = new Map(document?.sections.flatMap(section => section.components.map(lesson => [lesson.id, lesson.title] as const)) ?? []);
      const byAccount = new Map(progress.map(item => [item.userId, item.completedIds]));
      const completedCounts = enrolled.map(account => new Set((byAccount.get(account.id) ?? []).filter(id => lessons.has(id))).size);
      const items = feedback.filter((entry): entry is LessonFeedback => entry.page === 'lesson' && entry.courseId === course.id
        && !!entry.componentId && !!entry.lessonFeedbackKind);
      return {
        courseId: course.id, title: course.title, status: course.status,
        enrolledLearners: enrolled.length,
        startedLearners: completedCounts.filter(count => count > 0).length,
        completedLearners: completedCounts.filter(count => lessons.size > 0 && count === lessons.size).length,
        averageProgress: !enrolled.length ? null : !lessons.size ? 0
          : Math.round(completedCounts.reduce((sum, count) => sum + count / lessons.size * 100, 0) / enrolled.length),
        feedback: {
          helpful: items.filter(entry => entry.lessonFeedbackKind === 'helpful').length,
          notHelpful: items.filter(entry => entry.lessonFeedbackKind === 'not-helpful').length,
          problems: items.filter(entry => entry.lessonFeedbackKind === 'problem').length,
        },
        recentFeedback: items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5).map(entry => ({
          id: entry.id, componentId: entry.componentId, lessonTitle: lessons.get(entry.componentId) ?? null,
          kind: entry.lessonFeedbackKind, category: entry.problemCategory ?? null,
          message: entry.message ?? '', createdAt: entry.createdAt,
        })),
      };
    }));
    response.json({ courses });
  });
}
