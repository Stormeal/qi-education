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
import { freshAuthoringFetch } from './authoringTestRequest.js';

describe.each(['', '/api'])('US-L015 learning extras (%s)', prefix => {
  let server: Server, base: string, auth: InMemoryAuthRepository, courses: InMemoryCourseRepository;
  let content: InMemoryCourseContentRepository, student: AuthUser, other: AuthUser, admin: AuthUser, teacher: AuthUser;
  let notes: InMemoryLessonNotesRepository;
  const root = '/courses/course';
  function request(path: string, user: AuthUser | null = student, method = 'GET', body?: unknown) {
    return freshAuthoringFetch(base + prefix + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? {
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

  it('AC04 sends lesson tags and ratings to admin triage, retaining site feedback compatibility', async () => {
    for (const [kind, category, rating] of [
      ['problem', 'video', 'needs-work'], ['helpful', undefined, 'great'], ['not-helpful', undefined, 'needs-work'],
    ]) {
      const sent = await request(`${root}/lesson-feedback`, student, 'POST', { componentId: 'video', kind, category, message: ' Test ' });
      expect(sent.status).toBe(201); expect(await sent.json()).toEqual({ id: expect.any(String) });
      const entries = await (await request('/feedback', admin)).json();
      expect(entries[0]).toMatchObject({ courseId: 'course', componentId: 'video', lessonFeedbackKind: kind,
        page: 'lesson', rating, message: 'Test', userId: student.id });
      expect(entries[0].problemCategory).toBe(category);
    }
    expect((await request('/feedback')).status).toBe(403);
    expect((await request('/feedback', student, 'POST', { page: 'home', rating: 'okay', message: 'Site feedback', courseId: 'ignored' })).status).toBe(201);
    const site = (await (await request('/feedback', admin)).json())[0];
    expect(site.page).toBe('home'); expect(site.courseId).toBeUndefined();
  });

  it('AC05 validates kind/category combinations and lesson access without writing invalid feedback', async () => {
    const body = { componentId: 'text', kind: 'problem' };
    for (const input of [body, { ...body, category: 'bogus' }, { ...body, kind: 'helpful', category: 'video' },
      { ...body, kind: 'not-helpful', category: 'files' }, { ...body, kind: 'unknown' },
      { ...body, componentId: 'missing', category: 'video' }, { ...body, componentId: 's', category: 'video' },
      { ...body, componentId: '', category: 'video' }, { ...body, componentId: 'x'.repeat(121), category: 'video' },
      { ...body, category: 'video', message: 'x'.repeat(2001) }]) {
      expect((await request(`${root}/lesson-feedback`, student, 'POST', input)).status).toBe(400);
    }
    expect(await (await request('/feedback', admin)).json()).toEqual([]);
    expect((await request(`${root}/lesson-feedback`, null, 'POST', { ...body, category: 'video' })).status).toBe(401);
    expect((await request(`${root}/lesson-feedback`, other, 'POST', { ...body, category: 'video' })).status).toBe(403);
    for (const category of ['video', 'content-error', 'unclear', 'files', 'other']) {
      expect((await request(`${root}/lesson-feedback`, teacher, 'POST', { ...body, category })).status).toBe(201);
    }
    expect((await (await request('/feedback', admin)).json())[0].message).toBe('');
  });

  it('AC06 counts enrolled accounts for any signed-in viewer, with status and missing-course access rules', async () => {
    await auth.enrollUserInCourse(other.id, 'course');
    await auth.enrollUserInCourse(teacher.id, 'course');
    await auth.enrollUserInCourse(student.id, 'course'); // duplicate enrollment still counts once
    expect(await (await request(`${root}/learners/count`, admin)).json()).toEqual({ enrolledLearners: 3 });
    const outsider = await auth.createUser({ ...student, id: 'outsider', email: 'outsider@example.test', enrolledCourseIds: [] });
    expect(await (await request(`${root}/learners/count`, outsider)).json()).toEqual({ enrolledLearners: 3 });
    expect((await request(`${root}/learners/count`, null)).status).toBe(401);
    expect((await request('/courses/missing/learners/count')).status).toBe(404);
    const course = (await courses.listCourses()).find(item => item.id === 'course')!;
    for (const status of ['draft', 'ready-for-review', 'archived'] as const) {
      await courses.updateCourse('course', { ...course, status });
      expect((await request(`${root}/learners/count`)).status).toBe(403);
      expect((await request(`${root}/learners/count`, other)).status).toBe(403);
      expect(await (await request(`${root}/learners/count`, teacher)).json()).toEqual({ enrolledLearners: 3 });
      expect((await request(`${root}/learners/count`, admin)).status).toBe(200);
    }
  });

  it('AC07 saves, uploads starter files, reviews, publishes, outlines and completes an exercise', async () => {
    const created = await request('/courses', teacher, 'POST', { title: 'Practice course', description: 'Practise with an exercise.', teacher: 'Teacher', level: 'Beginner' });
    expect(created.status).toBe(201);
    const id = (await created.json()).id;
    const path = `/courses/${id}`;
    const sections = [{ id: 'practice', title: 'Practice', components: [{ id: 'exercise', type: 'exercise', title: 'Try it', content: '<p>Follow these steps</p>', resourceUrl: 'https://example.test/starter' }] }];
    const saved = await request(`${path}/content`, teacher, 'PATCH', { sections });
    expect(saved.status).toBe(200);
    const upload = (type: string, fileName = 'starter.zip') => fetch(`${base}${prefix}${path}/content/components/exercise/attachments`, {
      method: 'PUT', headers: { 'Content-Type': type, 'X-Section-Id': 'practice', 'X-File-Name': fileName,
        authorization: `Bearer ${createSessionToken(toAuthenticatedUser(teacher), apiConfig.AUTH_TOKEN_SECRET!)}` }, body: Buffer.from('starter') });
    for (const [type, name] of [['application/zip', 'starter.zip'], ['application/pdf', 'instructions.pdf'],
      ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'starter.docx'],
      ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'slides.pptx'], ['image/png', 'diagram.png']]) {
      expect((await upload(type, name)).status).toBe(201);
    }
    expect((await upload('application/x-msdownload')).status).toBe(415);
    const author = await (await request(`${path}/content?view=author`, teacher)).json();
    expect(author.sections[0].components[0]).toMatchObject({ ...sections[0].components[0], attachments: expect.any(Array) });
    expect(author.sections[0].components[0].attachments).toHaveLength(5);
    // Save the file references back through the content schema as the builder does.
    expect((await request(`${path}/content`, teacher, 'PATCH', { sections: author.sections })).status).toBe(200);
    for (const [action, actor] of [['submit', teacher], ['publish', admin]] as const) {
      const { review } = await (await request(`${path}/content?view=author`, actor)).json();
      expect((await request(`${path}/review`, actor, 'POST', { action, expectedVersion: review.version, revisionId: review.revisionId, reason: '' })).status).toBe(200);
    }
    await auth.enrollUserInCourse(student.id, id);
    const learner = await (await request(`${path}/content`)).json();
    expect(learner.sections[0].components[0]).toMatchObject({ type: 'exercise', content: '<p>Follow these steps</p>', attachments: expect.any(Array) });
    const outline = await (await request(`${path}/outline`, null)).json();
    expect(outline.sections[0].components[0].type).toBe('exercise');
    expect(outline.sections[0].components[0].content).toBeUndefined();
    const completed = await request(`/users/me/learning-progress/${id}/lessons/exercise`, student, 'PUT');
    expect(completed.status).toBe(200);
    expect(await completed.json()).toEqual({ courseId: id, completedIds: ['exercise'] });
    const assetId = learner.sections[0].components[0].attachments[0].assetId;
    expect((await request(`${path}/content/attachments/${assetId}`)).status).toBe(200);
  });
});
