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
