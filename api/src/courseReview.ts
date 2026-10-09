import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AuthenticatedUser } from './auth.js';
import { updateCourseSchema, type Course, type UpdateCourseInput } from './course.js';
import type { CourseRepository } from './courseRepository.js';
import type { CourseContentDocument, CourseContentRepository } from './courseContentRepository.js';
import type { CourseContentSection } from './courseContent.js';
import type { CourseAssetRepository } from './courseAssetRepository.js';
import { assessmentIssues, type AssessmentIssue } from './quizAssessment.js';

export const reviewScope = new AsyncLocalStorage<{ author: boolean; user?: AuthenticatedUser; mediaCallback?: boolean }>();
export class CourseReviewError extends Error {
  constructor(readonly status: number, message: string, readonly issues?: AssessmentIssue[], readonly code?: string) { super(message); }
}
const authorFields = ['title', 'description', 'requirements', 'whatYoullLearn', 'audience', 'level', 'partOfCareer', 'teacher', 'careerGoals', 'thumbnailAssetId'] as const;
type Metadata = Pick<Course, typeof authorFields[number]>;
type Snapshot = { id: string; metadata: Metadata; sections: CourseContentSection[] };
export type ReviewEvent = { id: string; revisionId: string | null; action: string; actorId: string; actorName: string; createdAt: string; reason: string };
export type CourseReviewWorkflow = {
  version: number; liveStatus: 'published' | 'archived' | null; live: Snapshot | null;
  working: (Snapshot & { status: 'draft' | 'ready-for-review' }) | null; history: ReviewEvent[];
};
export const reviewActionSchema = z.object({
  action: z.enum(['start-revision', 'submit', 'return', 'publish', 'archive']),
  expectedVersion: z.number().int().nonnegative(), revisionId: z.string().max(160).nullable(),
  reason: z.string().trim().max(2000).default(''),
});
export type ReviewAction = z.infer<typeof reviewActionSchema>;
export type CourseReviewState = { course: Course; version: number; revisionId: string | null;
  liveStatus: CourseReviewWorkflow['liveStatus']; editable: boolean; history: ReviewEvent[] };

function snapshot(course: Course, sections: CourseContentSection[], id: string): Snapshot {
  const metadata = Object.fromEntries(authorFields.map(key => [key, course[key]])) as Metadata;
  return structuredClone({ id, metadata, sections });
}
function initial(course: Course, doc: CourseContentDocument | null): CourseReviewWorkflow {
  if (doc?.review) return structuredClone(doc.review);
  const item = snapshot(course, doc?.sections ?? [], `legacy-${course.id}`);
  const live = course.status === 'published' || course.status === 'archived';
  return { version: 0, liveStatus: live ? course.status as 'published' | 'archived' : null,
    live: live ? item : null, working: live ? null : { ...item, status: course.status as 'draft' | 'ready-for-review' }, history: [] };
}
function effective(base: Course, workflow: CourseReviewWorkflow, author = false): Course {
  const item = author ? workflow.working ?? workflow.live : workflow.live ?? workflow.working;
  return { ...base, ...item?.metadata, status: author && workflow.working ? workflow.working.status : workflow.liveStatus ?? workflow.working?.status ?? base.status };
}
function cleanContent(doc: CourseContentDocument, sections = doc.sections): CourseContentDocument {
  return { _id: doc._id, sections, createdAt: doc.createdAt, updatedAt: doc.updatedAt };
}

/** Keeps publication and private authoring snapshots in one content-document write. */
export class CourseReviewService {
  constructor(readonly metadata: CourseRepository, readonly content: CourseContentRepository) {}
  async load(id: string) {
    const base = (await this.metadata.listCourses()).find(course => course.id === id);
    if (!base) throw new CourseReviewError(404, 'Course not found');
    const doc = await this.content.getCourseContent(id);
    return { base, doc, workflow: initial(base, doc) };
  }
  async state(id: string): Promise<CourseReviewState> {
    const { base, workflow } = await this.load(id);
    return { course: effective(base, workflow, true), version: workflow.version, revisionId: workflow.working?.id ?? null,
      liveStatus: workflow.liveStatus, editable: workflow.working?.status === 'draft', history: workflow.history };
  }
  async assertEditable(id: string) {
    const { workflow } = await this.load(id);
    if (!workflow.working) throw new CourseReviewError(409, 'Start a revision before editing this live course. Learners keep the published version.');
    if (workflow.working.status !== 'draft') throw new CourseReviewError(409, 'This revision awaits review. An admin must return it before editing.');
  }
  async assertRevision(id: string, header: string | undefined) {
    let value: unknown;
    try { value = JSON.parse(header ?? 'null'); } catch { value = null; }
    const parsed = z.object({ version: z.number().int().nonnegative(), revisionId: z.string().max(160).nullable() }).safeParse(value);
    if (!parsed.success) throw new CourseReviewError(428, 'Reload this course before saving. A saved revision is required.', undefined, 'AUTHORING_REVISION_REQUIRED');
    const { workflow } = await this.load(id);
    if (parsed.data.version !== workflow.version || parsed.data.revisionId !== (workflow.working?.id ?? null)) {
      throw new CourseReviewError(409, 'Newer course work has been saved. Your draft is intact; compare the latest version before saving again.', undefined, 'AUTHORING_CONFLICT');
    }
  }
  async save(id: string, workflow: CourseReviewWorkflow) {
    workflow.version++;
    return this.content.saveCourseReview(id, workflow);
  }
  async act(id: string, input: ReviewAction, user: AuthenticatedUser) {
    const { base, workflow } = await this.load(id);
    if (['publish', 'return', 'archive'].includes(input.action) && user.role !== 'admin') {
      throw new CourseReviewError(403, 'Admin access is required for review decisions.');
    }
    if (input.action === 'return' && !input.reason) throw new CourseReviewError(400, 'Enter a reason before returning this revision.');
    if (workflow.version !== input.expectedVersion || (workflow.working?.id ?? null) !== input.revisionId) {
      throw new CourseReviewError(409, 'The revision changed. Reload it before making a review decision.');
    }
    if (input.action === 'start-revision') {
      if (!workflow.live || workflow.working) throw new CourseReviewError(409, 'A revision cannot be started in the current state.');
      workflow.working = { ...structuredClone(workflow.live), id: randomUUID(), status: 'draft' };
    } else if (input.action === 'archive') {
      if (workflow.liveStatus !== 'published') throw new CourseReviewError(409, 'Only a published course can be archived.');
      workflow.liveStatus = 'archived';
    } else {
      const working = workflow.working;
      if (!working || working.status !== (input.action === 'submit' ? 'draft' : 'ready-for-review')) {
        throw new CourseReviewError(409, 'This action is unavailable for the current revision.');
      }
      if (input.action === 'submit' || input.action === 'publish') {
        updateCourseSchema.parse(effective(base, workflow, true));
        if (!working.sections.some(section => section.components.length > 0)) throw new CourseReviewError(400, 'Add at least one lesson before review or publication.');
        const issues = assessmentIssues(working.sections, true);
        if (issues.length) throw new CourseReviewError(400, issues.map(issue => issue.message).join(' '), issues);
      }
      if (input.action === 'submit') working.status = 'ready-for-review';
      else if (input.action === 'return') working.status = 'draft';
      else { workflow.live = snapshot(effective(base, workflow, true), working.sections, working.id); workflow.liveStatus = 'published'; }
    }
    workflow.history.push({ id: randomUUID(), revisionId: workflow.working?.id ?? workflow.live?.id ?? null,
      action: input.action, actorId: user.id, actorName: user.displayName, createdAt: new Date().toISOString(), reason: input.reason });
    if (input.action === 'publish') workflow.working = null;
    await this.save(id, workflow);
  }
  async list(author = reviewScope.getStore()?.author ?? false) {
    const bases = await this.metadata.listCourses();
    return Promise.all(bases.map(async base => {
      const doc = await this.content.getCourseContent(base.id);
      return doc?.review ? effective(base, doc.review, author) : base;
    }));
  }
  async updateMetadata(id: string, input: UpdateCourseInput) {
    const { base, workflow } = await this.load(id);
    await this.assertEditable(id);
    const current = effective(base, workflow, true);
    if (input.status !== current.status) throw new CourseReviewError(409, 'Use the explicit submission and review actions to change status.');
    if (input.priceDkk !== current.priceDkk) throw new CourseReviewError(409, 'Use the admin pricing control to change pricing.');
    Object.assign(workflow.working!.metadata, Object.fromEntries(authorFields.filter(key => key !== 'thumbnailAssetId').map(key => [key, input[key]])));
    await this.save(id, workflow);
    return effective(base, workflow, true);
  }
  async updateThumbnail(id: string, thumbnailAssetId: string) {
    const { base, workflow } = await this.load(id);
    await this.assertEditable(id);
    workflow.working!.metadata.thumbnailAssetId = thumbnailAssetId;
    await this.save(id, workflow);
    return effective(base, workflow, true);
  }
  async updateSections(id: string, sections: CourseContentSection[]) {
    const { workflow } = await this.load(id);
    await this.assertEditable(id);
    workflow.working!.sections = sections;
    const saved = await this.save(id, workflow);
    return cleanContent(saved, sections);
  }
}

export function reviewedRepositories(metadata: CourseRepository, content: CourseContentRepository, assets: CourseAssetRepository) {
  const review = new CourseReviewService(metadata, content);
  const courses: CourseRepository = {
    storageType: metadata.storageType,
    listCourses: () => review.list(), createCourse: (input, seed) => metadata.createCourse(input, seed),
    updateCourse: (id, input) => review.updateMetadata(id, input),
    updateCourseThumbnail: (id, input) => review.updateThumbnail(id, input.thumbnailAssetId),
    updateCoursePrice: async (id, input) => { const updated = await metadata.updateCoursePrice(id, input); return updated ? (await review.list()).find(course => course.id === id)! : null; },
    updateCourseCatalogMetadata: async (id, input) => { const updated = await metadata.updateCourseCatalogMetadata(id, input); return updated ? (await review.list()).find(course => course.id === id)! : null; },
  };
  const courseContent: CourseContentRepository = {
    storageType: content.storageType, checkHealth: () => content.checkHealth(),
    createEmptyCourseContent: (id, date) => content.createEmptyCourseContent(id, date),
    deleteCourseContent: id => content.deleteCourseContent(id), saveCourseReview: (id, workflow) => content.saveCourseReview(id, workflow),
    withCourseMutationLock: (id, operation) => content.withCourseMutationLock(id, operation),
    getCourseContent: async id => {
      const doc = await content.getCourseContent(id);
      if (!doc) return null;
      const selected = reviewScope.getStore()?.author && doc.review?.working ? doc.review.working.sections : doc.review?.live?.sections ?? doc.sections;
      return cleanContent(doc, selected);
    },
    updateCourseContent: (id, sections) => review.updateSections(id, sections),
  };
  const courseAssets: CourseAssetRepository = {
    storageType: assets.storageType, checkHealth: () => assets.checkHealth(),
    saveThumbnail: input => assets.saveThumbnail(input), getThumbnail: id => assets.getThumbnail(id),
    saveComponentAttachment: input => assets.saveComponentAttachment(input), getComponentAttachment: id => assets.getComponentAttachment(id),
    deleteAsset: async (id, courseId) => {
      const doc = await content.getCourseContent(courseId);
      const live = doc?.review?.live;
      if (live && (live.metadata.thumbnailAssetId === id || live.sections.some(section => section.components.some(component => component.attachments.some(attachment => attachment.assetId === id))))) return;
      await assets.deleteAsset(id, courseId);
    },
  };
  return { courses, courseContent, courseAssets, review };
}
