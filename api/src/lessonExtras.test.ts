import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryLessonNotesRepository } from './lessonNotesRepository.js';
import { createCourseSchema } from './course.js';
import { updateCourseContentSchema } from './courseContent.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

describe.each(['', '/api'])('US-L015 learning extras (%s)', prefix => {
  let server: Server, base: string, auth: InMemoryAuthRepository, courses: InMemoryCourseRepository;
  let content: InMemoryCourseContentRepository, student: AuthUser, other: AuthUser, admin: AuthUser, teacher: AuthUser;
  let notes: InMemoryLessonNotesRepository;
  const root = '/courses/course';
  function request(path: string, user: AuthUser | null = student, method = 'GET', body?: unknown) {
    return fetch(base + prefix + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? {
      authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}`,
    } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const add = (body: unknown = { componentId: 'video', text: ' My note ', videoSeconds: 95 }, user = student) =>
    request(`${root}/notes`, user, 'POST', body);
  beforeEach(async () => {
    auth = new InMemoryAuthRepository(); courses = new InMemoryCourseRepository(); content = new InMemoryCourseContentRepository();
    notes = new InMemoryLessonNotesRepository();
    student = (await auth.findByEmail('student@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    other = await auth.createUser({ ...student, id: 'other', email: 'other@example.test' });
    await auth.enrollUserInCourse(student.id, 'course');
    await courses.createCourse(createCourseSchema.parse({ title: 'Extras course', description: 'Isolated course.', teacher: 'Teacher', level: 'Beginner', status: 'published' }),
      { id: 'course', ownerUserId: teacher.id });
    await content.updateCourseContent('course', updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Lessons', components: [
      { id: 'video', type: 'video', title: 'Video' }, { id: 'text', type: 'text', title: 'Text' },
    ] }] }).sections);
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      courseAssetRepository: new InMemoryCourseAssetRepository(), feedbackRepository: new InMemoryFeedbackRepository(), lessonNotesRepository: notes,
      muxVideoService: null, muxWebhookService: null,
      gitHubFeedbackService: { createIssueFromFeedback: async () => { throw new Error('No GitHub calls'); } },
    }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { vi.restoreAllMocks(); await new Promise<void>(resolve => server.close(() => resolve())); });

  it('AC01 keeps trimmed video notes private, ordered, and without account identifiers', async () => {
    const created = await add(); expect(created.status).toBe(201);
    const { note } = await created.json();
    expect(note).toEqual({ id: expect.any(String), courseId: 'course', componentId: 'video', text: 'My note', videoSeconds: 95,
      createdAt: expect.any(String), updatedAt: expect.any(String) });
    expect(new Date(note.createdAt).toISOString()).toBe(note.createdAt);
    const second = await (await add({ componentId: 'text', text: 'Second', videoSeconds: null })).json();
    const listed = await request(`${root}/notes`);
    expect(listed.headers.get('cache-control')).toContain('no-store');
    expect(await listed.json()).toEqual({ notes: [note, second.note] });
    await auth.enrollUserInCourse(other.id, 'course');
    for (const user of [other, admin]) expect(await (await request(`${root}/notes`, user)).json()).toEqual({ notes: [] });
  });

  it('AC02 edits/deletes only own notes and hides wrong account, course and missing IDs alike', async () => {
    const { note } = await (await add()).json();
    await auth.enrollUserInCourse(other.id, 'course');
    for (const user of [other, admin]) {
      for (const method of ['PATCH', 'DELETE']) {
        const denied = await request(`${root}/notes/${note.id}`, user, method, method === 'PATCH' ? { text: 'Stolen' } : undefined);
        expect(denied.status).toBe(404); expect(await denied.json()).toEqual({ message: 'Note not found' });
      }
    }
    expect((await request(`${root}/notes/missing`, student, 'PATCH', { text: 'New' })).status).toBe(404);
    const edited = await request(`${root}/notes/${note.id}`, student, 'PATCH', { text: ' Revised ' });
    expect(edited.status).toBe(200);
    expect((await edited.json()).note).toEqual({ ...note, text: 'Revised', updatedAt: expect.any(String) });
    const removed = await request(`${root}/notes/${note.id}`, student, 'DELETE');
    expect(removed.status).toBe(204); expect(await removed.text()).toBe('');
    expect((await request(`${root}/notes/${note.id}`, student, 'DELETE')).status).toBe(404);
    expect(await (await request(`${root}/notes`)).json()).toEqual({ notes: [] });
  });

  it('AC03 denies unsigned/unenrolled calls, allows authors, and validates every note field', async () => {
    expect((await request(`${root}/notes`, null)).status).toBe(401);
    expect((await request(`${root}/notes`, null, 'POST', {})).status).toBe(401);
    expect((await request(`${root}/notes`, other)).status).toBe(403);
    expect((await add(undefined, other)).status).toBe(403);
    expect((await add(undefined, teacher)).status).toBe(201);
    expect((await request('/courses/missing/notes')).status).toBe(404);
    for (const body of [
      { componentId: 'missing', text: 'Note', videoSeconds: null }, { componentId: 's', text: 'Note', videoSeconds: null },
      { componentId: '', text: 'Note', videoSeconds: null }, { componentId: 'x'.repeat(121), text: 'Note', videoSeconds: null },
      { componentId: 'video', text: '  ', videoSeconds: null }, { componentId: 'video', text: 'x'.repeat(2001), videoSeconds: null },
      ...[-1, 86401, 0.5, '95', undefined].map(videoSeconds => ({ componentId: 'video', text: 'Note', videoSeconds })),
    ]) expect((await add(body)).status).toBe(400);
    const { note } = await (await add({ componentId: 'text', text: 'x'.repeat(2000), videoSeconds: 86400 })).json();
    expect((await request(`${root}/notes/${note.id}`, student, 'PATCH', { text: '  ' })).status).toBe(400);
    expect((await request(`${root}/notes/${note.id}`, other, 'DELETE')).status).toBe(403);
  });

  it('AC03 enforces the 500 limit without the course lock and does not acknowledge failed writes', async () => {
    await Promise.all(Array.from({ length: 499 }, () => notes.add(student.id, 'course', { componentId: 'video', text: 'Note', videoSeconds: null })));
    const lock = vi.spyOn(content, 'withCourseMutationLock');
    expect((await Promise.all([add(), add(), add()])).map(response => response.status).sort()).toEqual([201, 400, 400]);
    expect(lock).not.toHaveBeenCalled();
    expect((await notes.list(student.id, 'course'))).toHaveLength(500);
    vi.spyOn(notes, 'add').mockRejectedValueOnce(new Error('Isolated failure'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await add()).status).toBe(500);
  });
});
