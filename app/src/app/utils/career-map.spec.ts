import { CareerPath, CareerPathStep } from '../app.models';
import { buildCareerMap } from './career-map';

const step = (id: string, prerequisiteStepIds: string[] = [], title = id): CareerPathStep => ({
  id, title, description: '', required: true, courses: [], prerequisiteStepIds, actions: [], requirementBundles: [],
});
const path = (id: string, steps: CareerPathStep[], schemaVersion: 1 | 2 = 2): CareerPath => ({
  id, revision: 1, schemaVersion, title: id.toUpperCase(), summary: '', outcomes: [], estimatedHours: 0, steps,
});

describe('buildCareerMap (US-L026)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  const tester = path('tester', [step('foundation'), step('automation', ['foundation'])]);
  const manager = path('manager', [step('foundation'), step('lead', ['foundation']), step('manager', ['lead', 'automation'])]);
  const analyst = path('analyst', [step('foundation'), step('analysis', ['foundation'])]);

  it('draws a shared milestone once with every career that uses it', () => {
    const map = buildCareerMap([tester, manager, analyst]);
    const nodes = map.columns.flat().filter((node) => node.id === 'foundation');
    expect(nodes.length).toBe(1);
    expect(map.columns[0].map((node) => node.id)).toEqual(['foundation']);
    expect(nodes[0].careerIds).toEqual(['tester', 'manager', 'analyst']);
    expect(map.edges).toContainEqual({ from: 'foundation', to: 'automation' });
  });

  it('places a milestone after its longest prerequisite chain', () => {
    const map = buildCareerMap([tester, manager]);
    expect(map.columns[2].map((node) => node.id)).toEqual(['manager']);
  });

  it('lists old-format careers as not on the map', () => {
    const old = path('old', [step('old-step')], 1);
    const map = buildCareerMap([tester, old]);
    expect(map.notOnMap).toEqual([{ id: 'old', title: 'OLD' }]);
    expect(map.careers).toEqual([{ id: 'tester', title: 'TESTER' }]);
    expect(map.columns.flat().some((node) => node.id === 'old-step')).toBe(false);
  });

  it('adds a Not published placeholder for an unknown prerequisite', () => {
    const map = buildCareerMap([path('x', [step('x', ['gone'])])]);
    expect(map.columns[0]).toEqual([{ id: 'gone', title: 'Not published', step: null, column: 0, careerIds: [] }]);
    expect(map.edges).toEqual([{ from: 'gone', to: 'x' }]);
  });

  it('puts loop members and milestones behind them in the last column', () => {
    const map = buildCareerMap([path('loop', [step('start'), step('next', ['start']), step('a', ['b']), step('b', ['a']), step('c', ['b'])])]);
    expect(map.columns.length).toBe(3);
    expect(map.columns[2].map((node) => node.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('orders a column by first career, then by position in it', () => {
    const map = buildCareerMap([tester, manager, analyst]);
    expect(map.columns[1].map((node) => node.id)).toEqual(['automation', 'lead', 'analysis']);
  });

  it('returns no columns when no career uses milestones', () => {
    expect(buildCareerMap([path('old', [step('s')], 1)]).columns).toEqual([]);
  });
});
