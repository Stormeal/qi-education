import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from './server.js';
import { apiConfig } from './config.js';
import { createSessionToken, authSheetHeaders, authUserToSheetRow, type AuthUser, toAuthenticatedUser } from './auth.js';
import { GoogleSheetsAuthRepository, InMemoryAuthRepository } from './authRepository.js';
import { GoogleSheetsCourseRepository, InMemoryCourseRepository } from './courseRepository.js';
import { courseSheetHeaders, courseToSheetRow, createCourseSchema } from './course.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { updateCourseContentSchema } from './courseContent.js';
import { createSheetsClient } from './googleSheets.js';

const fixture = vi.hoisted(() => ({ rows: new Map<string, string[][]>(), reads: [] as string[], clients: 0 }));
vi.mock('googleapis', () => ({ google: { auth: { JWT: class {} }, sheets: () => {
  fixture.clients++;
  return { spreadsheets: {
    get: async () => { fixture.reads.push('metadata'); return { data: { sheets: [...fixture.rows.keys()].map(title => ({ properties: { title } })) } }; },
    values: {
      get: async ({ range }: { range: string }) => { fixture.reads.push(range); await new Promise(resolve => setTimeout(resolve, 5));
        const rows = fixture.rows.get(range.split('!')[0]) ?? [];
        return { data: { values: range.endsWith('1') ? rows.slice(0, 1) : rows } }; },
    },
  } };
} } }));

const sections = updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Section', components: [
  { id: 'lesson', title: 'Lesson', type: 'text', content: 'Body' },
  { id: 'quiz', title: 'Quiz', type: 'quiz', quiz: { passPoints: 1, questions: [{ id: 'q', question: 'Pick', points: 1,
    answers: ['a', 'b', 'c', 'd'].map(id => ({ id, text: id, isCorrect: id === 'a' })) }] } },
] }] }).sections;
const servers: ReturnType<ReturnType<typeof createServer>['listen']>[] = [];
function start(dependencies: Parameters<typeof createServer>[0]) {
  const server = createServer({ ...dependencies, muxVideoService: null, muxWebhookService: null,
    gitHubFeedbackService: { hasConfig: () => false } as never }).listen(0);
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
function headers(user: AuthUser) { return { authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}` }; }
beforeEach(() => { fixture.rows.clear(); fixture.reads.length = 0; });
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });

describe('US-P006 isolated route costs', () => {
  it('INV-005 shares the Google client', () => { expect(createSheetsClient()).toBe(createSheetsClient()); });
  it('AC02 counts reads per authenticated route without read-path headers', async () => {
    const users = new InMemoryAuthRepository();
    const teacher = (await users.findByEmail('teacher@qi-education.local'))!;
    const student = { ...(await users.findByEmail('student@qi-education.local'))!, enrolledCourseIds: ['course'] };
    const courses = new InMemoryCourseRepository();
    const course = await courses.createCourse(createCourseSchema.parse({ title: 'Counted course', description: 'Counted description', teacher: 'Teacher', level: 'Beginner', status: 'published' }),
      { id: 'course', createdAt: '2026-10-09', ownerUserId: teacher.id });
    const assets = new InMemoryCourseAssetRepository();
    course.thumbnailAssetId = (await assets.saveThumbnail({ courseId: 'course', contentType: 'image/png', fileName: 'thumb.png', binary: Buffer.from('thumbnail') }))._id;
    fixture.rows.set('Users', [[...authSheetHeaders], authUserToSheetRow(teacher), authUserToSheetRow(student)]);
    fixture.rows.set('Courses', [[...courseSheetHeaders], courseToSheetRow(course)]);
    const content = new InMemoryCourseContentRepository();
    Object.defineProperty(content, 'storageType', { value: 'mongodb' });
    await content.updateCourseContent('course', sections);
    const base = start({ authRepository: new GoogleSheetsAuthRepository(), courseRepository: new GoogleSheetsCourseRepository(), courseContentRepository: content, courseAssetRepository: assets });
    const counts: Record<string, number> = {};
    for (const path of ['/auth/me', '/courses', '/courses/course/outline', '/courses/course/content', '/courses/course/thumbnail', '/courses/course/content/components/quiz/quiz-attempts']) {
      fixture.reads.length = 0;
      const quiz = path.endsWith('quiz-attempts');
      const response = await fetch(base + path, { headers: { ...headers(student), 'Content-Type': 'application/json' },
        ...(quiz ? { method: 'POST', body: JSON.stringify({ sectionId: 's', answers: [{ questionId: 'q', answerId: 'a' }] }) } : {}) });
      await response.arrayBuffer(); counts[path] = fixture.reads.length;
      expect(response.status).toBe(200);
    }
    console.log('Sheets reads per route', counts);
    expect(counts).toEqual({ '/auth/me': 1, '/courses': 2, '/courses/course/outline': 2, '/courses/course/content': 2,
      '/courses/course/thumbnail': 2, '/courses/course/content/components/quiz/quiz-attempts': 2 });

    // One warm instance, synchronous class burst, simulated 5ms provider latency.
    fixture.reads.length = 0;
    const burst = await Promise.all(Array.from({ length: 20 }, () => fetch(base + '/courses/course/content', { headers: headers(student) })));
    await Promise.all(burst.map(response => response.arrayBuffer()));
    expect(burst.every(response => response.status === 200)).toBe(true);
    expect(fixture.reads.length).toBeLessThanOrEqual(4);

    // A later request must see a revoked account, not a retained auth result.
    fixture.rows.get('Users')![2][5] = 'disabled';
    expect((await fetch(base + '/courses/course/content', { headers: headers(student) })).status).toBe(401);
  });

  it('AC01/03 allows 20 course content readers to enter together', async () => {
    const auth = new InMemoryAuthRepository();
    const student = (await auth.enrollUserInCourse((await auth.findByEmail('student@qi-education.local'))!.id, 'demo-course-1'))!;
    const content = new InMemoryCourseContentRepository();
    await content.updateCourseContent('demo-course-1', sections);
    const original = content.getCourseContent.bind(content);
    let entered = 0, release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(content, 'getCourseContent').mockImplementation(async id => { entered++; await gate; return original(id); });
    const base = start({ authRepository: auth, courseContentRepository: content });
    const pending = Array.from({ length: 20 }, () => fetch(base + '/courses/demo-course-1/content', { headers: headers(student) }));
    await new Promise(resolve => setTimeout(resolve, 150));
    const beforeRelease = entered; release();
    const responses = await Promise.all(pending); await Promise.all(responses.map(response => response.arrayBuffer()));
    expect(beforeRelease).toBe(20);
    expect(responses.map(response => response.status)).toEqual(Array(20).fill(200));
  });

  it('all five read routes remain available while a mutation owner is held', async () => {
    const auth = new InMemoryAuthRepository(), courses = new InMemoryCourseRepository(), content = new InMemoryCourseContentRepository(), assets = new InMemoryCourseAssetRepository();
    const student = (await auth.enrollUserInCourse((await auth.findByEmail('student@qi-education.local'))!.id, 'demo-course-1'))!;
    const thumb = await assets.saveThumbnail({ courseId: 'demo-course-1', contentType: 'image/png', fileName: 'thumb.png', binary: Buffer.from('image') });
    await courses.updateCourseThumbnail('demo-course-1', { thumbnailAssetId: thumb._id });
    const attachment = await assets.saveComponentAttachment({ courseId: 'demo-course-1', componentId: 'lesson', contentType: 'text/plain', fileName: 'notes.txt', binary: Buffer.from('notes') });
    const body = structuredClone(sections);
    body[0].components[0].attachments = [{ id: attachment._id, assetId: attachment._id, fileName: attachment.fileName, contentType: attachment.contentType, sizeBytes: attachment.sizeBytes, createdAt: attachment.createdAt }];
    await content.updateCourseContent('demo-course-1', body);
    let release!: () => void, enter!: () => void;
    const started = new Promise<void>(resolve => { enter = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const writer = content.withCourseMutationLock('demo-course-1', async () => { enter(); await gate; }); await started;
    const lock = vi.spyOn(content, 'withCourseMutationLock');
    const base = start({ authRepository: auth, courseRepository: courses, courseContentRepository: content, courseAssetRepository: assets });
    try {
      const responses = await Promise.all(['thumbnail', 'outline', 'content', `content/attachments/${attachment._id}`, 'content/components/quiz/quiz-attempts'].map(path => fetch(base + '/courses/demo-course-1/' + path, {
        headers: { ...headers(student), 'Content-Type': 'application/json' }, ...(path.endsWith('quiz-attempts') ? {
          method: 'POST', body: JSON.stringify({ sectionId: 's', answers: [{ questionId: 'q', answerId: 'a' }] }),
        } : {}),
      })));
      await Promise.all(responses.map(response => response.arrayBuffer()));
      expect(responses.map(response => response.status)).toEqual(Array(5).fill(200));
      expect(lock).not.toHaveBeenCalled();
    } finally { release(); await writer; }
  });

  it('binds author lesson content and its save token to one snapshot during a concurrent save', async () => {
    const auth = new InMemoryAuthRepository(), courses = new InMemoryCourseRepository(), content = new InMemoryCourseContentRepository();
    const teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    await courses.createCourse(createCourseSchema.parse({ title: 'Snapshot course', description: 'Snapshot description', teacher: 'Teacher', level: 'Beginner' }), { id: 'course', createdAt: '2026-10-09', ownerUserId: teacher.id });
    await content.updateCourseContent('course', sections);
    const base = start({ authRepository: auth, courseRepository: courses, courseContentRepository: content });
    const original = content.getCourseContent.bind(content);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(content, 'getCourseContent').mockImplementationOnce(async id => {
      const old = structuredClone(await original(id)); entered(); await gate; return old;
    });
    const read = fetch(base + '/courses/course/content?view=author', { headers: headers(teacher) }); await started;
    const changed = structuredClone(sections); changed[0].components[0].content = 'Newly saved work';
    const save = async (body: unknown, revision: unknown) => fetch(base + '/courses/course/content', { method: 'PATCH', headers: {
      ...headers(teacher), 'Content-Type': 'application/json', 'X-Course-Revision': JSON.stringify(revision),
    }, body: JSON.stringify(body) });
    try {
      const saved = await save({ sections: changed }, { version: 0, revisionId: 'legacy-course' });
      expect(saved.status).toBe(200); await saved.arrayBuffer();
    } finally { release(); }
    const response = await read; expect(response.status).toBe(200);
    const old = await response.json(); expect(old.sections[0].components[0].content).toBe('Body');
    const attempted = await save({ sections: old.sections }, { version: old.review.version, revisionId: old.review.revisionId });
    expect(attempted.status).toBe(409);
    expect((await original('course'))!.review!.working!.sections[0].components[0].content).toBe('Newly saved work');
  });

  it('AC05 lists 50 courses without loading any full content documents', async () => {
    const courses = new InMemoryCourseRepository(), content = new InMemoryCourseContentRepository();
    for (let i = 0; i < 50; i++) {
      await courses.createCourse(createCourseSchema.parse({ title: 'Large course', description: 'Large description', teacher: 'Teacher', level: 'Beginner', status: 'published' }), { id: `course-${i}`, createdAt: '2026-10-09' });
      await content.updateCourseContent(`course-${i}`, sections);
    }
    const reads = vi.spyOn(content, 'getCourseContent');
    const response = await fetch(start({ courseRepository: courses, courseContentRepository: content }) + '/courses');
    expect(response.status).toBe(200); expect(await response.json()).toHaveLength(51);
    expect(reads).not.toHaveBeenCalled();
  });

  it('AC04 saves ten 4MB attachments without fetching their binaries, and denies foreign ownership', async () => {
    const auth = new InMemoryAuthRepository(), courses = new InMemoryCourseRepository(), content = new InMemoryCourseContentRepository(), assets = new InMemoryCourseAssetRepository();
    const teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    await courses.createCourse(createCourseSchema.parse({ title: 'Attachment course', description: 'Attachment description', teacher: 'Teacher', level: 'Beginner' }), { id: 'course', createdAt: '2026-10-09', ownerUserId: teacher.id });
    await content.updateCourseContent('course', sections);
    const attachments = [];
    for (let i = 0; i < 10; i++) { const asset = await assets.saveComponentAttachment({ courseId: 'course', componentId: 'lesson', contentType: 'text/plain', fileName: 'notes.txt', binary: Buffer.alloc(4 * 1024 * 1024) });
      attachments.push({ id: asset._id, assetId: asset._id, fileName: asset.fileName, contentType: asset.contentType, sizeBytes: asset.sizeBytes, createdAt: asset.createdAt }); }
    const reads = vi.spyOn(assets, 'getComponentAttachment');
    const base = start({ authRepository: auth, courseRepository: courses, courseContentRepository: content, courseAssetRepository: assets });
    const changed = structuredClone(sections); changed[0].components[0].attachments = attachments;
    const save = async (body: unknown, version: number) => fetch(base + '/courses/course/content', { method: 'PATCH', headers: { ...headers(teacher), 'Content-Type': 'application/json', 'X-Course-Revision': JSON.stringify({ version, revisionId: 'legacy-course' }) }, body: JSON.stringify(body) });
    const response = await save({ sections: changed }, 0); expect(response.status).toBe(200); await response.arrayBuffer();
    const binaryBytes = reads.mock.results.length * 4 * 1024 * 1024;
    console.log('Attachment ownership binary bytes', binaryBytes);
    expect(binaryBytes).toBe(0);
    const foreign = await assets.saveComponentAttachment({ courseId: 'other', componentId: 'lesson', contentType: 'text/plain', fileName: 'foreign.txt', binary: Buffer.from('foreign') });
    changed[0].components[0].attachments[0].assetId = foreign._id;
    expect((await save({ sections: changed }, 1)).status).toBe(403);
  });
});
