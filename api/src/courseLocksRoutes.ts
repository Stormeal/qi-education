import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import type { CourseContentRepository } from './courseContentRepository.js';
import type { CourseRepository } from './courseRepository.js';

const unavailable = { message: 'Course locks are temporarily unavailable. Please try again later.' };

export function registerCourseLocksRoutes(app: Express, dependencies: {
  authenticate: RequestHandler; requireAdmin: RequestHandler;
  content: CourseContentRepository; courses: CourseRepository;
}): void {
  const path = '/admin/course-locks';
  app.get(path, dependencies.authenticate, dependencies.requireAdmin, async (_request, response) => {
    try {
      const locks = await dependencies.content.listCourseMutationLocks();
      const checkedAt = new Date().toISOString();
      const titles = new Map((await dependencies.courses.listCourses()).map(course => [course.id, course.title]));
      response.json({ checkedAt, locks: locks.map(lock => ({
        courseId: lock.courseId, courseTitle: titles.get(lock.courseId) ?? null,
        owner: lock.owner, acquiredAt: lock.acquiredAt, expiresAt: lock.expiresAt, state: lock.state,
      })) });
    } catch { response.status(503).json(unavailable); }
  });
  // Keep authentication-store failures out of the global diagnostic logger too.
  app.use(path, (_error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    response.status(503).json(unavailable);
  });
}
