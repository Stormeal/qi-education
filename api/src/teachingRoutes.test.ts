import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { createCourseSchema, type CourseStatus } from './course.js';
import { updateCourseContentSchema } from './courseContent.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { createServer } from './server.js';

describe.each(['', '/api'])('US-T016 teaching overview API (%s)', prefix => {
  let auth: InMemoryAuthRepository, courses: InMemoryCourseRepository;
  let content: InMemoryCourseContentRepository, progress: InMemoryLearningProgressRepository;
  let feedback: InMemoryFeedbackRepository, server: Server, base: string;
  let teacher: AuthUser, student: AuthUser, admin: AuthUser, otherTeacher: AuthUser;
  const request = (token?: string) => fetch(`${base}${prefix}/teaching/courses`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
  const token = (account: AuthUser) => createSessionToken(account, apiConfig.AUTH_TOKEN_SECRET);
  async function addCourse(id: string, title: string, status: CourseStatus = 'published', teacherIds = [teacher.id]) {
    return courses.createCourse(createCourseSchema.parse({ title, description: 'Teaching overview fixture',
      level: 'Beginner', teacher: 'Course staff', status }), { id, createdAt: '2026-10-27T00:00:00.000Z', teacherIds });
  }
  async function lessons(courseId: string, ids: string[]) {
    return content.updateCourseContent(courseId, updateCourseContentSchema.parse({ sections: [
      { id: 'section', title: 'Lessons', components: ids.map(id => ({ id, title: `Title ${id}`, type: 'text', content: 'Lesson' })) },
    ] }).sections);
  }
  async function learner(id: string, enrolledCourseIds: string[]) {
    return auth.createUser({ ...student, id, email: `${id}@example.test`, displayName: `Private ${id}`, enrolledCourseIds });
  }

  beforeEach(async () => {
    expect(apiConfig.mode).toBe('isolated');
    auth = new InMemoryAuthRepository(); courses = new InMemoryCourseRepository();
    content = new InMemoryCourseContentRepository(); progress = new InMemoryLearningProgressRepository();
    feedback = new InMemoryFeedbackRepository();
    teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    otherTeacher = await auth.createUser({ ...teacher, id: 'other-teacher', email: 'other-teacher@example.test' });
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      learningProgressRepository: progress, feedbackRepository: feedback, muxVideoService: null, muxWebhookService: null,
    }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    vi.restoreAllMocks();
  });

  it('AC01 counts enrolled accounts using unique current lessons and one progress read per course', async () => {
    await addCourse('main', 'zebra course'); await lessons('main', ['one', 'two', 'three']);
    await addCourse('empty', 'Alpha empty', 'draft');
    await addCourse('review', 'beta review', 'ready-for-review');
    await addCourse('archived', 'Charlie archived', 'archived');
    const full = await learner('private-full', ['main', 'main']);
    const partial = await learner('private-partial', ['main']);
    const removed = await learner('private-removed', ['main']);
    await learner('private-zero', ['main', 'empty']);
    for (const id of ['one', 'two', 'three', 'deleted']) await progress.complete(full.id, 'main', id);
    await progress.complete(partial.id, 'main', 'one');
    await progress.complete(removed.id, 'main', 'deleted');
    for (const id of ['one', 'two', 'three']) await progress.complete(teacher.id, 'main', id);
    const original = progress.listForCourse.bind(progress);
    const bulk = vi.spyOn(progress, 'listForCourse').mockImplementation(async (courseId, userIds) => {
      const rows = await original(courseId, userIds);
      // Legacy duplicate completions must not inflate started/completed/average.
      rows.find(row => row.userId === partial.id)?.completedIds.push('one', 'one');
      return rows;
    });
    const get = vi.spyOn(progress, 'get'), list = vi.spyOn(progress, 'list');
    const response = await request(token(teacher));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')?.split(/,\s*/)).toContain('Authorization');
    const body = await response.json();
    expect(body).toEqual({ courses: [
      { courseId: 'empty', title: 'Alpha empty', status: 'draft', enrolledLearners: 1, startedLearners: 0,
        completedLearners: 0, averageProgress: 0, feedback: { helpful: 0, notHelpful: 0, problems: 0 }, recentFeedback: [] },
      { courseId: 'review', title: 'beta review', status: 'ready-for-review', enrolledLearners: 0, startedLearners: 0,
        completedLearners: 0, averageProgress: null, feedback: { helpful: 0, notHelpful: 0, problems: 0 }, recentFeedback: [] },
      { courseId: 'archived', title: 'Charlie archived', status: 'archived', enrolledLearners: 0, startedLearners: 0,
        completedLearners: 0, averageProgress: null, feedback: { helpful: 0, notHelpful: 0, problems: 0 }, recentFeedback: [] },
      { courseId: 'main', title: 'zebra course', status: 'published', enrolledLearners: 4, startedLearners: 2,
        completedLearners: 1, averageProgress: 33, feedback: { helpful: 0, notHelpful: 0, problems: 0 }, recentFeedback: [] },
    ] });
    expect(bulk).toHaveBeenCalledTimes(4);
    expect(bulk).toHaveBeenCalledWith('main', expect.arrayContaining([full.id, partial.id, removed.id, 'private-zero']));
    expect(get).not.toHaveBeenCalled(); expect(list).not.toHaveBeenCalled();
    const serialized = JSON.stringify(body);
    for (const account of await auth.listUsers()) {
      for (const identity of [account.id, account.email, account.displayName]) expect(serialized).not.toContain(identity);
    }
  });

  it('AC01 rounds the mean only after averaging and uses the live lessons during revision', async () => {
    const course = await addCourse('rounding', 'Rounding course');
    const live = await lessons(course.id, ['one', 'two', 'three', 'four', 'five', 'six']);
    await content.saveCourseReview(course.id, { version: 1, liveStatus: 'published', history: [],
      live: { id: 'live', metadata: course, sections: live.sections },
      working: { id: 'draft', metadata: { ...course, title: 'Private revision' }, status: 'draft', sections: [] },
    });
    await auth.enrollUserInCourse(student.id, course.id);
    await learner('second-learner', [course.id]);
    await progress.complete(student.id, course.id, 'one');
    const response = await request(token(teacher));
    expect(response.status).toBe(200);
    expect((await response.json()).courses).toEqual([expect.objectContaining({
      courseId: course.id, title: 'Rounding course', status: 'published', enrolledLearners: 2,
      startedLearners: 1, completedLearners: 0, averageProgress: 8,
    })]);
  });

  it('AC02 counts only course lesson feedback and projects the newest five without identity or triage', async () => {
    await addCourse('feedback-course', 'Feedback course'); await lessons('feedback-course', ['one']);
    const entries = [];
    const kinds = ['helpful', 'not-helpful', 'problem', 'helpful', 'problem', 'not-helpful', 'helpful'] as const;
    for (let index = 0; index < kinds.length; index++) {
      const kind = kinds[index];
      const entry = await feedback.createFeedback({ page: 'lesson', courseId: 'feedback-course',
        componentId: index === 6 ? 'deleted' : 'one', lessonFeedbackKind: kind,
        ...(kind === 'problem' ? { problemCategory: 'video' as const } : {}), message: index === 5 ? '' : `Comment ${index}`,
      }, toAuthenticatedUser(student));
      entries.push({ ...entry, createdAt: `2026-10-27T10:0${index}:00.000Z`, workStatus: 'work' as const,
        githubIssueUrl: 'https://example.test/private-issue' });
    }
    const site = await feedback.createFeedback({ page: 'home', courseId: 'feedback-course',
      lessonFeedbackKind: 'problem', message: 'Site feedback' }, toAuthenticatedUser(student));
    const other = await feedback.createFeedback({ page: 'lesson', courseId: 'another-course',
      componentId: 'one', lessonFeedbackKind: 'problem', message: 'Other course' }, toAuthenticatedUser(student));
    // Deliberately unsorted storage results: the route owns newest-first ordering.
    vi.spyOn(feedback, 'listFeedback').mockResolvedValue([entries[3], site, ...entries.slice(0, 3), other, ...entries.slice(4)]);
    const response = await request(token(teacher));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.courses[0].feedback).toEqual({ helpful: 3, notHelpful: 2, problems: 2 });
    expect(body.courses[0].recentFeedback).toEqual(entries.slice(2).reverse().map(entry => ({
      id: entry.id, componentId: entry.componentId, lessonTitle: entry.componentId === 'deleted' ? null : 'Title one',
      kind: entry.lessonFeedbackKind, category: entry.problemCategory ?? null, message: entry.message, createdAt: entry.createdAt,
    })));
    const serialized = JSON.stringify(body);
    for (const privateValue of [student.id, student.email, student.displayName, 'userId', 'userEmail', 'userRole', 'githubIssueUrl', 'workStatus']) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it('AC03 includes assigned and legacy-owned courses, excluding other teachers and explicit unassignment', async () => {
    await addCourse('assigned', 'Assigned course', 'draft', [otherTeacher.id, teacher.id]);
    await addCourse('other', 'Other teacher course', 'published', [otherTeacher.id]);
    await lessons('other', ['private-lesson']);
    await auth.enrollUserInCourse(student.id, 'other'); await progress.complete(student.id, 'other', 'private-lesson');
    await feedback.createFeedback({ page: 'lesson', courseId: 'other', componentId: 'private-lesson',
      lessonFeedbackKind: 'helpful', message: 'Other teacher feedback' }, toAuthenticatedUser(student));
    const legacy = await addCourse('legacy', 'Legacy course', 'archived'); delete legacy.teacherIds;
    await courses.createCourse(createCourseSchema.parse({ ...legacy, title: 'Unassigned course' }),
      { id: 'unassigned', createdAt: legacy.createdAt, ownerUserId: teacher.id });
    (await courses.listCourses()).find(course => course.id === 'unassigned')!.teacherIds = [];
    const response = await request(token(teacher));
    expect(response.status).toBe(200);
    expect((await response.json()).courses.map((course: { courseId: string }) => course.courseId)).toEqual(['assigned', 'legacy']);
  });

  it('AC03 returns an empty courses array for a teacher without assignments', async () => {
    const response = await request(token(otherTeacher));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ courses: [] });
  });

  it('AC03 requires a valid session and refuses student, admin, disabled and demoted teacher accounts', async () => {
    for (const value of [undefined, 'invalid', createSessionToken(teacher, apiConfig.AUTH_TOKEN_SECRET, -1),
      token({ ...teacher, id: 'missing-account' })]) expect((await request(value)).status).toBe(401);
    for (const account of [student, admin]) {
      const response = await request(token(account));
      expect(response.status).toBe(403); expect(await response.json()).toEqual({ message: expect.any(String) });
    }
    const originalToken = token(teacher);
    await auth.updateStatus(teacher.id, 'disabled');
    const disabled = await request(originalToken);
    expect(disabled.status).toBe(403); expect(await disabled.json()).toEqual({ message: expect.any(String) });
    // Existing protected routes must retain their disabled-account response.
    expect((await fetch(`${base}${prefix}/auth/me`, { headers: { authorization: `Bearer ${originalToken}` } })).status).toBe(401);
    await auth.updateStatus(teacher.id, 'active'); await auth.updateRole(teacher.id, 'student');
    expect((await request(originalToken)).status).toBe(403);
  });
});
