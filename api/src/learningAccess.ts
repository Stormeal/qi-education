import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import type { AuthenticatedUser } from './auth.js';
import { canLearnCourse } from './courseAccess.js';
import type { CourseRepository } from './courseRepository.js';
import type { CourseContentRepository } from './courseContentRepository.js';

export type LearningHandler = (request: Request, response: Response, next: NextFunction) => Promise<unknown>;
export const learningUser = (request: Request) => (request as Request & { user: AuthenticatedUser }).user;
export class LearningRouteError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export const privateLearningResponse: RequestHandler = (_request, response, next) => {
  response.set('Cache-Control', 'private, no-store'); response.vary('Authorization'); next();
};
export const learningHandler = (read: (handler: LearningHandler) => RequestHandler, handler: LearningHandler) =>
  read(async (request, response, next) => {
    try { await handler(request, response, next); }
    catch (error) {
      if (error instanceof LearningRouteError) response.status(error.status).json({ message: error.message });
      else if (error instanceof ZodError) response.status(400).json({ message: 'Invalid request body' });
      else next(error);
    }
  });
export async function learningContent(courseId: string, user: AuthenticatedUser, courses: CourseRepository, content: CourseContentRepository) {
  const course = (await courses.listCourses()).find(item => item.id === courseId);
  if (!course) throw new LearningRouteError(404, 'Course not found');
  if (!canLearnCourse(course, user)) throw new LearningRouteError(403, 'You do not have access to this course.');
  const document = await content.getCourseContent(courseId);
  if (!document) throw new LearningRouteError(404, 'Course content not found');
  return document;
}
