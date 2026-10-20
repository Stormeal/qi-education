import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AccountCareers, CareerPath, CareerPathStep, MilestoneState } from '../../app.models';
import { CareerPathService } from '../../services/career-path.service';
import { ConfirmOptions, ConfirmService } from '../../services/confirm.service';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { CvScan } from '../../ui/cv-scan/cv-scan';
import { CareerPathPage } from './career-path-page';

const milestone = (id: string, title: string, stage: string, prerequisiteStepIds: string[] = []): CareerPathStep => ({
  id, title, stage, description: '', required: true, prerequisiteStepIds,
  courses: [{ courseId: '', title: `${title} preparation`, placeholder: true, available: false }],
  actions: [{ id: `${id}-exam`, kind: 'exam', title: `${title} exam`, courseId: '', available: false }],
  requirementBundles: [[`${id}-exam`]],
});
const foundation = milestone('foundation', 'ISTQB Foundation', 'Foundation');
const career = (id: string, title: string, steps: CareerPathStep[]): CareerPath =>
  ({ id, revision: 1, schemaVersion: 2, title, summary: '', outcomes: [], estimatedHours: 0, steps });
const PATHS = [
  career('test-analyst', 'Test Analyst', [foundation, milestone('test-design', 'Test design', 'Build your base', ['foundation'])]),
  career('test-manager', 'Test Manager', [foundation, milestone('architect', 'Test architecture', 'Specialise', ['test-design'])]),
];

describe('career milestone trees (US-L017, US-L019, US-L020, US-L021)', () => {
  let fixture: ComponentFixture<CareerPathPage>;
  let writes: string[];
  let failNext: boolean;
  let asked: ConfirmOptions[];
  const state = signal<'loading' | 'ready' | 'error'>('ready');
  const careers = signal<AccountCareers | null>(null);

  const text = () => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  const node = (stepId: string) => (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`.ct-node[data-step="${stepId}"]`)!;
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  async function click(label: string): Promise<void> {
    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((item) => item.textContent?.trim().startsWith(label));
    if (!button) throw new Error(`No button "${label}" in: ${text()}`);
    button.click();
    // A confirmation answers asynchronously before the save starts; let that chain finish.
    await new Promise((resolve) => setTimeout(resolve));
    await settle();
  }

  // Mirrors the API rule (US-L023): a satisfied bundle is achieved; otherwise ready needs achieved prerequisites.
  function account(followedPathIds: string[], focusPathId: string | null, declared: string[]): AccountCareers {
    const milestoneStates: Record<string, MilestoneState> = {};
    const stateOf = (step: CareerPathStep): MilestoneState => {
      if (step.requirementBundles!.some((bundle) => bundle.every((id) => declared.includes(id)))) return 'achieved';
      return step.prerequisiteStepIds.every((id) =>
        stateOf(PATHS.flatMap((path) => path.steps).find((item) => item.id === id)!) === 'achieved') ? 'ready' : 'locked';
    };
    for (const step of PATHS.flatMap((path) => path.steps)) milestoneStates[step.id] = stateOf(step);
    return { followedPathIds, focusPathId, satisfiedActionIds: declared, milestoneStates,
      achievements: declared.map((actionId) => ({ actionId, provenance: 'self-reported', declaredAt: '' })) };
  }
  const write = (label: string, next: () => AccountCareers) => async () => {
    writes.push(label);
    if (failNext) { failNext = false; return { ok: false, message: 'Unable to reach the API. Please try again.' }; }
    careers.set(next());
    return { ok: true };
  };

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    writes = [];
    failNext = false;
    asked = [];
    state.set('ready');
    careers.set(account(['test-analyst', 'test-manager'], 'test-analyst', []));
    const paths = signal(PATHS);
    const focusedPath = computed(() => paths().find((path) => path.id === careers()?.focusPathId) ?? null);
    const current = () => careers()!;
    const service = {
      state, paths, careers, focusedPath, selectedPath: focusedPath, selection: signal(null),
      progressFor: () => ({ doneStepIds: new Set(), completed: 0, total: 0, percent: 0, finished: false, nextStepId: null }),
      nextAction: signal(null), coursePercent: () => null, loadOutlines: async () => {}, reload: async () => {},
      follow: (id: string) => write(`follow ${id}`, () => account([...new Set([...current().followedPathIds, id])],
        current().focusPathId ?? id, current().satisfiedActionIds))(),
      focus: (id: string) => write(`focus ${id}`, () => account(current().followedPathIds, id, current().satisfiedActionIds))(),
      unfollow: (id: string) => write(`unfollow ${id}`, () => account(current().followedPathIds.filter((item) => item !== id),
        current().focusPathId === id ? null : current().focusPathId, current().satisfiedActionIds))(),
      declare: (actionId: string) => write(`declare ${actionId}`, () => account(current().followedPathIds, current().focusPathId,
        [...current().satisfiedActionIds, actionId]))(),
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: CareerPathService, useValue: service }] });
    // The app-root dialog is not rendered here; record each question and answer yes.
    vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockImplementation(async (options) => { asked.push(options); return true; });
    fixture = TestBed.createComponent(CareerPathPage);
    const inputs: Record<string, unknown> = {
      appVersion: '0', currentYear: 2026, student: { name: 'Learner', currentRole: 'Student' }, userEmail: 'learner@example.test',
      userRoleLabel: 'Student', canAccessAdmin: false, isFeedbackOpen: false, feedbackSubmitted: false, feedbackPage: '',
      feedbackRating: '', feedbackText: '', feedbackSubmitting: false, feedbackError: '', feedbackOptions: [],
    };
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await settle();
  });

  it('US-L017-AC01/AC02 opens the focused tree with states in words and other careers only in the selector', () => {
    expect(text()).toContain('Test Analyst');
    expect(node('foundation').textContent).toContain('Ready to start');
    expect(node('test-design').textContent).toContain('Locked: needs ISTQB Foundation');
    expect(node('architect')).toBeNull();
    expect(text()).toContain('0 milestones achieved');
    const selector = (fixture.nativeElement as HTMLElement).querySelector('nav[aria-label="Your careers"]')!;
    expect(selector.textContent).toContain('Test Manager');
  });

  it('US-L017-AC03/US-L019-AC02 selecting a node writes nothing; a confirmed declaration is self-reported and unlocks', async () => {
    node('test-design').click();
    await settle();
    expect(text()).toContain('First achieve ISTQB Foundation.');
    expect(text()).not.toContain('Mark exam as passed');
    node('foundation').click();
    await settle();
    expect(writes).toEqual([]);

    await click('Mark exam as passed');
    expect(asked[0].message).toContain('This is self-reported. It is saved to your account');
    expect(writes).toEqual(['declare foundation-exam']);
    expect(text()).toContain('ISTQB Foundation achieved. Now ready: Test design.');
    expect(node('foundation').getAttribute('aria-current')).toBe('true');
    expect(node('foundation').textContent).toContain('Achieved');
    expect(text()).toContain('1 milestone achieved');
  });

  it('US-L023-AC02 an achievement saved from a CV reads "From your CV"', async () => {
    const saved = account(['test-analyst', 'test-manager'], 'test-analyst', ['foundation-exam']);
    careers.set({ ...saved, achievements: [{ actionId: 'foundation-exam', provenance: 'cv', declaredAt: '' }] });
    await settle();
    node('foundation').click();
    await settle();
    expect(text()).toContain('Done. From your CV');
    expect(text()).not.toContain('Done. Self-reported');
  });

  it('US-L019-AC04 a failed declaration shows no success and keeps the choice for a retry', async () => {
    failNext = true;
    await click('Mark exam as passed');
    expect(text()).toContain('Not saved.');
    expect(node('foundation').textContent).toContain('Ready to start');
    expect(node('test-design').textContent).toContain('Locked');
    await click('Try again');
    expect(node('foundation').textContent).toContain('Achieved');
  });

  it('US-L020/US-L021 a cross-career prerequisite is explained and explored as a preview that records nothing', async () => {
    await click('Test Manager');
    expect(writes).toEqual(['focus test-manager']);
    node('architect').click();
    await settle();
    expect(text()).toContain('Test design is part of the Test Analyst career.');
    careers.set(account(['test-manager'], 'test-manager', []));
    await click('Explore prerequisite');
    expect(text()).toContain("You're exploring. Your followed careers have not changed.");
    expect(text()).toContain('Follow this career to record achievements on it.');
    expect(text()).not.toContain('Mark exam as passed');
    expect(writes).toEqual(['focus test-manager']);

    await click('Follow this career');
    expect(careers()?.followedPathIds).toEqual(['test-manager', 'test-analyst']);
    expect(careers()?.focusPathId).toBe('test-analyst');
  });

  it('US-L021 stopping following explains that achievements are kept and never picks another focus', async () => {
    careers.set(account(['test-analyst', 'test-manager'], 'test-analyst', ['foundation-exam']));
    await settle();
    await click('Stop following');
    expect(asked[0].message).toContain('Your achievements, completed courses and enrollments are kept.');
    expect(writes).toEqual(['unfollow test-analyst']);
    expect(careers()?.satisfiedActionIds).toEqual(['foundation-exam']);
    expect(text()).toContain('Choose which career to view');
  });

  it('US-L017 an old-format career is drawn as the same tree, from course progress, without locks or recording', async () => {
    const step = (id: string, title: string, prerequisiteStepIds: string[], courseId: string) => ({ id, title, description: '',
      required: true, prerequisiteStepIds, courses: [{ courseId, title: courseId, placeholder: false, available: true }] });
    const old: CareerPath = { id: 'ai', revision: 1, title: 'AI Testing Specialist', summary: '', outcomes: [], estimatedHours: 0,
      steps: [step('base', 'Foundation Level', [], 'done-course'), step('ai', 'AI Testing', ['base'], 'c2'), step('auto', 'AI in automation', ['ai'], 'c3')] };
    const service = TestBed.inject(CareerPathService) as unknown as { paths: ReturnType<typeof signal<CareerPath[]>>;
      progressFor: (path: CareerPath) => unknown };
    service.progressFor = () => ({ doneStepIds: new Set(['base']), completed: 1, total: 3, percent: 33, finished: false, nextStepId: 'ai' });
    service.paths.set([...PATHS, old]);
    careers.set(account(['ai'], 'ai', []));
    await settle();

    expect(text()).toContain('1 of 3 steps completed');
    expect(node('base').textContent).toContain('Completed');
    expect(node('ai').textContent).toContain('Ready to start');
    expect(node('auto').textContent).toContain('Recommended later');
    expect(text()).toContain('Start here');
    expect(text()).not.toContain('Mark exam as passed');
    expect(text()).not.toContain('Scan my CV');
    node('auto').click();
    await settle();
    expect(text()).toContain('Recommended after AI Testing. You can start it now if you prefer.');
  });

  describe('Start over', () => {
    it('stops following every career after confirming and returns to Stage 01 with answers cleared', async () => {
      (fixture.componentInstance as unknown as { questionAnswers: ReturnType<typeof signal<Record<string, boolean>>> })
        .questionAnswers.set({ team: true });
      await click('Start over');
      expect(asked.at(-1)).toMatchObject({ title: 'Start your career path over?', confirmLabel: 'Start over' });
      expect(asked.at(-1)?.message).toContain('stop following all 2 careers');
      expect(asked.at(-1)?.message).toContain('achievements, completed courses and enrollments are kept');
      expect(writes).toEqual(['unfollow test-analyst', 'unfollow test-manager']);
      expect(careers()?.followedPathIds).toEqual([]);
      expect(text()).toContain('Upload your CV');
      expect((fixture.componentInstance as unknown as { questionAnswers(): Record<string, boolean> }).questionAnswers()).toEqual({});
    });

    it('changes nothing when cancelled', async () => {
      vi.mocked(TestBed.inject(ConfirmService).ask).mockResolvedValueOnce(false);
      await click('Start over');
      expect(writes).toEqual([]);
      expect(careers()?.followedPathIds).toEqual(['test-analyst', 'test-manager']);
    });

    it('reports a failure partway and finishes the rest when tried again', async () => {
      failNext = true;
      await click('Start over');
      expect(writes).toEqual(['unfollow test-analyst']);
      expect(text()).toContain('Not saved. Unable to reach the API.');
      expect(text()).not.toContain('Upload your CV');
      await click('Start over');
      expect(careers()?.followedPathIds).toEqual([]);
      expect(text()).toContain('Upload your CV');
    });
  });

  describe('career cards on the choose step', () => {
    const host = () => fixture.nativeElement as HTMLElement;
    const titles = () => [...host().querySelectorAll('.cp-career-card h3')].map((h) => h.textContent?.trim());
    async function choose(paths?: CareerPath[]) {
      if (paths) (TestBed.inject(CareerPathService) as unknown as { paths: ReturnType<typeof signal<CareerPath[]>> }).paths.set(paths);
      (fixture.componentInstance as unknown as { wizardStep: ReturnType<typeof signal<string>> }).wizardStep.set('choose-career');
      await settle();
    }

    it('labels outcomes and milestones and summarises courses in one short line', async () => {
      const analyst = { ...PATHS[0], outcomes: ['Design tests'], steps: PATHS[0].steps.map((step, index) => index === 0
        ? { ...step, courses: [{ courseId: 'c1', title: 'Foundation course', placeholder: false, available: true }, ...step.courses] } : step) };
      await choose([analyst, PATHS[1]]);
      const card = host().querySelector<HTMLElement>('.cp-career-card[data-path="test-analyst"]')!;
      expect([...card.querySelectorAll('.cp-card-label')].map((label) => label.textContent?.trim())).toEqual(["You'll be able to", 'Milestones']);
      expect([...card.querySelectorAll('.cp-card-facts li')].map((item) => item.textContent?.trim())).toEqual(['2 milestones', '1 of 3 courses ready']);
      const manager = host().querySelector<HTMLElement>('.cp-career-card[data-path="test-manager"]')!;
      expect(manager.querySelector('.cp-card-label')?.textContent?.trim()).toBe('Milestones');
      expect(manager.querySelector('.cp-card-facts')?.textContent).toContain('Courses coming soon');
      expect(host().querySelector('.cp-career-nav')).toBeNull();
    });

    it('shows more than four careers as a carousel that steps one career at a time and wraps around', async () => {
      const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => career(id, `Career ${id.toUpperCase()}`, [foundation]));
      await choose(many);
      expect(titles()).toEqual(['Career A', 'Career B', 'Career C', 'Career D']);
      const previous = host().querySelector<HTMLButtonElement>('button[aria-label="Previous careers"]')!;
      const next = host().querySelector<HTMLButtonElement>('button[aria-label="Next careers"]')!;
      next.click(); await settle();
      expect(titles()).toEqual(['Career B', 'Career C', 'Career D', 'Career E']);
      next.click(); await settle();
      expect(titles()).toEqual(['Career C', 'Career D', 'Career E', 'Career F']);
      expect(host().querySelector('.cp-career-nav [aria-live]')?.textContent?.trim()).toBe('Careers 3 to 6 of 6');
      // Buttons never disable (focus would be lost); the ends wrap instead.
      expect(next.disabled || previous.disabled).toBe(false);
      next.click(); await settle();
      expect(titles()).toEqual(['Career A', 'Career B', 'Career C', 'Career D']);
      previous.click(); await settle();
      expect(titles()).toEqual(['Career C', 'Career D', 'Career E', 'Career F']);
    });
  });

  it('US-L023 career setup starts with a real, optional CV step', async () => {
    (fixture.componentInstance as unknown as { wizardStep: ReturnType<typeof signal<string>> }).wizardStep.set('upload');
    await settle();
    expect(text()).toContain('Upload your CV');
    expect(text()).toContain('Your CV is read on this device only.');
    expect(text()).not.toContain('Preview only');
    expect(text()).not.toContain('CV preview');
    await click('Skip this step');
    expect(text()).toContain('A few quick questions');
    expect(text()).not.toContain('was not uploaded or analysed');
  });

  it('US-L023 "Scan my CV" opens the scan beside the tree and reports what was saved', async () => {
    expect(text()).toContain('Record achievements yourself, or scan your CV to find certifications.');
    expect(text()).not.toContain('CV recognition is coming later');
    await click('Scan my CV');
    expect(text()).toContain('Drag and drop your CV here');
    fixture.debugElement.query(By.directive(CvScan)).componentInstance.done.emit(2);
    await settle();
    expect(text()).not.toContain('Drag and drop your CV here');
    expect(text()).toContain('Saved 2 achievements from your CV.');
    await click('Scan my CV');
    await click('Close CV scan');
    expect(text()).not.toContain('Drag and drop your CV here');
  });

  it('US-L017-AC04 a failed load offers a retry and is not shown as zero progress', async () => {
    state.set('error');
    await settle();
    expect(text()).toContain('Career paths are unavailable');
    expect(text()).not.toContain('milestones achieved');
  });
});
