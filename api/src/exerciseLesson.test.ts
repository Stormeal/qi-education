import { afterEach, describe, expect, it } from 'vitest';
import { updateCourseContentSchema } from './courseContent.js';
import { CourseReviewService } from './courseReview.js';
import { learningFixture } from './learningBackendTestFixture.js';
import { createSessionToken } from './auth.js';
import { apiConfig } from './config.js';

describe('US-T015 exercise lessons', () => {
  let fixture: Awaited<ReturnType<typeof learningFixture>>;
  afterEach(async () => { await fixture?.close(); });
  it('AC01 lets the course author upload and the learner download an exercise file through HTTP', async () => {
    fixture = await learningFixture();
    const course = (await fixture.courses.listCourses()).find(item => item.id === 'course')!;
    await fixture.courses.updateCourse('course', { ...course, status: 'draft' });
    await fixture.content.updateCourseContent('course', updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Practice', components: [
      { id: 'exercise', type: 'exercise', title: 'Try it', content: 'Read the attached file.' },
    ] }] }).sections);
    const upload = await fetch(fixture.base + '/courses/course/content/components/exercise/attachments', {
      method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'X-Section-Id': 's', 'X-File-Name': 'task.pdf',
        Authorization: `Bearer ${createSessionToken(fixture.teacher, apiConfig.AUTH_TOKEN_SECRET!)}` }, body: Buffer.from('isolated exercise file'),
    });
    expect(upload.status).toBe(201);
    const { attachment } = await upload.json();
    const review = new CourseReviewService(fixture.courses, fixture.content);
    let state = await review.state('course');
    await review.act('course', { action: 'submit', expectedVersion: state.version, revisionId: state.revisionId, reason: '' }, fixture.teacher);
    state = await review.state('course');
    await review.act('course', { action: 'publish', expectedVersion: state.version, revisionId: state.revisionId, reason: '' }, fixture.admin);
    const download = await fixture.request(`/courses/course/content/attachments/${attachment.assetId}`);
    expect(download.status).toBe(200);
    expect(await download.text()).toBe('isolated exercise file');
  });
  it('AC01 saves instructions, links and files, projects an outline and completes through progress', async () => {
    fixture = await learningFixture();
    const parsed = updateCourseContentSchema.safeParse({ sections: [{ id: 's', title: 'Practice', components: [{
      id: 'exercise', title: 'Try it', type: 'exercise', content: 'Build something.', resourceUrl: 'https://example.test/task',
      attachments: [{ id: 'a', assetId: 'asset', fileName: 'task.pdf', contentType: 'application/pdf', sizeBytes: 10, createdAt: '2026-10-15T00:00:00Z' }],
    }] }] });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const sections = parsed.data.sections;
    const review = new CourseReviewService(fixture.courses, fixture.content);
    await review.act('course', { action: 'start-revision', expectedVersion: 0, revisionId: null, reason: '' }, fixture.teacher);
    const editing = await review.state('course');
    const saved = await fetch(fixture.base + '/courses/course/content', { method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${createSessionToken(fixture.teacher, apiConfig.AUTH_TOKEN_SECRET!)}`,
        'X-Course-Revision': JSON.stringify({ version: editing.version, revisionId: editing.revisionId }) }, body: JSON.stringify({ sections }) });
    expect(saved.status).toBe(200);
    let state = await review.state('course');
    await review.act('course', { action: 'submit', expectedVersion: state.version, revisionId: state.revisionId, reason: '' }, fixture.teacher);
    state = await review.state('course');
    await review.act('course', { action: 'publish', expectedVersion: state.version, revisionId: state.revisionId, reason: '' }, fixture.admin);
    const learner = await (await fixture.request('/courses/course/content')).json();
    expect(learner.sections[0].components[0]).toMatchObject({ type: 'exercise', content: 'Build something.', resourceUrl: 'https://example.test/task', attachments: [{ assetId: 'asset' }] });
    const outline = await (await fixture.request('/courses/course/outline', null)).json();
    expect(outline.sections[0].components[0]).toEqual({ id: 'exercise', title: 'Try it', type: 'exercise', durationMinutes: 0 });
    const complete = await fixture.request('/users/me/learning-progress/course/lessons/exercise', fixture.student, 'PUT');
    expect(complete.status).toBe(200);
    expect(await complete.json()).toEqual({ courseId: 'course', completedIds: ['exercise'] });
  });
});
