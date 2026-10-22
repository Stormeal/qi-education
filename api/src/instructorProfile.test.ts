import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { apiConfig } from './config.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { InMemoryInstructorProfileRepository, InstructorProfileUnavailableError } from './instructorProfileRepository.js';
import { createServer } from './server.js';

describe.each(['', '/api'])('US-T007 instructor profile HTTP (%s)', prefix => {
  let server: Server;
  let base: string;
  let teacher: AuthUser;
  let admin: AuthUser;
  let student: AuthUser;
  let auth: InMemoryAuthRepository;
  let courses: InMemoryCourseRepository;
  let content: InMemoryCourseContentRepository;
  let profiles: InMemoryInstructorProfileRepository;

  beforeEach(async () => {
    auth = new InMemoryAuthRepository();
    teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    courses = new InMemoryCourseRepository();
    content = new InMemoryCourseContentRepository();
    profiles = new InMemoryInstructorProfileRepository();
    server = createServer({
      authRepository: auth, courseRepository: courses,
      courseContentRepository: content, instructorProfileRepository: profiles,
      courseAssetRepository: new InMemoryCourseAssetRepository(),
      feedbackRepository: new InMemoryFeedbackRepository(),
      careerPathRepository: new InMemoryCareerPathRepository(),
      learningProgressRepository: new InMemoryLearningProgressRepository(),
      gitHubFeedbackService: { async createIssueFromFeedback() { throw new Error('Shared services forbidden'); } },
      muxVideoService: null, muxWebhookService: null,
    }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  function request(path: string, user?: AuthUser, method = 'GET', body?: unknown) {
    return fetch(base + prefix + path, { method, headers: {
      'Content-Type': 'application/json',
      ...(user ? { authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}` } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }

  it('AC02 returns an empty public list when no instructor descriptions exist', async () => {
    const response = await request('/instructors');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual([]);
  });

  it('US-A005-AC09 lists a published course under every assigned teacher', async () => {
    const second = await auth.createUser({ ...teacher, id: 'second-teacher', email: 'second@example.test' });
    await profiles.save(teacher.id, 'First teacher description');
    await profiles.save(second.id, 'Second teacher description');
    const seed = (await courses.listCourses())[0];
    await courses.createCourse({ ...seed, status: 'published' }, { id: 'shared', createdAt: seed.createdAt, teacherIds: [teacher.id, second.id] });
    await courses.createCourse({ ...seed, status: 'published' }, { id: 'empty', createdAt: seed.createdAt, teacherIds: [] });
    await courses.createCourse({ ...seed, status: 'draft' }, { id: 'draft', createdAt: seed.createdAt, teacherIds: [teacher.id, second.id] });
    expect(await (await request('/instructors')).json()).toEqual([
      { description: 'First teacher description', courseIds: ['shared'] },
      { description: 'Second teacher description', courseIds: ['shared'] },
    ]);
  });

  it('AC03 reads no description as an empty string for both teacher and admin', async () => {
    for (const user of [teacher, admin]) {
      const response = await request('/users/me/instructor-profile', user);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ description: '' });
    }
  });

  it('AC03 saves trimmed text and reads it back without expanding the response', async () => {
    const saved = await request('/users/me/instructor-profile', teacher, 'PUT', { description: '  I teach practical testing.\n' });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ description: 'I teach practical testing.' });
    const loaded = await request('/users/me/instructor-profile', teacher);
    expect(loaded.status).toBe(200);
    expect(await loaded.json()).toEqual({ description: 'I teach practical testing.' });
  });

  it('AC03 permits 280 characters after trimming, uses the authenticated owner and clears whitespace', async () => {
    const text = 'x'.repeat(280);
    const saved = await request('/users/me/instructor-profile', admin, 'PUT', { description: `  ${text}  `, userId: teacher.id });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ description: text });
    expect(await profiles.get(teacher.id)).toBeNull();
    const cleared = await request('/users/me/instructor-profile', admin, 'PUT', { description: ' \n\t ' });
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ description: '' });
    expect(await profiles.list()).toEqual([]);
  });

  it.each([{}, null, { description: 7 }, { description: null }, { description: [] }, { description: 'x'.repeat(281) }])(
    'AC04 rejects invalid body %j without changing existing text', async body => {
      await profiles.save(teacher.id, 'Original');
      const response = await request('/users/me/instructor-profile', teacher, 'PUT', body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ message: expect.any(String) });
      expect((await profiles.get(teacher.id))?.description).toBe('Original');
    },
  );

  it.each([
    ['GET', '/users/me/instructor-profile'], ['PUT', '/users/me/instructor-profile'],
    ['GET', '/admin/instructor-profiles'], ['DELETE', '/admin/instructor-profiles/some-user'],
  ])('AC05 protects %s %s against missing, invalid, inactive and student sessions', async (method, path) => {
    for (const caller of [undefined, student]) {
      const response = await request(path, caller, method, method === 'PUT' ? { description: 'Forbidden' } : undefined);
      expect(response.status).toBe(caller ? 403 : 401);
      expect(await response.json()).toEqual({ message: expect.any(String) });
    }
    const invalid = await fetch(base + prefix + path, { method, headers: { authorization: 'Bearer invalid' } });
    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toEqual({ message: expect.any(String) });
    teacher.status = 'disabled';
    const inactive = await request(path, teacher, method);
    expect(inactive.status).toBe(401);
    expect(await inactive.json()).toEqual({ message: expect.any(String) });
    expect(await profiles.list()).toEqual([]);
  });

  it('AC01/06 joins only published owned course IDs and ignores token and author view', async () => {
    await profiles.save(teacher.id, 'Teacher introduction');
    await profiles.save(admin.id, 'Admin introduction');
    await profiles.save('no-courses', 'Hidden introduction');
    const seed = (await courses.listCourses())[0];
    const { id: _id, ownerUserId: _owner, status: _status, createdAt: _createdAt, ...metadata } = seed;
    for (const [id, status, ownerUserId] of [
      ['one', 'published', teacher.id], ['two', 'published', teacher.id],
      ['draft', 'draft', teacher.id], ['pending', 'ready-for-review', teacher.id],
      ['archived', 'archived', teacher.id], ['admin', 'published', admin.id],
      ['unowned', 'published', ''], ['foreign', 'published', 'another-user'],
    ] as const) await courses.createCourse({ ...seed, status }, { id, ownerUserId, createdAt: seed.createdAt });
    // A base draft with a live published revision still belongs in the public catalog.
    await content.saveCourseReview('draft', { version: 1, liveStatus: 'published',
      live: { id: 'live', metadata, sections: [] },
      working: { id: 'working', metadata, sections: [], status: 'draft' }, history: [] });
    // A base published course withdrawn by review no longer belongs in that catalog.
    await content.saveCourseReview('two', { version: 1, liveStatus: 'archived',
      live: { id: 'old-live', metadata, sections: [] }, working: null, history: [] });
    const expected = [
      { description: 'Teacher introduction', courseIds: ['one', 'draft'] },
      { description: 'Admin introduction', courseIds: ['admin'] },
    ];
    for (const authorization of [undefined, 'Bearer invalid', `Bearer ${createSessionToken(toAuthenticatedUser(teacher), apiConfig.AUTH_TOKEN_SECRET!)}`]) {
      const response = await fetch(base + prefix + '/instructors?view=author', { headers: authorization ? { authorization } : {} });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.json()).toEqual(expected);
    }
  });

  it('AC07 lets only admins list all nonempty descriptions and clear idempotently', async () => {
    await profiles.save(teacher.id, 'Teacher text');
    await profiles.save('orphan', 'No remaining account');
    const seed = (await courses.listCourses())[0];
    await courses.createCourse({ ...seed, status: 'published' }, { id: 'teacher-course', ownerUserId: teacher.id, createdAt: seed.createdAt });
    expect(await (await request('/instructors')).json()).toEqual([{ description: 'Teacher text', courseIds: ['teacher-course'] }]);
    for (const [method, path] of [['GET', '/admin/instructor-profiles'], ['DELETE', `/admin/instructor-profiles/${teacher.id}`]]) {
      const forbidden = await request(path, teacher, method);
      expect(forbidden.status).toBe(403);
      expect(await forbidden.json()).toEqual({ message: expect.any(String) });
    }
    const listed = await request('/admin/instructor-profiles', admin);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual([
      { userId: teacher.id, displayName: teacher.displayName, description: 'Teacher text' },
      { userId: 'orphan', displayName: '', description: 'No remaining account' },
    ]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const cleared = await request(`/admin/instructor-profiles/${teacher.id}`, admin, 'DELETE');
      expect(cleared.status).toBe(204);
      expect(await cleared.text()).toBe('');
    }
    expect(await (await request('/users/me/instructor-profile', teacher)).json()).toEqual({ description: '' });
    expect(await (await request('/instructors')).json()).toEqual([]);
  });

  it('AC02/06 omits an instructor who owns only a draft', async () => {
    await profiles.save(teacher.id, 'Not yet public');
    const seed = (await courses.listCourses())[0];
    await courses.createCourse({ ...seed, status: 'draft' }, { id: 'only-draft', ownerUserId: teacher.id, createdAt: seed.createdAt });
    expect(await (await request('/instructors')).json()).toEqual([]);
  });

  it.each([
    ['get', 'GET', '/users/me/instructor-profile'], ['save', 'PUT', '/users/me/instructor-profile'],
    ['list', 'GET', '/instructors'], ['list', 'GET', '/admin/instructor-profiles'],
    ['clear', 'DELETE', '/admin/instructor-profiles/unknown'],
  ] as const)('AC08 reports %s failure on %s %s without leaking provider details', async (operation, method, path) => {
    vi.spyOn(profiles, operation).mockRejectedValueOnce(new Error('Sensitive provider details'));
    const response = await request(path, admin, method, method === 'PUT' ? { description: 'New text' } : undefined);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'Unexpected server error' });
  });

  it('AC08 reports unavailable storage as a message-only 503', async () => {
    vi.spyOn(profiles, 'save').mockRejectedValueOnce(new InstructorProfileUnavailableError());
    const response = await request('/users/me/instructor-profile', teacher, 'PUT', { description: 'New text' });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: 'Instructor profile storage is temporarily unavailable.' });
    expect(await profiles.get(teacher.id)).toBeNull();
  });
});
