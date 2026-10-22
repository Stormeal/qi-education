import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { canAuthorCourse } from './courseAccess.js';
import { freshAuthoringFetch } from './authoringTestRequest.js';
import { createServer } from './server.js';
import { courseTeacherIds, createCourseSchema } from './course.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { ReadOnlyCourseRepository, UnavailableCourseRepository } from './courseStore.js';
import { courseRequestReads, requestCachedCourses } from './courseRequestReads.js';
import { reviewedRepositories } from './courseReview.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';

const metadata = createCourseSchema.parse({ title: 'Course teachers',
  description: 'An isolated course for teacher assignment.', teacher: 'Display name', level: 'Beginner' });

describe('US-A005 teacher storage', () => {
  it('US-A005-AC06 reads an old course as its owner alone and respects an explicit empty list', () => {
    expect(courseTeacherIds({ ownerUserId: 'T' })).toEqual(['T']);
    expect(courseTeacherIds({ ownerUserId: '' })).toEqual([]);
    expect(courseTeacherIds({ ownerUserId: 'T', teacherIds: [] })).toEqual([]);
    expect(courseTeacherIds({ ownerUserId: 'B', teacherIds: ['B', 'A'] })).toEqual(['B', 'A']);
  });

  it('stores a seeded list, replaces it in order and clears the owner mirror with an empty list', async () => {
    const repository = new InMemoryCourseRepository();
    expect(await repository.createCourse(metadata, { id: 'c', createdAt: 'x', ownerUserId: 'ignored', teacherIds: ['A'] }))
      .toMatchObject({ teacherIds: ['A'], ownerUserId: 'A' });
    expect(await repository.updateCourseTeachers('c', ['B', 'A'])).toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B' });
    expect((await repository.listCourses()).find(course => course.id === 'c'))
      .toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B' });
    expect(await repository.updateCourseTeachers('c', [])).toMatchObject({ teacherIds: [], ownerUserId: '' });
    expect(await repository.updateCourseTeachers('missing', [])).toBeNull();
  });

  it('refuses teacher writes through read-only and unavailable stores', async () => {
    await expect(new ReadOnlyCourseRepository(new InMemoryCourseRepository()).updateCourseTeachers('c', []))
      .rejects.toThrow('read-only');
    await expect(new UnavailableCourseRepository().updateCourseTeachers('c', [])).rejects.toThrow('unavailable');
  });

  it('refreshes request reads and keeps assignment outside the review snapshots', async () => {
    const stored = new InMemoryCourseRepository();
    const content = new InMemoryCourseContentRepository();
    await stored.createCourse({ ...metadata, status: 'published' }, { id: 'c', createdAt: 'x', ownerUserId: 'A' });
    const cached = requestCachedCourses(stored);
    const { courses, review } = reviewedRepositories(cached, content, new InMemoryCourseAssetRepository());
    await courseRequestReads.run({ reads: new Map(), reuseRecent: true }, async () => {
      await courses.listCourses();
      expect(await courses.updateCourseTeachers('c', ['B', 'A']))
        .toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B', status: 'published' });
      expect((await courses.listCourses()).find(course => course.id === 'c'))
        .toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B' });
      expect((await review.state('c')).course).toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B' });
      expect(await courses.updateCourseTeachers('missing', [])).toBeNull();
      expect(await content.getCourseContent('c')).toBeNull();
    });
  });
});

describe.each(['', '/api'])('US-A005 course teacher HTTP (%s)', prefix => {
  let server: Server;
  let base: string;
  let auth: InMemoryAuthRepository;
  let courses: InMemoryCourseRepository;
  let content: InMemoryCourseContentRepository;
  let teacherA: AuthUser;
  let teacherB: AuthUser;
  let admin: AuthUser;
  let student: AuthUser;

  beforeEach(async () => {
    auth = new InMemoryAuthRepository();
    courses = new InMemoryCourseRepository();
    content = new InMemoryCourseContentRepository();
    teacherA = (await auth.findByEmail('teacher@qi-education.local'))!;
    teacherB = await auth.createUser({ ...teacherA, id: 'teacher-b', email: 'teacher-b@example.test', displayName: 'Teacher B' });
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    await courses.createCourse(metadata, { id: 'c', createdAt: '2026-10-22T00:00:00Z', teacherIds: [teacherA.id, teacherB.id] });
    server = createServer({ authRepository: auth, courseRepository: courses,
      courseContentRepository: content, courseAssetRepository: new InMemoryCourseAssetRepository(),
      muxVideoService: null, muxWebhookService: null,
    }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${prefix}`;
  });

  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  function headers(user?: AuthUser) {
    return { 'Content-Type': 'application/json', ...(user ? {
      authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}`,
    } : {}) };
  }
  function request(path: string, user?: AuthUser, method = 'GET', body?: unknown) {
    return freshAuthoringFetch(base + path, { method, headers: headers(user),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }

  it('US-A005-AC02 a second assigned teacher saves lessons, uploads a file and submits for review', async () => {
    const saved = await request('/courses/c/content', teacherB, 'PATCH', { sections: [{ id: 's', title: 'Introduction',
      components: [{ id: 'text', title: 'Lesson notes', type: 'text', content: 'Learn practical testing.' }] }] });
    expect(saved.status).toBe(200);
    expect((await content.getCourseContent('c'))?.sections[0].components[0]).toMatchObject({ id: 'text' });
    const uploaded = await fetch(base + '/courses/c/content/components/text/attachments', { method: 'PUT',
      headers: { ...headers(teacherB), 'Content-Type': 'text/plain', 'X-Section-Id': 's', 'X-File-Name': 'notes.txt' }, body: 'Lesson notes' });
    expect(uploaded.status).toBe(201);
    expect((await uploaded.json()).attachment).toMatchObject({ fileName: 'notes.txt' });
    const loaded = await request('/courses/c/content?view=author', teacherB);
    const state = (await loaded.json()).review;
    const submitted = await request('/courses/c/review', teacherB, 'POST', {
      action: 'submit', expectedVersion: state.version, revisionId: state.revisionId,
    });
    expect(submitted.status).toBe(200);
    expect((await submitted.json()).review.course).toMatchObject({ status: 'ready-for-review', teacherIds: [teacherA.id, teacherB.id], ownerUserId: teacherA.id });
    const catalog = await (await request('/courses', teacherB)).json();
    expect(catalog).toContainEqual(expect.objectContaining({ id: 'c', teacherIds: [teacherA.id, teacherB.id] }));
  });

  it('US-A005-AC03 a removed creator cannot reopen or save while the remaining teacher can', async () => {
    const opened = await request('/courses/c/content?view=author', teacherA);
    expect(opened.status).toBe(200);
    await courses.updateCourseTeachers('c', [teacherB.id]);
    expect((await request('/courses/c/content?view=author', teacherA)).status).toBe(403);
    expect((await request('/courses/c/content', teacherA, 'PATCH', { sections: [] })).status).toBe(403);
    expect((await request('/courses/c/content', teacherB, 'PATCH', { sections: [] })).status).toBe(200);
  });

  it('US-A005-AC06 an owner-only legacy course remains authorable by its teacher', async () => {
    await courses.createCourse(metadata, { id: 'legacy', createdAt: 'x', ownerUserId: teacherA.id });
    expect((await request('/courses/legacy/content', teacherA, 'PATCH', { sections: [] })).status).toBe(200);
    expect((await request('/courses/legacy/content', teacherB, 'PATCH', { sections: [] })).status).toBe(403);
  });

  it('US-A005-AC07 disabled and demoted teachers are refused using an existing token', async () => {
    const tokenHeaders = headers(teacherA);
    await auth.updateStatus(teacherA.id, 'disabled');
    expect((await fetch(base + '/courses/c/content?view=author', { headers: tokenHeaders })).status).toBe(401);
    await auth.updateStatus(teacherA.id, 'active');
    await auth.updateRole(teacherA.id, 'student');
    expect((await freshAuthoringFetch(base + '/courses/c/content', {
      method: 'PATCH', headers: tokenHeaders, body: JSON.stringify({ sections: [] }),
    })).status).toBe(403);
    const course = (await courses.listCourses()).find(item => item.id === 'c')!;
    expect(canAuthorCourse(course, toAuthenticatedUser({ ...teacherA, status: 'disabled' }))).toBe(false);
    expect(canAuthorCourse(course, toAuthenticatedUser({ ...teacherB, role: 'student' }))).toBe(false);
  });

  it.each(['teacher', 'admin'] as const)('a %s creator gets the correct teacher list despite forged assignment', async role => {
    const user = role === 'teacher' ? teacherA : admin;
    const teacherIds = role === 'teacher' ? [teacherA.id] : [];
    const created = await request('/courses', user, 'POST', { ...metadata, ownerUserId: teacherB.id, teacherIds: [teacherB.id] });
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body).toMatchObject({ teacherIds, ownerUserId: teacherIds[0] ?? '' });
    expect(body.review.course).toMatchObject({ teacherIds, ownerUserId: teacherIds[0] ?? '' });
    expect((await courses.listCourses()).find(course => course.id === body.id))
      .toMatchObject({ teacherIds, ownerUserId: teacherIds[0] ?? '' });
  });

  function teacherView(user: AuthUser, active = true) {
    return { id: user.id, displayName: user.displayName, email: user.email, active };
  }
  async function storedCourse() { return (await courses.listCourses()).find(course => course.id === 'c')!; }

  it('US-A005-AC05 Round 2 removes deleted and demoted teachers one at a time', async () => {
    const deletedId = 'deleted-teacher-a';
    await courses.updateCourseTeachers('c', [deletedId, teacherB.id, teacherA.id]);
    await auth.updateRole(teacherB.id, 'student');
    const removedDeleted = await request('/courses/c/teachers', admin, 'PUT', { teacherIds: [teacherB.id, teacherA.id] });
    expect(removedDeleted.status).toBe(200);
    expect(await removedDeleted.json()).toEqual({ teachers: [teacherView(teacherB, false), teacherView(teacherA)] });
    expect(await storedCourse()).toMatchObject({ teacherIds: [teacherB.id, teacherA.id], ownerUserId: teacherB.id });
    const removedDemoted = await request('/courses/c/teachers', admin, 'PUT', { teacherIds: [teacherA.id] });
    expect(removedDemoted.status).toBe(200);
    expect(await removedDemoted.json()).toEqual({ teachers: [teacherView(teacherA)] });
    expect(await storedCourse()).toMatchObject({ teacherIds: [teacherA.id], ownerUserId: teacherA.id });
  });

  it('US-A005-AC05 Round 2 adds a teacher while retaining a legacy admin owner as inactive', async () => {
    await courses.createCourse(metadata, { id: 'legacy-round-2', createdAt: 'x', ownerUserId: admin.id });
    const response = await request('/courses/legacy-round-2/teachers', admin, 'PUT', { teacherIds: [admin.id, teacherA.id] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ teachers: [teacherView(admin, false), teacherView(teacherA)] });
    expect((await courses.listCourses()).find(course => course.id === 'legacy-round-2'))
      .toMatchObject({ teacherIds: [admin.id, teacherA.id], ownerUserId: admin.id });
  });

  it('US-A005-AC05 Round 2 still refuses a newly added student without changing the list', async () => {
    const before = await storedCourse();
    const response = await request('/courses/c/teachers', admin, 'PUT', { teacherIds: [teacherA.id, teacherB.id, student.id] });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: `${student.id} is not a teacher account.` });
    expect(await storedCourse()).toEqual(before);
  });

  it('US-A005-AC05 Round 2 checks shape and duplicates before course existence, then existence before new accounts', async () => {
    for (const [body, message] of [
      [{ teacherIds: null }, 'Teachers must be a list of at most 20 account ids.'],
      [{ teacherIds: [student.id, student.id] }, 'Each teacher can be listed once.'],
    ] as const) {
      const response = await request('/courses/missing/teachers', admin, 'PUT', body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ message });
    }
    for (const teacherIds of [[teacherA.id], [student.id], ['unknown-teacher']]) {
      const response = await request('/courses/missing/teachers', admin, 'PUT', { teacherIds });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ message: 'Course not found' });
    }
  });

  it('US-A005-AC01 an admin replaces the list and reads names and email in stored order', async () => {
    const before = await content.getCourseContent('c');
    const expected = { teachers: [teacherView(teacherB), teacherView(teacherA)] };
    const replaced = await request('/courses/c/teachers', admin, 'PUT', { teacherIds: [teacherB.id, teacherA.id] });
    expect(replaced.status).toBe(200);
    expect(await replaced.json()).toEqual(expected);
    const read = await request('/courses/c/teachers', admin);
    expect(read.status).toBe(200);
    expect(read.headers.get('cache-control')).toBe('private, no-store');
    expect(read.headers.get('vary')).toContain('Authorization');
    expect(await read.json()).toEqual(expected);
    expect(await storedCourse()).toMatchObject({ teacherIds: [teacherB.id, teacherA.id], ownerUserId: teacherB.id, teacher: metadata.teacher });
    expect(await content.getCourseContent('c')).toEqual(before);
  });

  it.each(['GET', 'PUT'])('US-A005-AC04 %s requires an admin and preserves the list on refusal', async method => {
    const before = await storedCourse();
    for (const user of [teacherA, student]) {
      const denied = await request('/courses/c/teachers', user, method, method === 'PUT' ? { teacherIds: [] } : undefined);
      expect(denied.status).toBe(403);
    }
    expect((await request('/courses/c/teachers', undefined, method)).status).toBe(401);
    expect((await fetch(base + '/courses/c/teachers', { method, headers: { authorization: 'Bearer invalid' } })).status).toBe(401);
    expect(await storedCourse()).toEqual(before);
  });

  it.each([
    ['unknown', 'ghost is not a teacher account.'],
    ['student', 'student'],
    ['admin', 'admin'],
    ['duplicates', 'Each teacher can be listed once.'],
    ['trimmed duplicates', 'Each teacher can be listed once.'],
    ['too many', 'Teachers must be a list of at most 20 account ids.'],
  ])('US-A005-AC05 refuses %s without changing the stored list', async (kind, message) => {
    const teacherIds = kind === 'unknown' ? ['ghost'] : kind === 'student' ? [student.id] : kind === 'admin' ? [admin.id] :
      kind === 'duplicates' ? [teacherA.id, teacherA.id] : kind === 'trimmed duplicates' ? [teacherA.id, ` ${teacherA.id} `] :
      Array.from({ length: 21 }, (_, i) => `t${i}`);
    const before = await storedCourse();
    const response = await request('/courses/c/teachers', admin, 'PUT', { teacherIds });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: kind === 'student' ? `${student.id} is not a teacher account.` :
      kind === 'admin' ? `${admin.id} is not a teacher account.` : message });
    expect(await storedCourse()).toEqual(before);
  });

  it.each([{}, [], { teacherIds: null }, { teacherIds: 'teacher' }, { teacherIds: [1] },
    { teacherIds: [''] }, { teacherIds: ['   '] }, { teacherIds: ['x'.repeat(121)] },
  ].map(body => [body]))('US-A005-AC05 refuses malformed body %j before any assignment', async body => {
    const before = await storedCourse();
    const response = await request('/courses/c/teachers', admin, 'PUT', body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'Teachers must be a list of at most 20 account ids.' });
    expect(await storedCourse()).toEqual(before);
  });

  it('US-A005-AC05 accepts exactly 20 teacher accounts and trims ids before storing', async () => {
    const ids = [teacherA.id, teacherB.id];
    for (let i = 2; i < 20; i++) {
      const user = await auth.createUser({ ...teacherA, id: `t${i}`, email: `t${i}@example.test` });
      ids.push(user.id);
    }
    const response = await request('/courses/c/teachers', admin, 'PUT', { teacherIds: ids.map(id => ` ${id} `) });
    expect(response.status).toBe(200);
    expect((await response.json()).teachers.map((teacher: { id: string }) => teacher.id)).toEqual(ids);
    expect((await storedCourse()).teacherIds).toEqual(ids);
  });

  it('US-A005-AC06 an old admin-owned course lists that admin as inactive and converts on first save', async () => {
    await courses.createCourse(metadata, { id: 'legacy-admin', createdAt: 'x', ownerUserId: admin.id });
    const read = await request('/courses/legacy-admin/teachers', admin);
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ teachers: [teacherView(admin, false)] });
    expect((await courses.listCourses()).find(course => course.id === 'legacy-admin')?.teacherIds).toBeUndefined();
    const saved = await request('/courses/legacy-admin/teachers', admin, 'PUT', { teacherIds: [teacherB.id] });
    expect(saved.status).toBe(200);
    expect((await courses.listCourses()).find(course => course.id === 'legacy-admin'))
      .toMatchObject({ teacherIds: [teacherB.id], ownerUserId: teacherB.id });
  });

  it('US-A005-AC07 disabled teachers may be assigned and disabled or demoted accounts stay visible as inactive', async () => {
    await auth.updateStatus(teacherA.id, 'disabled');
    const replaced = await request('/courses/c/teachers', admin, 'PUT', { teacherIds: [teacherA.id, teacherB.id] });
    expect(replaced.status).toBe(200);
    expect(await replaced.json()).toEqual({ teachers: [teacherView(teacherA, false), teacherView(teacherB)] });
    await auth.updateRole(teacherB.id, 'student');
    const read = await request('/courses/c/teachers', admin);
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ teachers: [teacherView(teacherA, false), teacherView(teacherB, false)] });
    const removed = await request('/courses/c/teachers', admin, 'PUT', { teacherIds: [] });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ teachers: [] });
  });

  it('returns a deleted account as an inactive blank entry', async () => {
    await courses.updateCourseTeachers('c', ['deleted', teacherB.id]);
    const response = await request('/courses/c/teachers', admin);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ teachers: [
      { id: 'deleted', displayName: '', email: '', active: false }, teacherView(teacherB),
    ] });
  });

  it.each(['GET', 'PUT'])('%s answers the exact 404 for an unknown course', async method => {
    const response = await request('/courses/missing/teachers', admin, method, method === 'PUT' ? { teacherIds: [] } : undefined);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: 'Course not found' });
  });

  it('accepts an empty list, after which only admins author', async () => {
    const response = await request('/courses/c/teachers', admin, 'PUT', { teacherIds: [] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ teachers: [] });
    expect(await storedCourse()).toMatchObject({ teacherIds: [], ownerUserId: '' });
    expect((await request('/courses/c/content', teacherA, 'PATCH', { sections: [] })).status).toBe(403);
    expect((await request('/courses/c/content', teacherB, 'PATCH', { sections: [] })).status).toBe(403);
    expect((await request('/courses/c/content', admin, 'PATCH', { sections: [] })).status).toBe(200);
  });

  it('US-A005-AC03 an admin removes the creator while their editor is open and their next save is refused', async () => {
    const loaded = await request('/courses/c/content?view=author', teacherA);
    const state = (await loaded.json()).review;
    expect(loaded.status).toBe(200);
    const removed = await request('/courses/c/teachers', admin, 'PUT', { teacherIds: [teacherB.id] });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ teachers: [teacherView(teacherB)] });
    const refused = await fetch(base + '/courses/c/content', { method: 'PATCH',
      headers: { ...headers(teacherA), 'X-Course-Revision': JSON.stringify({ version: state.version, revisionId: state.revisionId }) },
      body: JSON.stringify({ sections: [] }) });
    expect(refused.status).toBe(403);
    expect((await request('/courses/c/content', teacherB, 'PATCH', { sections: [] })).status).toBe(200);
  });

  it('US-A005-AC03 rechecks a teacher save queued behind an admin removing that teacher', async () => {
    const state = (await (await request('/courses/c/content?view=author', teacherA)).json()).review;
    const lock = content.withCourseMutationLock.bind(content);
    let enterFirst!: () => void;
    let enterSecond!: () => void;
    let releaseFirst!: () => void;
    const firstEntered = new Promise<void>(resolve => { enterFirst = resolve; });
    const secondQueued = new Promise<void>(resolve => { enterSecond = resolve; });
    const release = new Promise<void>(resolve => { releaseFirst = resolve; });
    let calls = 0;
    vi.spyOn(content, 'withCourseMutationLock').mockImplementation(async (id, operation) => {
      const order = ++calls;
      if (order === 2) enterSecond();
      return lock(id, async () => {
        if (order === 1) { enterFirst(); await release; }
        return operation();
      });
    });
    const removal = request('/courses/c/teachers', admin, 'PUT', { teacherIds: [teacherB.id] });
    let save!: Promise<Response>;
    try {
      await firstEntered;
      save = fetch(base + '/courses/c/content', { method: 'PATCH',
        headers: { ...headers(teacherA), 'X-Course-Revision': JSON.stringify({ version: state.version, revisionId: state.revisionId }) },
        body: JSON.stringify({ sections: [] }) });
      await secondQueued;
    } finally { releaseFirst(); }
    expect((await removal).status).toBe(200);
    const refused = await save;
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ message: 'You do not have permission to edit this course.' });
    expect(await content.getCourseContent('c')).toBeNull();
  });

  it.each(['published', 'ready-for-review', 'archived'] as const)('assigns teachers to a %s course immediately without editing or creating a revision', async status => {
    await courses.createCourse({ ...metadata, status }, { id: 'live', createdAt: 'x', teacherIds: [] });
    for (const query of ['', '?view=author']) {
      const response = await request(`/courses/live/teachers${query}`, admin, 'PUT', { teacherIds: [teacherA.id] });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ teachers: [teacherView(teacherA)] });
    }
    expect((await courses.listCourses()).find(course => course.id === 'live')).toMatchObject({ status, teacherIds: [teacherA.id] });
    expect(await content.getCourseContent('live')).toBeNull();
  });

  it('releases the course mutation lock before returning the saved teacher list', async () => {
    const lock = content.withCourseMutationLock.bind(content);
    let released = false;
    vi.spyOn(content, 'withCourseMutationLock').mockImplementation(async (id, operation) => {
      const result = await lock(id, operation);
      released = true;
      return result;
    });
    const response = await request('/courses/c/teachers', admin, 'PUT', { teacherIds: [teacherB.id] });
    expect(response.status).toBe(200);
    expect(released).toBe(true);
    expect(await response.json()).toEqual({ teachers: [teacherView(teacherB)] });
  });

  it('US-A005-AC04 an assigned teacher cannot forge the list through a metadata save', async () => {
    const response = await request('/courses/c', teacherA, 'PATCH', { ...metadata, teacherIds: [], ownerUserId: '' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ teacherIds: [teacherA.id, teacherB.id], ownerUserId: teacherA.id });
    expect(await storedCourse()).toMatchObject({ teacherIds: [teacherA.id, teacherB.id], ownerUserId: teacherA.id });
  });
});
