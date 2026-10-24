import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CareerPath, CareerPathStep, MilestoneState } from '../../app.models';
import { CareerMap } from './career-map';

const step = (id: string, title: string, prerequisiteStepIds: string[] = []): CareerPathStep => ({
  id, title, description: '', required: true, courses: [], prerequisiteStepIds,
  actions: [{ id: `${id}-exam`, kind: 'exam', title: `Passed ${title}`, courseId: '', available: false }],
  requirementBundles: [[`${id}-exam`]],
});
const career = (id: string, title: string, steps: CareerPathStep[], schemaVersion: 1 | 2 = 2): CareerPath => ({
  id, revision: 1, schemaVersion, title, summary: '', outcomes: [], estimatedHours: 0, steps,
});
const foundation = step('foundation', 'ISTQB Foundation');
const paths = [
  career('tester', 'Technical Tester', [foundation, step('automation', 'Test Automation', ['foundation'])]),
  career('manager', 'Test Manager', [foundation, step('lead', 'Test Lead', ['foundation'])]),
  career('analyst', 'Test Analyst', [foundation, step('analysis', 'Test Analysis', ['foundation'])]),
  career('legacy', 'Legacy Career', [step('old', 'Old step')], 1),
];
const states: Record<string, MilestoneState> = { foundation: 'achieved', automation: 'ready', lead: 'ready', analysis: 'locked' };

describe('CareerMap (US-L026)', () => {
  let fixture: ComponentFixture<CareerMap>;
  let page: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({ imports: [CareerMap] }).compileComponents();
  });

  function render(input: Partial<{ paths: CareerPath[]; states: Record<string, MilestoneState>; initialCareerId: string }> = {}) {
    fixture = TestBed.createComponent(CareerMap);
    fixture.componentRef.setInput('paths', input.paths ?? paths);
    fixture.componentRef.setInput('states', input.states ?? states);
    fixture.componentRef.setInput('followedIds', ['tester']);
    fixture.componentRef.setInput('initialCareerId', input.initialCareerId ?? 'tester');
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  }
  const chip = (title: string) => [...page.querySelectorAll<HTMLButtonElement>('.cm-chip')].find((b) => b.textContent?.includes(title))!;
  const node = (id: string) => page.querySelector<HTMLElement>(`.cm-map [data-node="${id}"]`)!;
  const button = (text: string) => [...page.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.textContent?.trim() === text);

  it('US-L026-AC01 opens with the starting career highlighted', () => {
    render();
    expect(page.querySelector('h2')?.textContent).toContain('All careers');
    expect(chip('Technical Tester').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Test Manager').getAttribute('aria-pressed')).toBe('false');
    expect(page.querySelectorAll('.cm-map [data-node]').length).toBe(4);
  });

  it('US-L026-AC03 shows each milestone state in words', () => {
    render();
    expect(node('foundation').textContent).toContain('Achieved');
    expect(node('automation').textContent).toContain('Ready to start');
    expect(node('analysis').textContent).toContain('Locked');
    expect(node('foundation').getAttribute('aria-label')).toBe('ISTQB Foundation, achieved, part of 3 careers');
  });

  it('US-L026-AC04 highlights one career and toggles back', () => {
    render({ initialCareerId: '' });
    expect(page.querySelectorAll('.cm-map [data-faded]').length).toBe(0);
    chip('Test Manager').click();
    fixture.detectChanges();
    expect(node('automation').hasAttribute('data-faded')).toBe(true);
    expect(node('foundation').hasAttribute('data-faded')).toBe(false);
    expect(node('lead').hasAttribute('data-faded')).toBe(false);
    chip('Test Manager').click();
    fixture.detectChanges();
    expect(page.querySelectorAll('.cm-map [data-faded]').length).toBe(0);
  });

  it('US-L026-AC05 shows details and opens a career', () => {
    render();
    const opened: string[] = [];
    fixture.componentInstance.openCareer.subscribe((id) => opened.push(id));
    node('analysis').click();
    fixture.detectChanges();
    const detail = page.querySelector('.cm-detail')!;
    expect(detail.textContent).toContain('Test Analysis');
    expect(detail.textContent).toContain('Part of');
    expect(detail.textContent).toContain('Test Analyst');
    expect(detail.textContent).toContain('Passed Test Analysis');
    expect(detail.textContent).toContain("Record achievements on the career's tree.");
    button('Open career')[0].click();
    expect(opened).toEqual(['analyst']);
  });

  it('names missing prerequisites in the details', () => {
    render({ states: { foundation: 'ready', automation: 'locked' } });
    node('automation').click();
    fixture.detectChanges();
    expect(page.querySelector('.cm-detail')?.textContent).toContain('First achieve ISTQB Foundation.');
  });

  it('US-L026-AC06 Escape closes from anywhere', () => {
    render();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    chip('Test Manager').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    button('Close')[0].click();
    expect(closed).toBe(2);
  });

  it('US-L026-AC07 names careers not on the map', () => {
    render();
    expect(page.textContent).toContain('Not on the map: Legacy Career');
  });

  it('shows the empty message when no career uses milestones', () => {
    render({ paths: [paths[3]] });
    expect(page.textContent).toContain('No careers use milestones yet.');
    expect(page.querySelector('.cm-map')).toBeNull();
  });

  it('US-L026-AC08 lists every milestone by column for phones', () => {
    render();
    const groups = page.querySelectorAll('.cm-list > li');
    expect(groups.length).toBe(2);
    expect(groups[0].querySelectorAll('[data-node]').length).toBe(1);
    expect(groups[1].querySelectorAll('[data-node]').length).toBe(3);
  });

  it('locks page scrolling while open and restores it after', () => {
    render();
    expect(document.body.style.overflow).toBe('hidden');
    fixture.destroy();
    expect(document.body.style.overflow).toBe('');
  });
});
