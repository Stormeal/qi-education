import { CareerPath, CareerPathStep } from '../app.models';
import { careerPathProgress } from './career-path-progress';

const step = (id: string, courseIds: string[], extra: Partial<CareerPathStep> = {}): CareerPathStep => ({
  id, title: id, description: '', required: true, prerequisiteStepIds: [],
  courses: courseIds.map((courseId) => ({ courseId, title: courseId, placeholder: !courseId, available: !!courseId })),
  ...extra,
});
const path = (steps: CareerPathStep[]): CareerPath =>
  ({ id: 'p', revision: 1, title: 'P', summary: '', outcomes: [], estimatedHours: 0, steps });
const done = (...ids: string[]) => (courseId: string) => ids.includes(courseId);

describe('career path milestones (US-L012)', () => {
  it('AC01 one of two required steps is 50 percent and identifies the next step', () => {
    const result = careerPathProgress(path([step('a', ['c1']), step('b', ['c2'], { prerequisiteStepIds: ['a'] })]), done('c1'));
    expect(result).toMatchObject({ percent: 50, completed: 1, total: 2, finished: false, nextStepId: 'b' });
  });

  it('AC01 the next step respects prerequisites', () => {
    const result = careerPathProgress(path([step('late', ['c2'], { prerequisiteStepIds: ['first'] }), step('first', ['c1'])]), done());
    expect(result.nextStepId).toBe('first');
  });

  it('AC02 an alternative counts once and optional learning does not inflate progress', () => {
    const steps = [step('a', ['c1', 'c1-alt']), step('b', ['c2']), step('extra', ['c3'], { required: false })];
    const result = careerPathProgress(path(steps), done('c1', 'c1-alt', 'c3'));
    expect(result).toMatchObject({ percent: 50, completed: 1, total: 2 });
    expect(result.doneStepIds.has('extra')).toBe(true);
  });

  it('AC03 all required steps finish the path; preview courses never complete a step', () => {
    expect(careerPathProgress(path([step('a', ['c1']), step('extra', ['c3'], { required: false })]), done('c1')))
      .toMatchObject({ percent: 100, finished: true, nextStepId: null });
    expect(careerPathProgress(path([step('a', [''])]), () => true)).toMatchObject({ percent: 0, finished: false });
  });
});
