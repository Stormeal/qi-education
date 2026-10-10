import { createHash } from 'node:crypto';
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthenticatedUser } from './auth.js';
import { canLearnCourse } from './courseAccess.js';
import { updateCourseContentSchema, type CourseContentComponent } from './courseContent.js';
import type { CourseContentDocument, CourseContentRepository } from './courseContentRepository.js';
import type { CourseRepository } from './courseRepository.js';
import type { LearningProgressRepository } from './learningProgressRepository.js';
import { assessmentIssues, quizAttemptSchema, scoreQuiz } from './quizAssessment.js';

type Handler = (request: Request, response: Response, next: NextFunction) => Promise<unknown>;
const user = (request: Request) => (request as Request & { user: AuthenticatedUser }).user;
const fingerprint = (component: Extract<CourseContentComponent, { type: 'quiz' }>) =>
  createHash('sha256').update(JSON.stringify([component.id, component.quiz])).digest('hex');
class ProgressError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function registerLearningProgressRoutes(app: Express, dependencies: {
  authenticate: RequestHandler;
  read: (handler: Handler) => RequestHandler;
  courses: CourseRepository;
  content: CourseContentRepository;
  progress: LearningProgressRepository;
}): void {
  const { courses, content, progress } = dependencies;
  const root = '/users/me/learning-progress';
  app.use(root, (_request, response, next) => {
    response.set('Cache-Control', 'private, no-store'); response.vary('Authorization'); next();
  });
  const handle = (handler: Handler) => dependencies.read(async (request, response, next) => {
    try { await handler(request, response, next); }
    catch (error) {
      if (error instanceof ProgressError) response.status(error.status).json({ message: error.message });
      else next(error);
    }
  });
  async function entitledContent(request: Request): Promise<CourseContentDocument> {
    const courseId = String(request.params.courseId);
    const course = (await courses.listCourses()).find(item => item.id === courseId);
    if (!course) throw new ProgressError(404, 'Course not found');
    if (!canLearnCourse(course, user(request))) throw new ProgressError(403, 'You do not have access to this course.');
    const document = await content.getCourseContent(courseId);
    if (!document) throw new ProgressError(404, 'Course content not found');
    return document;
  }
  const currentIds = (document: CourseContentDocument) => new Set(document.sections.flatMap(section => section.components.map(component => component.id)));

  app.get(root, dependencies.authenticate, handle(async (request, response) => {
    const account = user(request);
    const entitled = new Set((await courses.listCourses()).filter(course => canLearnCourse(course, account)).map(course => course.id));
    const values = await Promise.all((await progress.list(account.id)).filter(item => entitled.has(item.courseId) && item.completedIds.length)
      .map(async item => {
        const document = await content.getCourseContent(item.courseId);
        const ids = document ? currentIds(document) : new Set<string>();
        return { courseId: item.courseId, completedIds: item.completedIds.filter(id => ids.has(id)) };
      }));
    response.json({ progress: values.filter(item => item.completedIds.length) });
  }));

  app.put(`${root}/:courseId/lessons/:componentId`, dependencies.authenticate, handle(async (request, response) => {
    const document = await entitledContent(request);
    const component = document.sections.flatMap(section => section.components).find(item => item.id === request.params.componentId);
    if (!component) throw new ProgressError(404, 'Lesson not found');
    const account = user(request);
    if (component.type === 'quiz') {
      const passed = (await progress.get(account.id, document._id))?.passedQuizzes ?? [];
      if (!passed.includes(fingerprint(component))) throw new ProgressError(409, 'Pass this quiz on the server before saving its completion.');
    }
    await progress.complete(account.id, document._id, component.id);
    const saved = await progress.get(account.id, document._id);
    const ids = currentIds(document);
    response.json({ courseId: document._id, completedIds: (saved?.completedIds ?? []).filter(id => ids.has(id)) });
  }));

  app.post(`${root}/:courseId/components/:componentId/quiz-attempts`, dependencies.authenticate, handle(async (request, response) => {
    const document = await entitledContent(request);
    const input = quizAttemptSchema.parse(request.body);
    const parsed = updateCourseContentSchema.safeParse(document);
    if (!parsed.success) throw new ProgressError(409, 'This assessment needs correction by its author.');
    const section = parsed.data.sections.find(item => item.id === input.sectionId);
    const component = section?.components.find(item => item.id === request.params.componentId);
    if (!component || component.type !== 'quiz') throw new ProgressError(404, 'Quiz not found');
    if (assessmentIssues([{ ...section!, components: [component] }], true).length) {
      throw new ProgressError(409, 'This assessment needs correction by its author.');
    }
    const result = scoreQuiz(component, input.answers);
    if (!result) throw new ProgressError(400, 'Select valid answer IDs once per question.');
    if (result.passed) await progress.recordPass(user(request).id, document._id, fingerprint(component));
    response.json(result);
  }));
}
