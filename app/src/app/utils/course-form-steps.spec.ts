import { CourseCreateDraft, CourseReviewState } from '../app.models';
import { courseFormLockedReason, courseFormSteps } from './course-form-steps';

const draft = (changes: Partial<CourseCreateDraft> = {}): CourseCreateDraft => ({ title: '', description: '', requirements: '', whatYoullLearn: '',
  audience: '', level: '', partOfCareer: '', teacher: '', careerGoals: '', status: 'draft', priceDkk: null, ...changes });
const review = (changes: Partial<CourseReviewState>, status = 'published'): CourseReviewState =>
  ({ course: { status } as CourseReviewState['course'], version: 1, revisionId: null, liveStatus: null, editable: false, history: [], ...changes });
const state = (steps: ReturnType<typeof courseFormSteps>) => steps.map((step) => `${step.id}:${step.done ? 'done' : step.locked ? 'locked' : 'open'}`).join(' ');

describe('guided course form (US-T010)', () => {
  it('AC01 a new course has two open steps and the rest wait for the course to be created', () => {
    expect(state(courseFormSteps(draft(), false, false, 0, null))).toBe('essentials:open fit:open thumbnail:locked content:locked publishing:locked');
  });

  it('AC01 a step gets its checkmark when its required fields are filled', () => {
    const filled = draft({ title: 'Exploratory testing', teacher: 'Teacher Demo', level: 'Beginner', description: 'Learn to explore software.' });
    expect(state(courseFormSteps(filled, false, false, 0, null))).toContain('essentials:done fit:done');
    expect(state(courseFormSteps(filled, true, true, 2, null))).toBe('essentials:done fit:done thumbnail:done content:done publishing:open');
    expect(state(courseFormSteps(draft({ status: 'ready-for-review' }), true, false, 0, null))).toContain('publishing:done');
  });

  it('DEF-020 a published course says so and offers Start revision; a course in review does not', () => {
    expect(courseFormLockedReason(review({ liveStatus: 'published' }))).toMatchObject({ title: 'This course is published', canStartRevision: true });
    expect(courseFormLockedReason(review({ liveStatus: 'published', revisionId: 'r1' }, 'ready-for-review')))
      .toMatchObject({ title: 'Waiting for admin review', canStartRevision: false });
  });
});
