import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthenticatedUser, AuthUser } from './auth.js';
import { canAuthorCourse, canLearnCourse } from './courseAccess.js';
import type { CourseRepository } from './courseRepository.js';
import type { CourseContentRepository } from './courseContentRepository.js';
import { createLessonNoteSchema, updateLessonNoteSchema, LessonNoteLimitError } from './lessonNotes.js';
import type { LessonNotesRepository } from './lessonNotesRepository.js';
import { createLessonFeedbackSchema } from './feedback.js';
import type { FeedbackRepository } from './feedbackRepository.js';

type Handler = (request: Request, response: Response, next: NextFunction) => Promise<unknown>;
const user = (request: Request) => (request as Request & { user: AuthenticatedUser }).user;
class ExtrasError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export function registerLessonExtrasRoutes(app: Express, dependencies: {
  authenticate: RequestHandler;
  authenticateWithUsers: RequestHandler;
  read: (handler: Handler) => RequestHandler;
  courses: CourseRepository;
  content: CourseContentRepository;
  notes: LessonNotesRepository;
  feedback: FeedbackRepository;
}): void {
  const { courses, content, notes } = dependencies;
  const root = '/courses/:courseId';
  const handle = (handler: Handler) => dependencies.read(async (request, response, next) => {
    response.set('Cache-Control', 'private, no-store'); response.vary('Authorization');
    try { await handler(request, response, next); }
    catch (error) {
      if (error instanceof ExtrasError) response.status(error.status).json({ message: error.message });
      else if (error instanceof LessonNoteLimitError) response.status(400).json({ message: error.message });
      else next(error);
    }
  });
  async function entitled(request: Request): Promise<string> {
    const courseId = String(request.params.courseId);
    const course = (await courses.listCourses()).find(course => course.id === courseId);
    if (!course) throw new ExtrasError(404, 'Course not found');
    if (!canLearnCourse(course, user(request))) throw new ExtrasError(403, 'You do not have access to this course content.');
    return courseId;
  }
  async function requireLesson(courseId: string, componentId: string): Promise<void> {
    const document = await content.getCourseContent(courseId);
    if (!document?.sections.some(section => section.components.some(component => component.id === componentId))) {
      throw new ExtrasError(400, 'Lesson not found in this course.');
    }
  }
  app.get(`${root}/notes`, dependencies.authenticate, handle(async (request, response) => {
    const courseId = await entitled(request);
    response.json({ notes: await notes.list(user(request).id, courseId) });
  }));
  app.post(`${root}/notes`, dependencies.authenticate, handle(async (request, response) => {
    const courseId = await entitled(request);
    const input = createLessonNoteSchema.parse(request.body);
    await requireLesson(courseId, input.componentId);
    response.status(201).json({ note: await notes.add(user(request).id, courseId, input) });
  }));
  app.patch(`${root}/notes/:noteId`, dependencies.authenticate, handle(async (request, response) => {
    const courseId = await entitled(request);
    const { text } = updateLessonNoteSchema.parse(request.body);
    const note = await notes.update(user(request).id, courseId, String(request.params.noteId), text);
    if (!note) throw new ExtrasError(404, 'Note not found');
    response.json({ note });
  }));
  app.delete(`${root}/notes/:noteId`, dependencies.authenticate, handle(async (request, response) => {
    const courseId = await entitled(request);
    if (!await notes.delete(user(request).id, courseId, String(request.params.noteId))) throw new ExtrasError(404, 'Note not found');
    response.status(204).end();
  }));
  app.post(`${root}/lesson-feedback`, dependencies.authenticate, handle(async (request, response) => {
    const courseId = await entitled(request);
    const input = createLessonFeedbackSchema.parse(request.body);
    await requireLesson(courseId, input.componentId);
    const feedback = await dependencies.feedback.createFeedback({ page: 'lesson',
      rating: input.kind === 'helpful' ? 'great' : 'needs-work', message: input.message,
      courseId, componentId: input.componentId, lessonFeedbackKind: input.kind, problemCategory: input.category,
    }, user(request));
    response.status(201).json({ id: feedback.id });
  }));
  app.get(`${root}/learners/count`, dependencies.authenticateWithUsers, handle(async (request, response) => {
    const courseId = String(request.params.courseId);
    const course = (await courses.listCourses()).find(course => course.id === courseId);
    if (!course) throw new ExtrasError(404, 'Course not found');
    if (course.status !== 'published' && !canAuthorCourse(course, user(request))) throw new ExtrasError(403, 'You do not have access to this course.');
    const { users } = request as Request & { users: AuthUser[] };
    response.json({ enrolledLearners: users.filter(user => user.enrolledCourseIds.includes(courseId)).length });
  }));
}
