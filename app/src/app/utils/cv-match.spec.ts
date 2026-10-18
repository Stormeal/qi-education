import { CareerPath, CareerPathStep } from '../app.models';
import { matchCvText } from './cv-match';

const step = (id: string, title: string, cvKeywords?: string[]): CareerPathStep => ({
  id, title, description: '', required: true, prerequisiteStepIds: [], courses: [],
  actions: [{ id: `${id}-exam`, kind: 'exam', title: `Passed ${title}`, courseId: '', available: true, cvKeywords }],
  requirementBundles: [[`${id}-exam`]],
});
const career = (id: string, steps: CareerPathStep[], schemaVersion: 1 | 2 = 2): CareerPath =>
  ({ id, revision: 1, schemaVersion, title: id, summary: '', outcomes: [], estimatedHours: 0, steps });
const foundation = step('foundation', 'ISTQB Foundation', ['ISTQB Foundation', 'Certified Tester Foundation Level', 'CTFL']);
const ids = (text: string, paths: CareerPath[], satisfied: string[] = []) => matchCvText(text, paths, satisfied).found.map((match) => match.actionId);

describe('matchCvText (US-L023-AC01, AC04)', () => {
  it('finds a keyword across line breaks and odd spacing, with the action, milestone and a snippet', () => {
    const { found } = matchCvText('Skills: ISTQB® Certified Tester\n  Foundation Level (2019), Jira', [career('a', [foundation])], []);
    expect(found).toEqual([{ actionId: 'foundation-exam', actionTitle: 'Passed ISTQB Foundation', milestoneTitle: 'ISTQB Foundation',
      snippet: expect.stringContaining('certified tester foundation level') }]);
  });

  it('is case-insensitive and matches whole words only', () => {
    expect(ids('ctfl, 2020', [career('a', [foundation])])).toEqual(['foundation-exam']);
    expect(ids('CTFLX certified', [career('a', [foundation])])).toEqual([]);
  });

  it('treats different dash characters as one', () => {
    const manager = step('manager', 'Advanced Test Management', ['CTAL-TM']);
    expect(ids('Holds CTAL‑TM since 2021', [career('a', [manager])])).toEqual(['manager-exam']);
  });

  it('matches keywords with regex characters literally', () => {
    const odd = step('odd', 'Odd', ['ISTQB (CTFL)', 'C++']);
    expect(ids('I passed ISTQB (CTFL) last year', [career('a', [odd])])).toEqual(['odd-exam']);
    expect(ids('I passed ISTQB CTFL last year', [career('a', [odd])])).toEqual([]);
    expect(() => ids('C++ developer', [career('a', [odd])])).not.toThrow();
  });

  it('lists a shared action once, in career then step order', () => {
    const analyst = step('analyst', 'ISTQB Advanced Test Analyst', ['CTAL-TA']);
    const paths = [career('a', [analyst, foundation]), career('b', [foundation])];
    expect(ids('CTFL and CTAL-TA', paths)).toEqual(['analyst-exam', 'foundation-exam']);
  });

  it('puts an action already satisfied on the account under alreadyRecorded', () => {
    const result = matchCvText('CTFL', [career('a', [foundation])], ['foundation-exam']);
    expect(result.found).toEqual([]);
    expect(result.alreadyRecorded.map((match) => match.actionId)).toEqual(['foundation-exam']);
  });

  it('ignores old-format careers and actions without keywords', () => {
    expect(ids('CTFL', [career('old', [foundation], 1)])).toEqual([]);
    expect(ids('ISTQB Foundation', [career('a', [step('foundation', 'ISTQB Foundation')])])).toEqual([]);
  });
});
