import type { Express, RequestHandler } from 'express';
import { z } from 'zod';
import type { CourseRepository } from './courseRepository.js';
import type { CourseContentRepository } from './courseContentRepository.js';
import type { LessonVotesRepository } from './lessonVotesRepository.js';
import { learningContent, learningHandler, LearningRouteError, learningUser, privateLearningResponse, type LearningHandler } from './learningAccess.js';

const voteSchema = z.object({ vote: z.enum(['up', 'down']).nullable() });
export function registerLessonFeedbackRoutes(app: Express, dependencies: {
  authenticate: RequestHandler; read: (handler: LearningHandler) => RequestHandler;
  courses: CourseRepository; content: CourseContentRepository; votes: LessonVotesRepository;
}): void {
  const { authenticate, courses, content, votes } = dependencies;
  const root = '/users/me/courses/:courseId', list = `${root}/lesson-votes`, item = `${root}/lessons/:componentId/vote`;
  app.use([list, item], privateLearningResponse);
  const handle = (handler: LearningHandler) => learningHandler(dependencies.read, handler);
  app.get(list, authenticate, handle(async (request, response) => {
    const courseId = String(request.params.courseId), user = learningUser(request);
    const document = await learningContent(courseId, user, courses, content);
    const ids = new Set(document.sections.flatMap(section => section.components.map(component => component.id)));
    response.json({ votes: (await votes.list(user.id, courseId)).filter(vote => ids.has(vote.componentId)) });
  }));
  app.put(item, authenticate, handle(async (request, response) => {
    const courseId = String(request.params.courseId), componentId = String(request.params.componentId), user = learningUser(request);
    const document = await learningContent(courseId, user, courses, content);
    const { vote } = voteSchema.parse(request.body);
    if (!document.sections.some(section => section.components.some(component => component.id === componentId))) throw new LearningRouteError(400, 'Lesson not found');
    await votes.set(user.id, courseId, componentId, vote);
    response.json({ componentId, vote });
  }));
}
