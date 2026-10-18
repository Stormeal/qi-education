import { describe, expect, it } from 'vitest';
import { careerPathContentSchema, careerPathIssues, careerPathSeeds, learnerCareerPath } from './careerPath.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { milestoneStates } from './accountCareers.js';

export const milestone = (id: string, prerequisites: string[] = [], extra = {}) => ({
  id, title: id, stage: 'Foundation', roleMilestone: false, courses: [], prerequisiteStepIds: prerequisites,
  actions: [{ id: `${id}-exam`, kind: 'exam', title: `${id} exam` }],
  requirementBundles: [[`${id}-exam`]], ...extra,
});
export const content = (steps = [milestone('foundation')]) => careerPathContentSchema.parse({ schemaVersion: 2, title: 'Milestone path', steps });

describe('milestone content contract', () => {
  it('US-A004-AC02 distinguishes preparation, actions and alternative bundles with v1 defaults', () => {
    const parsed = content();
    expect(parsed).toMatchObject({ schemaVersion: 2, steps: [{ stage: 'Foundation', roleMilestone: false,
      actions: [{ id: 'foundation-exam', kind: 'exam', courseId: '' }], requirementBundles: [['foundation-exam']] }] });
    expect(careerPathContentSchema.parse({ title: 'Legacy', steps: [{ id: 'old', title: 'Old' }] })).toMatchObject({
      schemaVersion: 1, steps: [{ stage: '', roleMilestone: false, actions: [], requirementBundles: [] }],
    });
    expect(careerPathIssues(parsed, [])).toEqual([]);
  });

  it('US-A004-AC03 refuses missing bundles/actions/courses and invalid action IDs', () => {
    expect(careerPathIssues(content([milestone('root', [], { requirementBundles: [] })]), [])).not.toEqual([]);
    expect(careerPathIssues(content([milestone('root', [], { requirementBundles: [['missing-action']] })]), [])).not.toEqual([]);
    expect(careerPathIssues(content([milestone('root', [], { actions: [{ id: 'root-exam', kind: 'course', title: 'Course', courseId: 'missing' }] })]), [])).not.toEqual([]);
    expect(careerPathContentSchema.safeParse({ ...content(), steps: [milestone('root', [], { actions: [{ id: 'BAD ID', kind: 'exam', title: 'Exam' }] })] }).success).toBe(false);
  });

  it('US-A004-AC03 validates cross-path cycles, missing prerequisites and conflicting global identities', () => {
    const other = content([milestone('external')]);
    expect(careerPathIssues(content([milestone('dependent', ['external'])]), [], [other])).toEqual([]);
    expect(careerPathIssues(content([milestone('dependent', ['unknown'])]), [], [other])).not.toEqual([]);
    expect(careerPathIssues(content([milestone('dependent', ['external'])]), [], [content([milestone('external', ['dependent'])])])
      .some(issue => /loop/i.test(issue.message))).toBe(true);
    expect(careerPathIssues(content([milestone('external', [], { requirementBundles: [['different']] })]), [], [other])
      .some(issue => /conflict/i.test(issue.message))).toBe(true);
    expect(careerPathIssues(content([milestone('another', [], { actions: [{ id: 'external-exam', kind: 'activity', title: 'Different' }], requirementBundles: [['external-exam']] })]), [], [other])
      .some(issue => /conflict/i.test(issue.message))).toBe(true);
  });

  it('US-A004-AC05 exposes only public action course labels and availability', async () => {
    const course = (await new InMemoryCourseRepository().listCourses())[0];
    const published = content([milestone('root', [], { actions: [{ id: 'root-exam', kind: 'course', title: 'Approved label', courseId: course.id }] })]);
    const document = { _id: 'test-path', revision: 1, draft: null, published, updatedAt: '' };
    expect(learnerCareerPath(document, [course])?.steps[0].actions[0]).toMatchObject({ title: course.title, available: true });
    const view = learnerCareerPath(document, [{ ...course, status: 'draft', title: 'PRIVATE TITLE' }]);
    expect(view?.steps[0].actions[0]).toMatchObject({ title: 'Approved label', available: false });
    expect(JSON.stringify(view)).not.toContain('PRIVATE TITLE');
  });

  it('US-A004-AC02 launch seeds use a shared Foundation exam and candidate map as preview-only drafts', () => {
    for (const id of ['technical-tester', 'test-manager', 'test-analyst']) {
      const seed = careerPathSeeds[id];
      expect(seed.schemaVersion).toBe(2);
      expect(seed.steps.find(step => step.id === 'foundation')?.actions).toEqual([
        { id: 'foundation-exam', kind: 'exam', title: 'Passed Foundation exam', courseId: '' },
      ]);
      expect(seed.steps.some(step => step.roleMilestone)).toBe(true);
      expect(seed.steps.every(step => step.courses.every(course => !course.courseId))).toBe(true);
      expect(careerPathIssues(seed, [])).toEqual([]);
    }
    expect(careerPathSeeds['agile-tester'].schemaVersion).toBe(1);
  });

  it('US-A004-AC02 US-L019-AC05 US-L020-AC01 requires every action in any one bundle and all prerequisites', () => {
    const parsed = content([milestone('foundation'), milestone('advanced', ['foundation'], {
      courses: [{ courseId: '', title: 'Preparation only' }], actions: [
        { id: 'action-one', kind: 'activity', title: 'One' }, { id: 'action-two', kind: 'activity', title: 'Two' },
        { id: 'alternative-exam', kind: 'exam', title: 'Alternative' }],
      requirementBundles: [['action-one', 'action-two'], ['alternative-exam']],
    })]);
    const states = (...ids: string[]) => milestoneStates(parsed.steps, new Set(ids));
    expect(states('alternative-exam')).toEqual({ foundation: 'ready', advanced: 'locked' });
    expect(states('foundation-exam', 'action-one').advanced).toBe('ready');
    expect(states('foundation-exam', 'action-one', 'action-two').advanced).toBe('achieved');
    expect(states('foundation-exam', 'alternative-exam').advanced).toBe('achieved');
    expect(milestoneStates(content([milestone('orphan', ['withdrawn'])]).steps, new Set(['orphan-exam'])).orphan).toBe('locked');
  });
});
