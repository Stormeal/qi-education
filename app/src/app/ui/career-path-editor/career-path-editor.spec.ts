import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AdminCareerPath, CareerPathDraft } from '../../app.models';
import { CareerPathResult, CareerPathService } from '../../services/career-path.service';
import { ConfirmService } from '../../services/confirm.service';
import { CareerPathEditor } from './career-path-editor';

const content = (title: string): CareerPathDraft => ({ title, summary: '', outcomes: [], estimatedHours: 0,
  steps: [{ id: 'first', title: 'First step', description: '', required: true, prerequisiteStepIds: [], courses: [{ courseId: '', title: 'Preview' }] }] });
const stored = (id: string, published: boolean): AdminCareerPath => ({ id, revision: published ? 1 : 0, learners: 2,
  published: published ? content(id) : null, draft: content(id), updatedAt: '2026-10-10T10:00:00.000Z' });

describe('career path editor (US-T008, US-A003)', () => {
  let fixture: ComponentFixture<CareerPathEditor>;
  let saveResult: CareerPathResult;
  const unpublish = vi.fn(async (): Promise<CareerPathResult> => ({ ok: true }));
  const saveDraft = vi.fn(async (): Promise<CareerPathResult> => saveResult);

  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent ?? '';
  async function click(label: string): Promise<void> {
    const button = [...root().querySelectorAll('button')].find((item) => item.textContent?.trim().startsWith(label));
    if (!button) throw new Error(`No button "${label}" in: ${text()}`);
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    saveResult = { ok: true };
    unpublish.mockClear();
    saveDraft.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: CareerPathService, useValue: {
      token: signal('token'), adminCourses: signal([]), adminPaths: signal([stored('live', true), stored('hidden', false)]),
      loadAdmin: async () => ({ ok: true }), saveDraft, unpublish,
    } }] });
    vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
    fixture = TestBed.createComponent(CareerPathEditor);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps the save actions with the open path and reports unsaved changes', async () => {
    expect(text()).toContain('Choose a path to edit');
    await click('hidden');
    const savebar = root().querySelector('.cpe-savebar')!;
    expect(savebar.textContent).toContain('No unsaved changes.');
    expect(savebar.textContent).toContain('Save draft');
    expect(savebar.textContent).not.toContain('Withdraw');

    await click('Add step');
    expect(savebar.textContent).toContain('You have unsaved changes.');
    await click('Save draft');
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(savebar.textContent).toContain('Draft saved.');
  });

  it('US-A003-AC02 a refused stale save keeps the edits and offers the latest version', async () => {
    await click('hidden');
    await click('Add step');
    saveResult = { ok: false, message: 'Conflict', code: 'CAREER_PATH_CONFLICT' };
    await click('Save draft');
    expect(text()).toContain('Another admin changed this path after you opened it.');
    expect(text()).toContain('Load latest version');
    expect(root().querySelectorAll('.cpe-step').length).toBe(2);
  });

  it('US-A003-AC01 withdraw is offered for a published path only and asks first', async () => {
    await click('live');
    await click('Withdraw');
    expect(TestBed.inject(ConfirmService).ask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Withdraw "live"?', message: expect.stringContaining('2 learners follow') }));
    expect(unpublish).toHaveBeenCalledWith('live');
    expect(text()).toContain('Withdrawn. Learners no longer see this path.');
  });
});

describe('career milestone editing (US-A004)', () => {
  let fixture: ComponentFixture<CareerPathEditor>;
  const saveDraft = vi.fn(async (_id: string, _draft: CareerPathDraft): Promise<CareerPathResult> => ({ ok: true }));
  const foundation = { id: 'foundation', title: 'ISTQB Foundation', description: '', required: true, prerequisiteStepIds: [],
    stage: 'Foundation', roleMilestone: false, courses: [], requirementBundles: [['foundation-exam']],
    actions: [{ id: 'foundation-exam', kind: 'exam' as const, title: 'Passed Foundation exam', courseId: '' }] };
  const analyst: CareerPathDraft = { schemaVersion: 2, title: 'Test Analyst', summary: '', outcomes: [], estimatedHours: 0, steps: [foundation] };

  const root = () => fixture.nativeElement as HTMLElement;
  async function click(label: string): Promise<void> {
    const button = [...root().querySelectorAll('button')].find((item) => item.textContent?.trim().startsWith(label));
    if (!button) throw new Error(`No button "${label}" in: ${root().textContent}`);
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    saveDraft.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: CareerPathService, useValue: {
      token: signal('token'), adminCourses: signal([]), loadAdmin: async () => ({ ok: true }), saveDraft, unpublish: vi.fn(),
      adminPaths: signal<AdminCareerPath[]>([{ id: 'test-analyst', revision: 1, learners: 0, published: analyst, draft: analyst, updatedAt: 'x' }]),
    } }] });
    vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
    fixture = TestBed.createComponent(CareerPathEditor);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });
  afterEach(() => vi.restoreAllMocks());

  it('US-A004-AC01/AC02 a new career reuses the shared Foundation and gets its own milestones with actions and routes', async () => {
    root().querySelector<HTMLInputElement>('#cpe-new-title')!.value = 'Test Lead';
    await click('Add path');
    const reuse = root().querySelector<HTMLSelectElement>('#cpe-reuse')!;
    reuse.value = 'foundation';
    await click('Add shared milestone');
    expect(root().textContent).toContain('Milestone ID foundation, shared with Test Analyst');
    await click('Add step');
    expect(root().textContent).toContain('Recommendations only. They never complete the milestone');
    await click('Add action');
    await click('Add alternative route');
    expect(root().textContent).toContain('completing every ticked action in any one route');
    await click('Save draft');

    const draft = saveDraft.mock.calls[0][1];
    expect(saveDraft.mock.calls[0][0]).toBe('test-lead');
    expect(draft.schemaVersion).toBe(2);
    expect(draft.steps[0]).toEqual(foundation);
    const own = draft.steps[1];
    expect(own.id).toBe('test-lead-step-2');
    expect(own.actions!.map((action) => action.id)).toEqual(['test-lead-step-2-a1', 'test-lead-step-2-a2']);
    expect(own.requirementBundles).toEqual([['test-lead-step-2-a1', 'test-lead-step-2-a2']]);
  });

  it('US-L023-AC07 CV keywords are edited one per line', async () => {
    root().querySelector<HTMLInputElement>('#cpe-new-title')!.value = 'Test Lead';
    await click('Add path');
    await click('Add step');
    await click('Add action');
    expect(root().textContent).toContain('CV keywords');
    const box = root().querySelector<HTMLTextAreaElement>('.cpe-keywords textarea')!;
    box.value = 'ISTQB Foundation\n\n  CTFL ';
    box.dispatchEvent(new Event('change'));
    await click('Add action');
    await click('Save draft');

    const actions = saveDraft.mock.calls[0][1].steps.at(-1)!.actions!;
    expect(actions[0].cvKeywords).toEqual(['ISTQB Foundation', 'CTFL']);
    expect(actions[1].cvKeywords).toEqual([]);
  });

  it('"Comes after" is a searchable list with the chosen milestones shown as removable chips', async () => {
    root().querySelector<HTMLInputElement>('#cpe-new-title')!.value = 'Test Lead';
    await click('Add path');
    await click('Add step');
    await click('Add step');
    const search = root().querySelector<HTMLInputElement>('.cpe-search')!;
    search.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    const options = () => [...root().querySelectorAll('.cpe-option')].map((option) => option.textContent!.trim());
    expect(options()).toEqual(['test-lead-step-1This career', 'ISTQB FoundationFrom Test Analyst']);
    search.value = 'istqb';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(options()).toEqual(['ISTQB FoundationFrom Test Analyst']);
    const box = root().querySelector<HTMLInputElement>('.cpe-option input')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(root().querySelector('.cpe-picked')!.textContent).toContain('ISTQB Foundation');
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(root().querySelector('.cpe-options')).toBeNull();
    await click('Save draft');
    expect(saveDraft.mock.calls[0][1].steps[1].prerequisiteStepIds).toEqual(['foundation']);

    root().querySelector<HTMLButtonElement>('[aria-label="Remove ISTQB Foundation"]')!.click();
    fixture.detectChanges();
    expect(root().querySelector('.cpe-picked')).toBeNull();
  });

  it('US-A004-AC06 a changed requirement asks what changed for learners and sends the note', async () => {
    await click('Test Analyst');
    root().querySelector<HTMLButtonElement>('.cpe-step-toggle')!.click();
    fixture.detectChanges();
    expect(root().querySelector('.cpe-change')).toBeNull();

    await click('Add action');
    const boxes = [...root().querySelectorAll<HTMLInputElement>('.cpe-route input[type="checkbox"]')];
    boxes.at(-1)!.checked = true;
    boxes.at(-1)!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(root().textContent).toContain('publishing makes it version 2');
    const note = root().querySelector<HTMLTextAreaElement>('.cpe-change textarea')!;
    note.value = 'You now also complete the practical lab.';
    note.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    await click('Save draft');
    expect(saveDraft.mock.calls[0][1].steps[0].changeNote).toBe('You now also complete the practical lab.');
  });

  it('US-A004-AC06 after publishing, the editor shows the version and cleared note the server stored', async () => {
    const paths = TestBed.inject(CareerPathService).adminPaths as ReturnType<typeof signal<AdminCareerPath[]>>;
    const stored: CareerPathDraft = { ...analyst, steps: [{ ...foundation, requirementVersion: 2, changeNote: '' }] };
    saveDraft.mockImplementationOnce(async () => {
      paths.set([{ id: 'test-analyst', revision: 2, learners: 0, published: stored, draft: stored, updatedAt: 'z' }]);
      return { ok: true };
    });
    await click('Test Analyst');
    await click('Save and publish');
    root().querySelector<HTMLButtonElement>('.cpe-step-toggle')!.click();
    fixture.detectChanges();
    await click('Add action');
    expect(root().querySelector<HTMLTextAreaElement>('.cpe-change textarea')!.value).toBe('');
    expect(root().textContent).toContain('publishing makes it version 3');
    expect(root().textContent).toContain('Published. Learners now see this revision.');
  });

  it('US-A004 converting an old-format career reuses shared milestones and turns linked courses into course actions', async () => {
    const old: CareerPathDraft = { title: 'Old Tester', summary: '', outcomes: [], estimatedHours: 0, steps: [
      { id: 'foundation', title: 'Foundation', description: '', required: true, prerequisiteStepIds: [], courses: [{ courseId: '', title: 'Preview' }] },
      { id: 'design', title: 'Design', description: '', required: true, prerequisiteStepIds: ['foundation'],
        courses: [{ courseId: 'c1', title: 'Design course' }, { courseId: 'c2', title: 'Other design course' }] },
      { id: 'soft', title: 'Soft skills', description: '', required: false, prerequisiteStepIds: [], courses: [{ courseId: '', title: 'Planned' }] },
    ] };
    (TestBed.inject(CareerPathService).adminPaths as ReturnType<typeof signal<AdminCareerPath[]>>)
      .update((paths) => [...paths, { id: 'old-tester', revision: 1, learners: 0, published: old, draft: old, updatedAt: 'y' }]);
    fixture.detectChanges();
    await click('Old Tester');
    await click('Convert to milestone format');
    await click('Save draft');

    const draft = saveDraft.mock.calls[0][1];
    expect(draft.schemaVersion).toBe(2);
    expect(draft.steps[0]).toEqual(foundation);
    expect(draft.steps[1]).toMatchObject({ prerequisiteStepIds: ['foundation'], requirementBundles: [['design-a1'], ['design-a2']],
      actions: [{ id: 'design-a1', kind: 'course', title: 'Completed Design course', courseId: 'c1' },
        { id: 'design-a2', kind: 'course', title: 'Completed Other design course', courseId: 'c2' }] });
    expect(draft.steps[2].actions).toEqual([{ id: 'soft-a1', kind: 'activity', title: 'Soft skills', courseId: '' }]);
  });
});
