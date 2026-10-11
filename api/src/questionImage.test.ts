import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { apiConfig } from './config.js';
import { createCourseSchema } from './course.js';
import { learnerCourseContent, courseOutline } from './courseAccess.js';
import { InMemoryCourseAssetRepository, MongoCourseAssetRepository } from './courseAssetRepository.js';
import { updateCourseContentSchema, type CourseContentSection } from './courseContent.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import type { CourseContentDocument } from './courseContentRepository.js';
import type { CourseReviewState } from './courseReview.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryInstructorProfileRepository } from './instructorProfileRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { assessmentIssues } from './quizAssessment.js';
import { createServer } from './server.js';

const question = () => ({ id: 'q', question: 'What is pictured?', points: 1, explanation: 'Private reason',
  answers: [{ id: 'yes', text: 'Correct', description: 'Private answer', isCorrect: true },
    { id: 'no', text: 'Wrong', description: '', isCorrect: false }] });
const outline = () => [{ id: 'section', title: 'Chapter', components: [
  { id: 'quiz', title: 'Quiz', type: 'quiz', quiz: { passPoints: 1, questions: [question()] } },
  { id: 'other', title: 'Other quiz', type: 'quiz', quiz: { passPoints: 1, questions: [question()] } },
  { id: 'text', title: 'Text', type: 'text' }, { id: 'resources', title: 'Resources', type: 'resources' },
  { id: 'video', title: 'Video', type: 'video' },
] }];
type FixtureQuestion = ReturnType<typeof question> & { image?: { assetId: string; alt: string } | null };
const imageQuestion = (sections: readonly { components: readonly { quiz?: { questions: FixtureQuestion[] } }[] }[]) =>
  sections[0].components[0].quiz!.questions[0];

describe('US-T014 model and storage metadata', () => {
  it('AC01/05 defaults a legacy save to null and trims alt at the 300 boundary', () => {
    const raw = outline();
    expect(imageQuestion(updateCourseContentSchema.parse({ sections: raw }).sections).image).toBeNull();
    Object.assign(imageQuestion(raw), { image: { assetId: ' asset ', alt: ` ${'a'.repeat(300)} ` } });
    const saved = imageQuestion(updateCourseContentSchema.parse({ sections: raw }).sections);
    expect(saved.image).toEqual({ assetId: 'asset', alt: 'a'.repeat(300) });
  });
  it.each(['a'.repeat(301), 5, null])('AC04 rejects invalid alt %j', alt => {
    const raw = outline(); Object.assign(imageQuestion(raw), { image: { assetId: 'asset', alt } });
    expect(updateCourseContentSchema.safeParse({ sections: raw }).success).toBe(false);
  });
  it('AC05 whitelists image fields, normalizes legacy learner output and keeps outlines clean', () => {
    const raw = outline();
    Object.assign(imageQuestion(raw), { image: { assetId: 'asset', alt: 'Diagram', secret: 'Hidden' } });
    const document = { _id: 'course', sections: raw as CourseContentSection[], createdAt: 'date', updatedAt: 'date' };
    const learner = learnerCourseContent(document);
    expect(imageQuestion(learner.sections).image).toEqual({ assetId: 'asset', alt: 'Diagram' });
    expect(imageQuestion([{ components: [learner.sections[0].components[1]] }]).image).toBeNull();
    const serialized = JSON.stringify(learner);
    for (const secret of ['isCorrect', 'Private', 'secret', 'Hidden']) expect(serialized).not.toContain(secret);
    expect(JSON.stringify(courseOutline(document))).not.toContain('image');
  });
  it('AC01 has no image/alt readiness requirement', () => {
    const sections = updateCourseContentSchema.parse({ sections: outline() }).sections;
    Object.assign(imageQuestion(sections), { image: { assetId: 'asset', alt: '' } });
    expect(assessmentIssues(sections, true)).toEqual([]);
  });
  it('AC04 projects stored image MIME and component ownership without binary', async () => {
    const findOne = vi.fn().mockResolvedValue({ courseId: 'course', componentId: 'quiz', contentType: 'image/png' });
    const repository = new MongoCourseAssetRepository(async () => ({ findOne, insertOne: vi.fn(), deleteOne: vi.fn() }) as never);
    expect(await repository.getComponentAttachmentMetadata('asset')).toEqual({ courseId: 'course', componentId: 'quiz', contentType: 'image/png' });
    expect(findOne).toHaveBeenCalledWith({ _id: 'asset', componentId: { $exists: true } },
      { projection: { _id: 0, courseId: 1, componentId: 1, contentType: 1 } });
  });
});

describe.each(['', '/api'])('US-T014 isolated HTTP (%s)', prefix => {
  let server: Server, base: string, owner: AuthUser, student: AuthUser, outsider: AuthUser, admin: AuthUser;
  let auth: InMemoryAuthRepository, courses: InMemoryCourseRepository, content: InMemoryCourseContentRepository, assets: InMemoryCourseAssetRepository;
  beforeEach(async () => {
    auth = new InMemoryAuthRepository(); courses = new InMemoryCourseRepository(); content = new InMemoryCourseContentRepository(); assets = new InMemoryCourseAssetRepository();
    owner = (await auth.findByEmail('teacher@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    outsider = await auth.createUser({ ...student, id: 'outsider', email: 'outsider@example.test', enrolledCourseIds: [] });
    await auth.enrollUserInCourse(student.id, 'course');
    await courses.createCourse(createCourseSchema.parse({ title: 'Question pictures', description: 'Isolated question image tests', teacher: 'Teacher', level: 'Beginner', status: 'draft' }), { id: 'course', ownerUserId: owner.id });
    await content.createEmptyCourseContent('course');
    await content.updateCourseContent('course', updateCourseContentSchema.parse({ sections: outline() }).sections);
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content, courseAssetRepository: assets,
      feedbackRepository: new InMemoryFeedbackRepository(), careerPathRepository: new InMemoryCareerPathRepository(),
      learningProgressRepository: new InMemoryLearningProgressRepository(), instructorProfileRepository: new InMemoryInstructorProfileRepository(),
      gitHubFeedbackService: { async createIssueFromFeedback() { throw new Error('No shared services'); } }, muxVideoService: null, muxWebhookService: null }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  function request(path: string, user: AuthUser | null = owner, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    return fetch(base + prefix + path, { method, headers: { 'Content-Type': 'application/json',
      ...(user ? { authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}` } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function author(user = owner): Promise<CourseContentDocument & { review: CourseReviewState }> {
    const response = await request('/courses/course/content?view=author', user);
    expect(response.status).toBe(200); return response.json();
  }
  async function revision() { const { review } = await author(); return JSON.stringify({ version: review.version, revisionId: review.revisionId }); }
  async function save(sections: unknown[]) {
    return request('/courses/course/content', owner, 'PATCH', { sections }, { 'X-Course-Revision': await revision() });
  }
  async function upload(type = 'image/png', componentId = 'quiz', bytes = Buffer.from('image-bytes')) {
    return fetch(base + prefix + `/courses/course/content/components/${componentId}/attachments`, { method: 'PUT', headers: {
      authorization: `Bearer ${createSessionToken(toAuthenticatedUser(owner), apiConfig.AUTH_TOKEN_SECRET!)}`,
      'Content-Type': type, 'X-Section-Id': 'section', 'X-File-Name': 'picture.png', 'X-Course-Revision': await revision(),
    }, body: bytes });
  }
  async function seedAttachment(courseId = 'course', componentId = 'quiz', contentType = 'image/png') {
    const asset = await assets.saveComponentAttachment({ courseId, componentId, contentType, fileName: 'fixture.png', binary: Buffer.from('image-bytes') });
    return { id: 'ref-' + asset._id, assetId: asset._id, contentType, fileName: asset.fileName, sizeBytes: asset.sizeBytes, createdAt: asset.createdAt };
  }
  async function attach() {
    const response = await upload(); expect(response.status).toBe(201);
    const { attachment, content: saved } = await response.json();
    imageQuestion(saved.sections).image = { assetId: attachment.assetId, alt: '  Diagram  ' };
    const patched = await save(saved.sections); expect(patched.status).toBe(200);
    return attachment;
  }
  async function act(action: string, user = owner) {
    const { review } = await author(user);
    return request('/courses/course/review', user, 'POST', { action, expectedVersion: review.version, revisionId: review.revisionId, reason: '' });
  }
  async function publish() {
    expect((await act('submit')).status).toBe(200); expect((await act('publish', admin)).status).toBe(200);
  }
  function download(assetId: string, user: AuthUser | null) { return request(`/courses/course/content/attachments/${assetId}`, user); }
  async function remove(assetId: string) {
    return request(`/courses/course/content/components/quiz/attachments/${assetId}`, owner, 'DELETE', { sectionId: 'section' }, { 'X-Course-Revision': await revision() });
  }

  it.each(['image/jpeg', 'image/png', 'image/webp'])('AC03 accepts quiz upload %s with the unchanged envelope', async type => {
    const response = await upload(type); expect(response.status).toBe(201);
    const result = await response.json();
    expect(Object.keys(result).sort()).toEqual(['attachment', 'content']);
    expect(result.attachment).toMatchObject({ contentType: type, sizeBytes: 11 });
    expect(result.content.sections[0].components[0].attachments).toEqual([result.attachment]);
  });
  it.each(['image/gif', 'image/svg+xml', 'application/pdf', 'text/plain'])('AC03 rejects %s for quiz only', async type => {
    const response = await upload(type); expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ message: expect.any(String) });
    expect((await author()).sections[0].components[0].attachments).toEqual([]);
  });
  it('AC03 keeps other lesson MIME rules and the 4 MB limit', async () => {
    expect((await upload('image/gif', 'text')).status).toBe(201);
    expect((await upload('application/pdf', 'resources')).status).toBe(201);
    expect((await upload('image/png', 'video')).status).toBe(404);
    const tooLarge = await upload('image/png', 'quiz', Buffer.alloc(4 * 1024 * 1024 + 1));
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toEqual({ message: expect.stringContaining('4 MB') });
  });
  it('AC01/05 saves/reopens trimmed image and an omission stores null', async () => {
    const attachment = await attach();
    const saved = await author();
    expect(imageQuestion(saved.sections).image).toEqual({ assetId: attachment.assetId, alt: 'Diagram' });
    delete imageQuestion(saved.sections).image;
    const cleared = await save(saved.sections); expect(cleared.status).toBe(200);
    expect(imageQuestion((await cleared.json()).sections).image).toBeNull();
  });
  it.each(['missing', 'other-lesson', 'other-course', 'non-image', 'not-attached', 'forged-mime'])('AC04 rejects %s reference before writing content', async kind => {
    const attachment = await seedAttachment(kind === 'other-course' ? 'foreign' : 'course', kind === 'other-lesson' ? 'other' : 'quiz', ['non-image', 'forged-mime'].includes(kind) ? 'application/pdf' : 'image/png');
    const before = await content.getCourseContent('course');
    const draft = await author();
    const assetId = kind === 'missing' ? 'does-not-exist' : attachment.assetId;
    draft.sections[0].components[0].attachments = kind === 'not-attached' ? [] : [{ ...attachment, assetId, ...(kind === 'forged-mime' ? { contentType: 'image/png' } : {}) }];
    imageQuestion(draft.sections).image = { assetId, alt: '' };
    const result = await save(draft.sections); expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ message: expect.stringContaining('Question 1:') });
    expect(await content.getCourseContent('course')).toEqual(before);
  });
  it.each(['a'.repeat(301), 9])('AC04 rejects invalid alt %j with only a Question N message, retaining previous content', async alt => {
    await attach(); const before = await content.getCourseContent('course'); const draft = await author();
    Object.assign(imageQuestion(draft.sections).image!, { alt });
    const response = await save(draft.sections); expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: expect.stringContaining('Question 1:') });
    expect(await content.getCourseContent('course')).toEqual(before);
  });
  it('AC02/05/06 publishes images, hides answers/outlines and serves only entitled downloads', async () => {
    const attachment = await attach();
    expect((await download(attachment.assetId, owner)).status).toBe(200);
    expect((await download(attachment.assetId, student)).status).toBe(403);
    await publish();
    const learned = await request('/courses/course/content', student); expect(learned.status).toBe(200);
    const learner = await learned.json();
    expect(imageQuestion(learner.sections).image).toEqual({ assetId: attachment.assetId, alt: 'Diagram' });
    for (const hidden of ['isCorrect', 'Private reason', 'Private answer']) expect(JSON.stringify(learner)).not.toContain(hidden);
    const publicOutline = await request('/courses/course/outline', null);
    expect(publicOutline.status).toBe(200); expect(JSON.stringify(await publicOutline.json())).not.toContain('image');
    for (const user of [owner, student, admin]) {
      const bytes = await download(attachment.assetId, user); expect(bytes.status).toBe(200);
      expect(bytes.headers.get('content-type')).toBe('image/png'); expect(bytes.headers.get('content-length')).toBe('11');
      expect(await bytes.text()).toBe('image-bytes');
    }
    expect((await download(attachment.assetId, outsider)).status).toBe(403);
    expect((await download(attachment.assetId, null)).status).toBe(401);
    for (const path of ['/courses/course/content/components/quiz/quiz-attempts', '/users/me/learning-progress/course/components/quiz/quiz-attempts']) {
      const scored = await request(path, student, 'POST', { sectionId: 'section', answers: [{ questionId: 'q', answerIds: ['yes'] }] });
      expect(scored.status).toBe(200); expect(await scored.json()).toMatchObject({ score: 1, passed: true });
    }
  });
  it('AC02 clears every referencing question in one write and preserves other data', async () => {
    const attachment = await attach(); const draft = await author();
    const original = structuredClone(imageQuestion(draft.sections));
    draft.sections[0].components[0].quiz.questions.push({ ...structuredClone(original), id: 'q2' });
    expect((await save(draft.sections)).status).toBe(200);
    const writes = vi.spyOn(content, 'saveCourseReview');
    const removed = await remove(attachment.assetId); expect(removed.status).toBe(200);
    expect(writes).toHaveBeenCalledTimes(1);
    const result = await removed.json(); const quiz = result.content.sections[0].components[0];
    expect(quiz.attachments).toEqual([]);
    expect(quiz.quiz.questions).toEqual([{ ...original, image: null }, { ...original, id: 'q2', image: null }]);
    expect(result.content.sections[0].components.slice(1)).toEqual(draft.sections[0].components.slice(1));
    expect(await assets.getComponentAttachment(attachment.assetId)).toBeNull();
  });
  it('AC06 freezes submissions and preserves the published image during draft deletion', async () => {
    const attachment = await attach();
    expect((await act('submit')).status).toBe(200);
    expect((await upload()).status).toBe(409);
    expect((await remove(attachment.assetId)).status).toBe(409);
    expect((await act('publish', admin)).status).toBe(200);
    expect((await act('start-revision')).status).toBe(200);
    expect((await remove(attachment.assetId)).status).toBe(200);
    expect(imageQuestion((await author()).sections).image).toBeNull();
    expect((await download(attachment.assetId, student)).status).toBe(200);
    expect((await download(attachment.assetId, owner)).status).toBe(200);
    const learned = await (await request('/courses/course/content', student)).json();
    expect(imageQuestion(learned.sections).image?.assetId).toBe(attachment.assetId);
    await publish();
    expect(imageQuestion((await (await request('/courses/course/content', student)).json()).sections).image).toBeNull();
    expect((await download(attachment.assetId, student)).status).toBe(404);
  });
  it('AC05 normalizes an untouched legacy author read without rewriting stored data', async () => {
    const document = (await content.getCourseContent('course'))!;
    const raw = structuredClone(document.sections); delete imageQuestion(raw).image;
    await content.updateCourseContent('course', raw);
    const before = await content.getCourseContent('course');
    expect(imageQuestion((await author()).sections).image).toBeNull();
    expect(await content.getCourseContent('course')).toEqual(before);
  });
  it('AC07 retains the attachment and reference if the content write fails on deletion', async () => {
    const attachment = await attach(); const before = await content.getCourseContent('course');
    vi.spyOn(content, 'saveCourseReview').mockRejectedValueOnce(new Error('Storage failure'));
    const response = await remove(attachment.assetId); expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'Unexpected server error' });
    expect(await content.getCourseContent('course')).toEqual(before);
    expect(await assets.getComponentAttachment(attachment.assetId)).not.toBeNull();
  });
  it('AC07 rolls back a new attachment when its content save fails', async () => {
    const before = await content.getCourseContent('course');
    const deleted = vi.spyOn(assets, 'deleteAsset');
    vi.spyOn(content, 'saveCourseReview').mockRejectedValueOnce(new Error('Offline'));
    const response = await upload(); expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'Unexpected server error' });
    expect(await content.getCourseContent('course')).toEqual(before);
    expect(deleted).toHaveBeenCalledTimes(1);
    expect(await assets.getComponentAttachment(deleted.mock.calls[0][0])).toBeNull();
  });
  it('AC07 does not replace content when image metadata storage fails', async () => {
    const attachment = await attach(); const before = await content.getCourseContent('course'); const draft = await author();
    imageQuestion(draft.sections).image = { assetId: attachment.assetId, alt: 'Changed' };
    vi.spyOn(assets, 'getComponentAttachmentMetadata').mockRejectedValueOnce(new Error('Offline'));
    const response = await save(draft.sections); expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'Unexpected server error' });
    expect(await content.getCourseContent('course')).toEqual(before);
  });
});
