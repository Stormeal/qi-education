import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { createCourseSchema, courseFromSheetRow, courseToSheetRow } from './course.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { updateCourseContentSchema } from './courseContent.js';
import { createServer } from './server.js';

const metadata = {
  title: 'Ownership regression course', description: 'A course for isolated permission checks.',
  teacher: 'Same display name', level: 'Beginner', status: 'draft',
};
const outline = updateCourseContentSchema.parse({ sections: [{
  id: 'section-1', title: 'Introduction', components: [
    { id: 'text-1', type: 'text', title: 'Notes' },
    { id: 'video-1', type: 'video', title: 'Video' },
  ],
}] });
const operations = [
  { method: 'PATCH', path: '', body: JSON.stringify({ ...metadata, title: 'Changed title' }) },
  { method: 'PATCH', path: '/content', body: JSON.stringify({ sections: [] }) },
  { method: 'PUT', path: '/thumbnail', body: 'image', type: 'image/png' },
  { method: 'PUT', path: '/content/components/text-1/attachments', body: 'notes', type: 'text/plain' },
  { method: 'DELETE', path: '/content/components/text-1/attachments/asset-1', body: '{"sectionId":"section-1"}' },
  { method: 'POST', path: '/content/components/video-1/mux-upload', body: '{"sectionId":"section-1"}' },
  { method: 'DELETE', path: '/content/components/video-1/mux-video', body: '{"sectionId":"section-1"}' },
];

describe('course authoring ownership (DEF-001)', () => {
  let server: Server;
  let baseUrl: string;
  let auth: InMemoryAuthRepository;
  let courses: InMemoryCourseRepository;
  let content: InMemoryCourseContentRepository;
  let assets: InMemoryCourseAssetRepository;
  let owner: AuthUser;
  let otherTeacher: AuthUser;
  let admin: AuthUser;
  let student: AuthUser;
  let writes: ReturnType<typeof vi.spyOn>[];
  const mux = { createDirectUpload: vi.fn(async () => ({
    uploadId: 'upload-1', uploadUrl: 'https://uploads.example.test/1', playbackPolicy: 'public' as const,
  })) };

  beforeEach(async () => {
    auth = new InMemoryAuthRepository();
    courses = new InMemoryCourseRepository();
    content = new InMemoryCourseContentRepository();
    assets = new InMemoryCourseAssetRepository();
    owner = (await auth.findByEmail('teacher@qi-education.local'))!;
    owner.displayName = 'Same display name';
    otherTeacher = await auth.createUser({ ...owner, id: 'teacher-b', email: 'teacher-b@example.test' });
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    const course = await courses.createCourse(createCourseSchema.parse(metadata), {
      id: 'owned-course', createdAt: '2026-10-04T00:00:00.000Z',
    });
    // A persisted owner fixture allows authorization tests to isolate the gate
    // independently of the separate creation/persistence regression tests.
    Object.assign(course, { ownerUserId: owner.id });
    await courses.createCourse(createCourseSchema.parse({ ...metadata, title: 'Other teacher course' }), {
      id: 'other-course', createdAt: '2026-10-04T00:00:00.000Z', ownerUserId: otherTeacher.id,
    });
    await content.updateCourseContent(course.id, outline.sections);
    writes = [vi.spyOn(courses, 'createCourse'), vi.spyOn(content, 'createEmptyCourseContent'),
      vi.spyOn(courses, 'updateCourse'), vi.spyOn(courses, 'updateCourseThumbnail'),
      vi.spyOn(content, 'updateCourseContent'), vi.spyOn(assets, 'saveThumbnail'),
      vi.spyOn(assets, 'saveComponentAttachment'), vi.spyOn(assets, 'deleteAsset')];
    mux.createDirectUpload.mockClear();
    server = createServer({ authRepository: auth, courseRepository: courses,
      courseContentRepository: content, courseAssetRepository: assets, muxVideoService: mux,
    }).listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function headers(user?: AuthUser, type = 'application/json') {
    return { 'Content-Type': type, 'X-Section-Id': 'section-1', 'X-File-Name': 'notes.txt',
      ...(user ? { authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}` } : {}),
    };
  }

  it.each([['teacher', ''], ['admin', '/api']] as const)('assigns the authenticated %s as owner and ignores forged ownership', async (role, prefix) => {
    const user = role === 'teacher' ? owner : admin;
    const response = await fetch(`${baseUrl}${prefix}/courses`, {
      method: 'POST', headers: headers(user), body: JSON.stringify({ ...metadata, ownerUserId: otherTeacher.id }),
    });
    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created.ownerUserId).toBe(user.id);
    expect((await courses.listCourses()).find((course) => course.id === created.id)).toMatchObject({ ownerUserId: user.id });
    expect(courseFromSheetRow(courseToSheetRow(created))).toMatchObject({ ownerUserId: user.id });
  });

  for (const prefix of ['', '/api']) {
    async function foreignAttachmentFixture() {
      const foreign = await assets.saveComponentAttachment({ courseId: 'other-course', componentId: 'text-b',
        contentType: 'text/plain', fileName: 'foreign.txt', binary: Buffer.from('Other teacher resource'),
      });
      const forged = structuredClone(outline);
      forged.sections[0].components[0].attachments = [{ id: foreign._id, assetId: foreign._id,
        contentType: foreign.contentType, fileName: foreign.fileName, sizeBytes: foreign.sizeBytes, createdAt: foreign.createdAt,
      }];
      for (const write of writes) write.mockClear();
      return { foreign, forged };
    }

    it(`rejects foreign attachment bindings through ${prefix || 'standard'} content saves`, async () => {
      const { foreign, forged } = await foreignAttachmentFixture();
      const before = await content.getCourseContent('owned-course');
      const response = await fetch(`${baseUrl}${prefix}/courses/owned-course/content`, {
        method: 'PATCH', headers: headers(owner), body: JSON.stringify(forged),
      });
      expect(response.status).toBe(403);
      expect(await content.getCourseContent('owned-course')).toEqual(before);
      expect(await assets.getComponentAttachment(foreign._id)).not.toBeNull();
      for (const write of writes) expect(write).not.toHaveBeenCalled();
    });

    it(`cannot delete foreign assets through an existing forged reference on ${prefix || 'standard'} routes`, async () => {
      const { foreign, forged } = await foreignAttachmentFixture();
      await content.updateCourseContent('owned-course', forged.sections);
      for (const write of writes) write.mockClear();
      const response = await fetch(`${baseUrl}${prefix}/courses/owned-course/content/components/text-1/attachments/${foreign._id}`, {
        method: 'DELETE', headers: headers(owner), body: '{"sectionId":"section-1"}',
      });
      expect(response.status).toBe(403);
      expect(await assets.getComponentAttachment(foreign._id)).not.toBeNull();
      for (const write of writes) expect(write).not.toHaveBeenCalled();
    });

    it(`rejects assigning an existing thumbnail on ${prefix || 'standard'} course creation`, async () => {
      const foreign = await assets.saveThumbnail({ courseId: 'other-course', contentType: 'image/png', fileName: 'foreign.png', binary: Buffer.from('Other teacher image') });
      for (const write of writes) write.mockClear();
      const response = await fetch(`${baseUrl}${prefix}/courses`, { method: 'POST', headers: headers(owner),
        body: JSON.stringify({ ...metadata, thumbnailAssetId: foreign._id }),
      });
      expect(response.status).toBe(403);
      expect(await assets.getThumbnail(foreign._id)).not.toBeNull();
      for (const write of writes) expect(write).not.toHaveBeenCalled();
    });

    it(`preserves foreign assets while replacing an old invalid thumbnail reference on ${prefix || 'standard'} routes`, async () => {
      const foreign = await assets.saveThumbnail({ courseId: 'other-course', contentType: 'image/png', fileName: 'foreign.png', binary: Buffer.from('Other teacher image') });
      await courses.updateCourseThumbnail('owned-course', { thumbnailAssetId: foreign._id });
      const response = await fetch(`${baseUrl}${prefix}/courses/owned-course/thumbnail`, {
        method: 'PUT', headers: headers(owner, 'image/png'), body: 'New owner image',
      });
      expect(response.status).toBe(200);
      expect(await assets.getThumbnail(foreign._id)).not.toBeNull();
      const course = await response.json();
      expect(course.thumbnailAssetId).not.toBe(foreign._id);
      expect(await assets.getThumbnail(course.thumbnailAssetId)).toMatchObject({ courseId: 'owned-course' });
    });

    it.each(operations)(`denies another teacher's $method ${prefix}/courses/:id$path before any write or Mux call`, async (operation) => {
      const before = JSON.stringify({ courses: await courses.listCourses(), content: await content.getCourseContent('owned-course') });
      const response = await fetch(`${baseUrl}${prefix}/courses/owned-course${operation.path}`, {
        method: operation.method, headers: headers(otherTeacher, operation.type), body: operation.body,
      });
      expect(response.status).toBe(403);
      expect(JSON.stringify({ courses: await courses.listCourses(), content: await content.getCourseContent('owned-course') })).toBe(before);
      for (const write of writes) expect(write).not.toHaveBeenCalled();
      expect(mux.createDirectUpload).not.toHaveBeenCalled();
    });

    it.each(['owner', 'admin'] as const)(`allows %s to perform all authoring operations through ${prefix || 'standard'} routes`, async (role) => {
      const user = role === 'owner' ? owner : admin;
      const url = `${baseUrl}${prefix}/courses/owned-course`;
      const updated = await fetch(url, { method: 'PATCH', headers: headers(user),
        body: JSON.stringify({ ...metadata, teacher: 'Renamed instructor', ownerUserId: otherTeacher.id }),
      });
      expect(updated.status).toBe(200);
      expect(await updated.json()).toMatchObject({ ownerUserId: owner.id, teacher: 'Renamed instructor' });
      expect((await fetch(`${url}/content`, { method: 'PATCH', headers: headers(user), body: JSON.stringify(outline) })).status).toBe(200);
      expect((await fetch(`${url}/thumbnail`, { method: 'PUT', headers: headers(user, 'image/png'), body: 'image' })).status).toBe(200);
      const attachmentResponse = await fetch(`${url}/content/components/text-1/attachments`, {
        method: 'PUT', headers: headers(user, 'text/plain'), body: 'notes',
      });
      expect(attachmentResponse.status).toBe(201);
      const attachment = (await attachmentResponse.json()).attachment;
      expect(await assets.getComponentAttachment(attachment.assetId)).not.toBeNull();
      expect((await fetch(`${url}/content/components/text-1/attachments/${attachment.assetId}`, {
        method: 'DELETE', headers: headers(user), body: '{"sectionId":"section-1"}',
      })).status).toBe(200);
      expect(await assets.getComponentAttachment(attachment.assetId)).toBeNull();
      expect((await fetch(`${url}/content/components/video-1/mux-upload`, { method: 'POST',
        headers: headers(user), body: '{"sectionId":"section-1"}',
      })).status).toBe(201);
      expect((await content.getCourseContent('owned-course'))?.sections[0].components[1]).toMatchObject({ mux: { uploadId: 'upload-1' } });
      expect((await fetch(`${url}/content/components/video-1/mux-video`, { method: 'DELETE',
        headers: headers(user), body: '{"sectionId":"section-1"}',
      })).status).toBe(200);
      expect((await content.getCourseContent('owned-course'))?.sections[0].components[1]).not.toHaveProperty('mux');
    });
  }

  it('keeps legacy courses admin-editable only', async () => {
    const request = (user: AuthUser) => fetch(`${baseUrl}/courses/demo-course-1`, {
      method: 'PATCH', headers: headers(user), body: JSON.stringify(metadata),
    });
    expect((await request(owner)).status).toBe(403);
    const preview = await fetch(`${baseUrl}/courses/demo-course-1/content?view=author`, { headers: headers(admin) });
    const state = (await preview.json()).review;
    const revision = await fetch(`${baseUrl}/courses/demo-course-1/review`, { method: 'POST', headers: headers(admin),
      body: JSON.stringify({ action: 'start-revision', expectedVersion: state.version, revisionId: state.revisionId }) });
    expect(revision.status).toBe(200);
    const response = await request(admin);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ownerUserId: '' });
  });

  it.each(operations)('preserves authentication and missing-course boundaries for $method $path', async (operation) => {
    const request = (id: string, user?: AuthUser) => fetch(`${baseUrl}/courses/${id}${operation.path}`, {
      method: operation.method, headers: headers(user, operation.type), body: operation.body,
    });
    expect((await request('owned-course')).status).toBe(401);
    expect((await request('owned-course', student)).status).toBe(403);
    expect((await request('missing-course', owner)).status).toBe(404);
    owner.status = 'disabled';
    expect((await request('owned-course', owner)).status).toBe(401);
    for (const write of writes) expect(write).not.toHaveBeenCalled();
    expect(mux.createDirectUpload).not.toHaveBeenCalled();
  });

  it('reads a legacy 20-column row without guessing ownership from the teacher label', () => {
    const row = ['legacy', 'Legacy Course', 'Description', 'Beginner', 'Same display name', '',
      'draft', '2026-10-04T00:00:00.000Z', '', '', '', '', '', '', 'FALSE', 'FALSE', '0', '0', 'Uncategorized', 'English'];
    expect(courseFromSheetRow(row)).toMatchObject({ ownerUserId: '' });
    row.push(owner.id);
    expect(courseFromSheetRow(row)).toMatchObject({ ownerUserId: owner.id });
    expect(courseToSheetRow(courseFromSheetRow(row))[20]).toBe(owner.id);
  });
});
