import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import { z } from 'zod';
import type { CourseRepository } from './courseRepository.js';
import type { CourseContentRepository } from './courseContentRepository.js';
import type { LessonNote, LessonNotesRepository } from './lessonNotesRepository.js';
import { learningContent, learningHandler, LearningRouteError, learningUser, privateLearningResponse, type LearningHandler } from './learningAccess.js';

const bodySchema = z.object({ body: z.string().trim().min(1).max(2000) });
const createSchema = bodySchema.extend({ componentId: z.string().trim().min(1).max(120), videoSeconds: z.number().int().nonnegative().optional() });
const dto = (note: LessonNote): LessonNote => ({ id: note.id, courseId: note.courseId, componentId: note.componentId,
  body: note.body, videoSeconds: note.videoSeconds, createdAt: note.createdAt, updatedAt: note.updatedAt });

export function registerLessonNotesRoutes(app: Express, dependencies: {
  authenticate: RequestHandler; read: (handler: LearningHandler) => RequestHandler;
  courses: CourseRepository; content: CourseContentRepository; notes: LessonNotesRepository;
}): void {
  const { authenticate, courses, content, notes } = dependencies;
  const root = '/users/me/courses/:courseId/notes', item = '/users/me/notes/:noteId';
  app.use([root, '/users/me/notes'], privateLearningResponse);
  const handle = (handler: LearningHandler) => learningHandler(dependencies.read, handler);
  const document = (id: string, request: Parameters<LearningHandler>[0]) => learningContent(id, learningUser(request), courses, content);
  app.get(root, authenticate, handle(async (request, response) => {
    const courseId = String(request.params.courseId), current = await document(courseId, request);
    const ids = new Set(current.sections.flatMap(section => section.components.map(component => component.id)));
    response.json({ notes: (await notes.list(learningUser(request).id, courseId)).filter(note => ids.has(note.componentId)).map(dto) });
  }));
  app.post(root, authenticate, handle(async (request, response) => {
    const courseId = String(request.params.courseId), userId = learningUser(request).id;
    // Reuse the durable course lock so simultaneous workers cannot exceed the note cap.
    // Authorization precedes the lock: unknown course IDs never create lock records.
    await document(courseId, request);
    const input = createSchema.parse(request.body);
    const saved = await content.withCourseMutationLock(courseId, async () => {
      const current = await document(courseId, request);
      const lesson = current.sections.flatMap(section => section.components).find(component => component.id === input.componentId);
      if (!lesson) throw new LearningRouteError(400, 'Lesson not found');
      if (input.videoSeconds !== undefined && lesson.type !== 'video') throw new LearningRouteError(400, 'Video time requires a video lesson.');
      if ((await notes.list(userId, courseId)).length >= 500) throw new LearningRouteError(400, 'You can save at most 500 notes per course.');
      const now = new Date().toISOString();
      const note: LessonNote = { id: randomUUID(), courseId, componentId: input.componentId, body: input.body,
        videoSeconds: input.videoSeconds ?? null, createdAt: now, updatedAt: now };
      await notes.create(userId, note); return note;
    });
    response.status(201).json(saved);
  }));
  app.patch(item, authenticate, handle(async (request, response) => {
    const userId = learningUser(request).id, note = await notes.get(userId, String(request.params.noteId));
    if (!note) throw new LearningRouteError(404, 'Note not found');
    const current = await document(note.courseId, request);
    if (!current.sections.some(section => section.components.some(component => component.id === note.componentId))) throw new LearningRouteError(400, 'Lesson not found');
    const input = bodySchema.parse(request.body);
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(note.updatedAt) + 1)).toISOString();
    const saved = await notes.update(userId, note.id, input.body, updatedAt);
    if (!saved) throw new LearningRouteError(404, 'Note not found');
    response.json(dto(saved));
  }));
  app.delete(item, authenticate, handle(async (request, response) => {
    const userId = learningUser(request).id, note = await notes.get(userId, String(request.params.noteId));
    if (!note) throw new LearningRouteError(404, 'Note not found');
    await document(note.courseId, request);
    if (!await notes.delete(userId, note.id)) throw new LearningRouteError(404, 'Note not found');
    response.status(204).end();
  }));
}
