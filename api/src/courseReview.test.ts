import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { createCourseSchema } from './course.js';
import { updateCourseContentSchema } from './courseContent.js';
import { learnerCourseContent } from './courseAccess.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

const metadata = createCourseSchema.parse({ title: 'Original reviewed course', description: 'Original published description.', teacher: 'Owner', level: 'Beginner' });
const sections = updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Lessons', components: [{ id: 'lesson', title: 'Original lesson', type: 'text', content: 'Original private body' }] }] }).sections;

describe.each(['', '/api'])('US-T002 review and uninterrupted revisions (%s)', (prefix) => {
  let server: Server, base: string, auth: InMemoryAuthRepository, courses: InMemoryCourseRepository,
    content: InMemoryCourseContentRepository, assets: InMemoryCourseAssetRepository;
  let teacher: AuthUser, admin: AuthUser, student: AuthUser, other: AuthUser;
  function start() {
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      courseAssetRepository: assets, feedbackRepository: new InMemoryFeedbackRepository(), muxVideoService: null,
      muxWebhookService: { unwrapWebhook: async body => JSON.parse(body) }, gitHubFeedbackService: { hasConfig: () => false } as never }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  function request(path: string, user?: AuthUser, method = 'GET', body?: unknown) {
    return fetch(base + prefix + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? {
      authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function author() {
    const response = await request('/courses/course/content?view=author', teacher);
    expect(response.status).toBe(200);
    return await response.json();
  }
  async function act(action: string, user = teacher, reason = '') {
    const state = (await author()).review;
    const response = await request('/courses/course/review', user, 'POST', {
      action, reason, revisionId: state ? state.revisionId : 'legacy-course', expectedVersion: state?.version ?? 0 });
    expect(response.status).toBe(200);
    return await response.json();
  }
  async function published() {
    const current = (await courses.listCourses()).find(course => course.id === 'course')!;
    await courses.updateCourse('course', { ...current, status: 'published' });
    student = (await auth.enrollUserInCourse(student.id, 'course'))!;
  }
  async function live() {
    const catalog = await (await request('/courses')).json();
    return catalog.find((course: { id: string }) => course.id === 'course');
  }
  beforeEach(async () => {
    auth = new InMemoryAuthRepository(); courses = new InMemoryCourseRepository();
    content = new InMemoryCourseContentRepository(); assets = new InMemoryCourseAssetRepository();
    teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    other = await auth.createUser({ ...teacher, id: 'other', email: 'other@example.test' });
    await courses.createCourse(metadata, { id: 'course', createdAt: '2026-10-09T00:00:00.000Z', ownerUserId: teacher.id });
    await content.updateCourseContent('course', sections); start();
  });
  afterEach(async () => { vi.restoreAllMocks(); await new Promise<void>(resolve => server.close(() => resolve())); });

  it('AC01/03/08 retains submission, return reason and publication after reopening the server', async () => {
    await act('submit');
    expect((await author()).review.course.status).toBe('ready-for-review');
    expect(await live()).toBeUndefined();
    await act('return', admin, 'Explain the practical exercise');
    expect((await author()).review.course.status).toBe('draft');
    await act('submit'); await act('publish', admin);
    await new Promise<void>(resolve => server.close(() => resolve())); start();
    const state = (await author()).review;
    expect(state.history.map((event: { action: string }) => event.action)).toEqual(['submit', 'return', 'submit', 'publish']);
    expect(state.history[1]).toMatchObject({ reason: 'Explain the practical exercise', actorId: admin.id, actorName: admin.displayName });
    expect(state.history[1].createdAt).toEqual(expect.any(String));
    expect(state.revisionId).toBeNull();
    expect((await live()).status).toBe('published');
    await act('start-revision'); await act('submit'); await act('publish', admin);
    await new Promise<void>(resolve => server.close(() => resolve())); start();
    const later = (await author()).review;
    expect(later.history.map((event: { action: string }) => event.action)).toEqual(['submit', 'return', 'submit', 'publish', 'start-revision', 'submit', 'publish']);
    expect(later.history[1].reason).toBe('Explain the practical exercise');
    expect(later.history[4].revisionId).not.toBe(later.history[0].revisionId);
  });

  it('AC07 keeps live metadata and lessons throughout editing, return and resubmission', async () => {
    await published(); await act('start-revision');
    expect((await request('/courses/course', teacher, 'PATCH', { ...metadata, title: 'Pending revision title' })).status).toBe(200);
    const revised = structuredClone(sections); revised[0].components[0].content = 'Pending private body';
    expect((await request('/courses/course/content', teacher, 'PATCH', { sections: revised })).status).toBe(200);
    for (const step of ['submit', 'return', 'submit']) {
      await act(step, step === 'return' ? admin : teacher, 'Please clarify');
      expect((await live()).title).toBe('Original reviewed course');
      const learner = await request('/courses/course/content', student);
      expect(learner.status).toBe(200); expect((await learner.json()).sections[0].components[0].content).toBe('Original private body');
    }
    await act('publish', admin);
    expect((await live()).title).toBe('Pending revision title');
    const learner = await (await request('/courses/course/content', student)).json();
    expect(learner.sections[0].components[0].content).toBe('Pending private body');
    expect(JSON.stringify(learner)).not.toContain('history');
    expect((await request('/users/me/courses/course', student, 'POST')).status).toBe(200);
  });

  it('AC04/06 requires a return reason and rejects stale decisions without replacing history', async () => {
    await act('submit'); const stale = (await author()).review;
    const invalid = await request('/courses/course/review', admin, 'POST', { action: 'return', reason: ' ', revisionId: stale.revisionId, expectedVersion: stale.version });
    expect(invalid.status).toBe(400);
    await act('return', admin, 'Correct the exercise');
    const response = await request('/courses/course/review', admin, 'POST', { action: 'publish', revisionId: stale.revisionId, expectedVersion: stale.version });
    expect(response.status).toBe(409);
    expect((await author()).review.history.map((event: { action: string }) => event.action)).toEqual(['submit', 'return']);
  });

  it('AC05 denies private history and decisions to learners and unrelated teachers', async () => {
    await act('submit');
    for (const user of [undefined, student, other]) {
      expect((await request('/courses/course/content?view=author', user)).status).toBe(user ? 403 : 401);
      expect((await request('/courses/course/review', user, 'POST', { action: 'publish', expectedVersion: 1, revisionId: 'forged' })).status).toBe(user ? 403 : 401);
    }
  });

  it('AC02 blocks admin creation/direct publication bypasses', async () => {
    expect((await request('/courses', admin, 'POST', { ...metadata, status: 'published' })).status).toBe(403);
    expect((await request('/courses/course', admin, 'PATCH', { ...metadata, status: 'published' })).status).toBe(409);
    expect(await live()).toBeUndefined();
  });

  it('AC01 rejects an empty outline but retains editable draft work', async () => {
    await content.updateCourseContent('course', []);
    const state = (await author()).review;
    expect((await request('/courses/course/review', teacher, 'POST', { action: 'submit', expectedVersion: state?.version ?? 0, revisionId: state ? state.revisionId : 'legacy-course' })).status).toBe(400);
    expect(await live()).toBeUndefined();
  });

  it('AC07 blocks live writes until a private revision exists and freezes submitted writes', async () => {
    await published();
    expect((await request('/courses/course/content', teacher, 'PATCH', { sections })).status).toBe(409);
    await act('start-revision'); await act('submit');
    for (const user of [teacher, admin]) {
      expect((await request('/courses/course/content', user, 'PATCH', { sections })).status).toBe(409);
      expect((await request('/courses/course', user, 'PATCH', metadata)).status).toBe(409);
    }
    expect((await request('/courses/course/content', student)).status).toBe(200);
  });

  it('AC07 preserves a live attachment removed from the revision', async () => {
    const asset = await assets.saveComponentAttachment({ courseId: 'course', componentId: 'lesson', contentType: 'text/plain', fileName: 'live.txt', binary: Buffer.from('live resource') });
    const attached = structuredClone(sections); attached[0].components[0].attachments = [{ id: 'attachment', assetId: asset._id, fileName: asset.fileName, contentType: asset.contentType, sizeBytes: asset.sizeBytes, createdAt: asset.createdAt }];
    await content.updateCourseContent('course', attached); await published(); await act('start-revision');
    expect((await request(`/courses/course/content/components/lesson/attachments/${asset._id}`, teacher, 'DELETE', { sectionId: 's' })).status).toBe(200);
    expect((await request(`/courses/course/content/attachments/${asset._id}`, student)).status).toBe(200);
    expect(await assets.getComponentAttachment(asset._id)).not.toBeNull();
    for (const user of [teacher, admin]) {
      expect((await (await request('/courses/course/content', user)).json()).sections[0].components[0].attachments[0].assetId).toBe(asset._id);
      expect((await request(`/courses/course/content/attachments/${asset._id}`, user)).status).toBe(200);
    }
  });

  it('AC06 retains live access and history when publication persistence fails', async () => {
    await published(); await act('start-revision'); await act('submit');
    const state = (await author()).review;
    const original = await content.getCourseContent('course');
    // Provider boundary failure; the implementation must expose an atomic workflow write.
    const writer = content as unknown as { saveCourseReview: (...args: unknown[]) => Promise<unknown> };
    if (writer.saveCourseReview) vi.spyOn(writer, 'saveCourseReview').mockRejectedValueOnce(new Error('Store unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request('/courses/course/review', admin, 'POST', { action: 'publish', expectedVersion: state.version, revisionId: state.revisionId });
    expect(response.status).toBe(500);
    expect(await content.getCourseContent('course')).toEqual(original);
    expect((await request('/courses/course/content', student)).status).toBe(200);
  });
  it('AC07 serves pending thumbnails only to authors and retains the old live asset', async () => {
    const original = await assets.saveThumbnail({ courseId: 'course', contentType: 'image/png', fileName: 'old.png', binary: Buffer.from('original image') });
    await courses.updateCourseThumbnail('course', { thumbnailAssetId: original._id }); await published(); await act('start-revision');
    const response = await fetch(base + prefix + '/courses/course/thumbnail', { method: 'PUT', headers: { 'Content-Type': 'image/png', authorization: `Bearer ${createSessionToken(toAuthenticatedUser(teacher), apiConfig.AUTH_TOKEN_SECRET!)}` }, body: Buffer.from('pending image') });
    expect(response.status).toBe(200); const pending = await response.json();
    expect(await (await request('/courses/course/thumbnail')).text()).toBe('original image');
    const preview = await request(`/courses/course/thumbnail?v=${pending.thumbnailAssetId}`, teacher);
    expect(preview.status).toBe(200); expect(await preview.text()).toBe('pending image');
    expect((await request(`/courses/course/thumbnail?v=${pending.thumbnailAssetId}`, student)).status).toBe(404);
    expect(await assets.getThumbnail(original._id)).not.toBeNull();
  });

  it('AC07 updates only matching media snapshots and ignores a late superseded callback', async () => {
    const video = updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Videos', components: [{ id: 'video', type: 'video', title: 'Video', mux: { uploadId: 'live-upload', assetId: 'live-asset', playbackId: 'live-playback', status: 'ready' } }] }] }).sections;
    await content.updateCourseContent('course', video); await published(); await act('start-revision');
    const revised = structuredClone(video); const component = revised[0].components[0];
    if (component.type !== 'video') throw new Error('Missing video fixture');
    component.mux = { ...component.mux!, uploadId: 'pending-upload', assetId: 'pending-asset', playbackId: '', status: 'processing' };
    expect((await request('/courses/course/content', teacher, 'PATCH', { sections: revised })).status).toBe(200);
    const webhook = (id: string, upload_id?: string) => request('/webhooks/mux', undefined, 'POST', { type: 'video.asset.ready', data: { id, upload_id,
      passthrough: JSON.stringify({ c: 'course', s: 's', m: 'video' }), playback_ids: [{ id: 'pending-playback', policy: 'public' }] } });
    expect((await webhook('pending-asset', 'pending-upload')).status).toBe(200);
    expect((await author()).sections[0].components[0].mux).toMatchObject({ uploadId: 'pending-upload', status: 'ready', playbackId: 'pending-playback' });
    const before = (await author()).review.version;
    expect((await webhook('pending-asset', 'pending-upload')).status).toBe(200);
    expect((await author()).review.version).toBe(before);
    expect((await webhook('superseded-asset')).status).toBe(200);
    expect((await author()).review.version).toBe(before);
    expect((await (await request('/courses/course/content', student)).json()).sections[0].components[0].mux.playbackId).toBe('live-playback');
  });

  it('AC07 starts an admin revision for legacy published metadata without a content document', async () => {
    await published(); await content.deleteCourseContent('course');
    const response = await request('/courses/course/content?view=author', admin);
    expect(response.status).toBe(200); const state = (await response.json()).review;
    const started = await request('/courses/course/review', admin, 'POST', { action: 'start-revision', expectedVersion: state.version, revisionId: state.revisionId });
    expect(started.status).toBe(200); expect((await live()).status).toBe('published');
  });

  it('AC01 returns structured quiz readiness issues and preserves the draft', async () => {
    const incomplete = updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Assessment', components: [{ id: 'quiz', title: 'Practice quiz', type: 'quiz', quiz: { questions: [] } }] }] }).sections;
    await content.updateCourseContent('course', incomplete);
    const state = (await author()).review;
    const response = await request('/courses/course/review', teacher, 'POST', { action: 'submit', expectedVersion: state.version, revisionId: state.revisionId });
    expect(response.status).toBe(400);
    expect((await response.json()).issues).toEqual(expect.arrayContaining([expect.objectContaining({ sectionId: 's', componentId: 'quiz', message: expect.stringContaining('Add at least one question') })]));
    expect((await author()).review.course.status).toBe('draft');
    expect((await author()).review.history).toEqual([]);
  });

  it('AC05 omits private workflow at the learner DTO boundary', async () => {
    await published(); await act('start-revision'); await act('submit'); await act('return', admin, 'Private review reason');
    const stored = await content.getCourseContent('course');
    expect(stored?.review?.history.length).toBeGreaterThan(0);
    expect(learnerCourseContent(stored!)).not.toHaveProperty('review');
  });

  it.each(['metadata', 'content', 'thumbnail', 'media'])('AC06 invalidates an initial draft decision after %s edits', async (kind) => {
    if (kind === 'media') await content.updateCourseContent('course', updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Videos', components: [{ id: 'video', type: 'video', title: 'Pending video', mux: { uploadId: 'upload', assetId: 'asset', status: 'processing' } }] }] }).sections);
    const stale = (await author()).review;
    if (kind === 'metadata') expect((await request('/courses/course', teacher, 'PATCH', { ...metadata, title: 'New initial draft title' })).status).toBe(200);
    else if (kind === 'content') expect((await request('/courses/course/content', teacher, 'PATCH', { sections })).status).toBe(200);
    else if (kind === 'thumbnail') expect((await fetch(base + prefix + '/courses/course/thumbnail', { method: 'PUT', headers: { 'Content-Type': 'image/png', authorization: `Bearer ${createSessionToken(toAuthenticatedUser(teacher), apiConfig.AUTH_TOKEN_SECRET!)}` }, body: Buffer.from('new thumbnail') })).status).toBe(200);
    else expect((await request('/webhooks/mux', undefined, 'POST', { type: 'video.asset.ready', data: { id: 'asset', upload_id: 'upload', passthrough: JSON.stringify({ c: 'course', s: 's', m: 'video' }), playback_ids: [{ id: 'playback', policy: 'public' }] } })).status).toBe(200);
    const response = await request('/courses/course/review', teacher, 'POST', { action: 'submit', expectedVersion: stale.version, revisionId: stale.revisionId });
    expect(response.status).toBe(409);
    expect((await author()).review.course.status).toBe('draft');
    if (kind === 'metadata') expect((await author()).review.course.title).toBe('New initial draft title');
  });

  it('AC07 attachment uploads preserve pending lessons and frozen uploads have no side effects', async () => {
    await published(); await act('start-revision');
    const revised = structuredClone(sections); revised[0].components[0].content = 'Pending lesson body';
    revised[0].components.push({ ...structuredClone(revised[0].components[0]), id: 'new-private-lesson', title: 'New private lesson' });
    expect((await request('/courses/course/content', teacher, 'PATCH', { sections: revised })).status).toBe(200);
    const upload = (componentId = 'lesson') => fetch(base + prefix + `/courses/course/content/components/${componentId}/attachments`, {
      method: 'PUT', headers: { 'Content-Type': 'text/plain', 'x-section-id': 's', 'x-file-name': 'notes.txt', authorization: `Bearer ${createSessionToken(toAuthenticatedUser(teacher), apiConfig.AUTH_TOKEN_SECRET!)}` }, body: Buffer.from('Private resource') });
    expect((await upload('new-private-lesson')).status).toBe(201);
    expect((await upload()).status).toBe(201);
    expect((await author()).sections[0].components[0].content).toBe('Pending lesson body');
    expect((await (await request('/courses/course/content', student)).json()).sections[0].components[0].content).toBe('Original private body');
    await act('submit'); const writer = vi.spyOn(assets, 'saveComponentAttachment');
    expect((await upload()).status).toBe(409); expect(writer).not.toHaveBeenCalled();
  });

  it('AC07 ignores delayed processing events after the live video is ready', async () => {
    const video = updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Videos', components: [{ id: 'video', type: 'video', title: 'Ready video', mux: { uploadId: 'live-upload', assetId: 'live-asset', playbackId: 'live-playback', status: 'ready' } }] }] }).sections;
    await content.updateCourseContent('course', video); await published(); await act('start-revision');
    const before = (await author()).review.version;
    expect((await request('/webhooks/mux', undefined, 'POST', { type: 'video.upload.asset_created', data: {
      id: 'live-upload', asset_id: 'live-asset', new_asset_settings: { passthrough: JSON.stringify({ c: 'course', s: 's', m: 'video' }) } } })).status).toBe(200);
    expect((await (await request('/courses/course/content', student)).json()).sections[0].components[0].mux.status).toBe('ready');
    expect((await author()).sections[0].components[0].mux.status).toBe('ready');
    expect((await author()).review.version).toBe(before);
  });

});
