import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { updateCourseContentSchema, type CourseContentComponent } from './courseContent.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import type { ImportPlan } from './riseImport.js';
import { runRiseImport } from './riseImportRun.js';
import { createServer } from './server.js';

const teacher = { email: 'teacher@qi-education.local', password: 'Password123!' };

describe('US-T015 runRiseImport', () => {
  let api: Server;
  let uploads: Server;
  let apiUrl: string;
  let folder: string;
  let auth: InMemoryAuthRepository;
  let courses: InMemoryCourseRepository;
  let content: InMemoryCourseContentRepository;
  let received: { path: string; bytes: string }[];
  let plan: ImportPlan;
  const started = new Map<string, { uploadId: string; courseId: string; sectionId: string }>();
  let muxConfirms: boolean;
  const mux = {
    createDirectUpload: vi.fn(async ({ courseId, sectionId, componentId }: { courseId: string; sectionId: string; componentId: string }) => {
      const uploadId = `upload-${componentId}-${mux.createDirectUpload.mock.calls.length}`;
      started.set(componentId, { uploadId, courseId, sectionId });
      return { uploadId, uploadUrl: `${uploadUrl}/${componentId}`, playbackPolicy: 'public' as const };
    }),
    removeVideo: vi.fn(async () => undefined),
  };
  let uploadUrl: string;

  const listen = (app: { listen: Server['listen'] }) => new Promise<[Server, string]>((resolve) => {
    const server: Server = app.listen(0, '127.0.0.1', () => resolve([server, `http://127.0.0.1:${(server.address() as AddressInfo).port}`]));
  });

  beforeEach(async () => {
    received = [];
    started.clear();
    muxConfirms = true;
    mux.createDirectUpload.mockClear();
    mux.removeVideo.mockClear();
    [uploads, uploadUrl] = await listen(createHttpServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', async () => {
        received.push({ path: request.url ?? '', bytes: Buffer.concat(chunks).toString() });
        // Like Mux: a finished upload reports video.upload.asset_created to the API's webhook.
        const upload = started.get((request.url ?? '').slice(1))!;
        if (muxConfirms) await fetch(`${apiUrl}/webhooks/mux`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          type: 'video.upload.asset_created', data: { id: upload.uploadId, asset_id: `asset-${(request.url ?? '').slice(1)}`,
            new_asset_settings: { passthrough: JSON.stringify({ c: upload.courseId, s: upload.sectionId, m: (request.url ?? '').slice(1) }) } } }) });
        response.end();
      });
    }));
    auth = new InMemoryAuthRepository();
    courses = new InMemoryCourseRepository();
    content = new InMemoryCourseContentRepository();
    [api, apiUrl] = await listen(createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      courseAssetRepository: new InMemoryCourseAssetRepository(), muxVideoService: mux as never,
      muxWebhookService: { unwrapWebhook: async (body: string) => JSON.parse(body) } as never }));

    folder = await mkdtemp(join(tmpdir(), 'rise-run-'));
    const file = async (name: string, bytes: string) => { await writeFile(join(folder, name), bytes); return join(folder, name); };
    const media = (componentId: string, fileName: string, contentType: string, path: string, bytes: string) =>
      ({ sectionId: 'L1', componentId, path, fileName, contentType, sizeBytes: bytes.length });
    plan = {
      course: { title: 'ISTQB Foundation repetition', description: 'Velkommen til kurset', teacher: 'Info TestHuset', level: 'Foundation' },
      sections: updateCourseContentSchema.parse({ sections: [{ id: 'L1', title: 'Grundlæggende', components: [
        { id: 'v1', type: 'video', title: '01.01' }, { id: 'p1', type: 'resources', title: 'Testværktøjer' },
        { id: 'v2', type: 'video', title: '01.02' },
        { id: 'k1', type: 'quiz', title: 'Videnstjek: 01.02', quiz: { passPoints: 1, questions: [{ id: 'q1', question: 'Hvilket?',
          answers: [{ id: 'a', text: 'Rigtig', isCorrect: true }, { id: 'b', text: 'Forkert', isCorrect: false }] }] } },
      ] }] }).sections,
      videos: [media('v1', 'one.mp4', 'video/mp4', await file('one.mp4', 'video-one'), 'video-one'),
        media('v2', 'two.mp4', 'video/mp4', await file('two.mp4', 'video-two'), 'video-two')],
      attachments: [media('p1', 'Testværktøjer.pdf', 'application/pdf', await file('tools.pdf', '%PDF-tools'), '%PDF-tools')],
      thumbnail: { path: await file('cover.jpg', 'jpeg'), fileName: 'cover.jpg', contentType: 'image/jpeg', sizeBytes: 4 },
      skipped: [], problems: [],
    };
  });

  afterEach(async () => {
    await Promise.all([api, uploads].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    await rm(folder, { recursive: true, force: true });
  });

  // A draft keeps its lessons and thumbnail in its review revision, which the author view returns.
  const authorView = async (courseId: string) => {
    const { token } = await (await fetch(`${apiUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teacher) })).json();
    return (await fetch(`${apiUrl}/courses/${courseId}/content?view=author`, { headers: { authorization: `Bearer ${token}` } })).json();
  };
  const saved = async (courseId: string) => (await authorView(courseId)).sections[0].components as CourseContentComponent[];

  it('US-T015-AC02 creates a draft owned by the teacher with lessons, attachments, thumbnail and Mux uploads', async () => {
    const owner = (await auth.findByEmail(teacher.email))!;

    const result = await runRiseImport(plan, { apiUrl, ...teacher });

    const course = (await courses.listCourses()).find((item) => item.id === result.courseId)!;
    expect(course).toMatchObject({ status: 'draft', ownerUserId: owner.id, title: plan.course.title, teacher: 'Info TestHuset', level: 'Foundation' });
    expect((await authorView(result.courseId)).review.course.thumbnailAssetId).not.toBe('');
    const components = await saved(result.courseId);
    expect(components.map((component) => [component.id, component.type, component.title])).toEqual(
      plan.sections[0].components.map((component) => [component.id, component.type, component.title]));
    expect(components.filter((component) => component.type === 'video').map((component) => 'mux' in component && component.mux?.uploadId))
      .toEqual([expect.stringMatching(/^upload-v1/), expect.stringMatching(/^upload-v2/)]);
    expect(components[1].attachments).toMatchObject([{ fileName: 'Testv-rkt-jer.pdf', contentType: 'application/pdf', sizeBytes: 10 }]);
    expect(received).toEqual([{ path: '/v1', bytes: 'video-one' }, { path: '/v2', bytes: 'video-two' }]);
    expect(result).toEqual({ courseId: course.id, videosUploaded: 2, attachmentsUploaded: 1 });
  });

  it('US-T015-AC04 resumes: no new course, uploads only the stalled video and nothing twice', async () => {
    let putsToMux = 0;
    const failSecondUpload: typeof fetch = async (input, init) => {
      if (String(input).startsWith(uploadUrl) && ++putsToMux === 2) throw new Error('network dropped');
      return fetch(input, init);
    };
    const failure = await runRiseImport(plan, { apiUrl, ...teacher, fetch: failSecondUpload }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: expect.stringMatching(/network dropped/), courseId: expect.any(String) });
    const courseId = (failure as { courseId: string }).courseId;
    expect((await saved(courseId))[0]).toMatchObject({ mux: { assetId: 'asset-v1', status: 'processing' } });
    const courseCount = (await courses.listCourses()).length;
    const requests: string[] = [];
    const recordRequests: typeof fetch = async (input, init) => { requests.push(`${init?.method ?? 'GET'} ${new URL(String(input)).pathname}`); return fetch(input, init); };

    const result = await runRiseImport(plan, { apiUrl, ...teacher, courseId, fetch: recordRequests });

    expect(result).toEqual({ courseId, videosUploaded: 1, attachmentsUploaded: 0 });
    expect((await courses.listCourses()).length).toBe(courseCount);
    expect(requests).not.toContain(`PATCH /courses/${courseId}/content`);
    expect(requests).toContain(`DELETE /courses/${courseId}/content/components/v2/mux-video`);
    expect(mux.createDirectUpload.mock.calls.map(([call]) => call.componentId)).toEqual(['v1', 'v2', 'v2']);
    expect(received.map((upload) => upload.path)).toEqual(['/v1', '/v2']);
    expect((await saved(courseId))[1].attachments).toHaveLength(1);
  });

  it('US-T015-AC04 resume uploads a thumbnail that failed the first time', async () => {
    const failThumbnail: typeof fetch = async (input, init) => {
      if (String(input).endsWith('/thumbnail')) throw new Error('network dropped');
      return fetch(input, init);
    };
    const failure = await runRiseImport(plan, { apiUrl, ...teacher, fetch: failThumbnail }).catch((error: unknown) => error) as { courseId: string };

    await runRiseImport(plan, { apiUrl, ...teacher, courseId: failure.courseId });

    expect((await authorView(failure.courseId)).review.course.thumbnailAssetId).not.toBe('');
  });

  it('stops after the first video when Mux never confirms it, before uploading the rest', async () => {
    muxConfirms = false;
    const waits: number[] = [];

    const failure = await runRiseImport(plan, { apiUrl, ...teacher, wait: async (ms) => { waits.push(ms); } }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ courseId: expect.any(String),
      message: 'Mux has not confirmed the first video after 2 minutes. Check the Mux webhook in the hosted API log, then resume.' });
    expect(received.map((upload) => upload.path)).toEqual(['/v1']);
    expect(waits.reduce((total, ms) => total + ms, 0)).toBe(120_000);
  });

  it('US-T015-AC05 stops on a student account or a wrong password and creates nothing', async () => {
    const before = (await courses.listCourses()).length;

    await expect(runRiseImport(plan, { apiUrl, email: 'student@qi-education.local', password: teacher.password })).rejects.toThrow(/^Create course: 403 /);
    await expect(runRiseImport(plan, { apiUrl, email: teacher.email, password: 'wrong' })).rejects.toThrow(/^Sign in: 401 /);
    expect((await courses.listCourses()).length).toBe(before);
  });
});
