import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AccountCareers, CareerPath, CareerPathStep } from '../../app.models';
import { CareerPathResult, CareerPathService } from '../../services/career-path.service';
import { CvTextService } from '../../services/cv-text.service';
import { CvScan } from './cv-scan';

const step = (id: string, title: string, keyword: string): CareerPathStep => ({
  id, title, description: '', required: true, prerequisiteStepIds: [], courses: [],
  actions: [{ id: `${id}-exam`, kind: 'exam', title: `Passed ${title}`, courseId: '', available: true, cvKeywords: [keyword] }],
  requirementBundles: [[`${id}-exam`]],
});
const PATHS: CareerPath[] = [{ id: 'test-analyst', revision: 1, schemaVersion: 2, title: 'Test Analyst', summary: '', outcomes: [],
  estimatedHours: 0, steps: [step('foundation', 'ISTQB Foundation', 'CTFL'), step('analyst', 'Advanced Test Analyst', 'CTAL-TA'),
    step('manager', 'Advanced Test Management', 'CTAL-TM')] }];
const CV = 'Certified: CTFL in 2019, CTAL-TA in 2021 and CTAL-TM in 2023. Eight years of testing at a bank.';

describe('CV scan (US-L023)', () => {
  let fixture: ComponentFixture<CvScan>;
  let saves: string[][];
  let done: number[];
  let cvText: string;
  let saveResult: CareerPathResult;
  const careers = signal<AccountCareers | null>(null);

  const host = () => fixture.nativeElement as HTMLElement;
  const text = () => host().textContent?.replace(/\s+/g, ' ') ?? '';
  const boxes = () => [...host().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  const input = () => host().querySelector<HTMLInputElement>('input[type="file"]')!;
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }
  async function choose(file: File): Promise<void> {
    Object.defineProperty(input(), 'files', { value: [file], configurable: true });
    input().dispatchEvent(new Event('change'));
    await settle();
  }
  async function drop(file: File): Promise<void> {
    const event = new Event('drop', { cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
    host().querySelector('.cvs-dropzone')!.dispatchEvent(event);
    await settle();
  }
  async function click(label: string): Promise<void> {
    const button = [...host().querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
    if (!button) throw new Error(`No button "${label}" in: ${text()}`);
    button.click();
    await settle();
  }
  const pdf = (size = 100) => new File([new Uint8Array(size)], 'cv.pdf');

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    saves = [];
    done = [];
    cvText = CV;
    saveResult = { ok: true };
    careers.set({ followedPathIds: [], focusPathId: null, achievements: [], milestoneStates: {}, satisfiedActionIds: ['manager-exam'] });
    const service = {
      paths: signal(PATHS), careers,
      recogniseFromCv: async (actionIds: string[]) => {
        saves.push(actionIds);
        if (saveResult.ok) careers.update((value) => ({ ...value!, satisfiedActionIds: [...value!.satisfiedActionIds, ...actionIds] }));
        return saveResult;
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: CareerPathService, useValue: service }] });
    TestBed.inject(CvTextService).extractors = { pdf: async () => cvText, docx: async () => cvText };
    fixture = TestBed.createComponent(CvScan);
    fixture.componentInstance.done.subscribe((count) => done.push(count));
    await settle();
  });

  it('US-L023-AC03 says the CV stays on this device and accepts only PDF and Word', () => {
    expect(text()).toContain('Your CV is read on this device only. It is never uploaded or saved.');
    expect(input().accept).toBe('.pdf,.docx');
  });

  it('US-L023-AC01 lists each finding ticked, with its milestone and the CV text; recorded ones have no checkbox', async () => {
    await choose(pdf());
    expect(text()).toContain('We found these in your CV');
    expect(boxes().map((box) => box.checked)).toEqual([true, true]);
    expect(text()).toContain('Passed ISTQB Foundation');
    expect(text()).toContain('Completes ISTQB Foundation');
    expect(text()).toContain('CTFL in 2019');
    const recorded = host().querySelector('.cvs-recorded')!;
    expect(recorded.textContent).toContain('Already recorded');
    expect(recorded.textContent).toContain('Passed Advanced Test Management');
    expect(recorded.querySelector('input')).toBeNull();
  });

  it('US-L023-AC02 US-L023-AC03 saves only the ticked action IDs', async () => {
    await choose(pdf());
    boxes()[1].click();
    await settle();
    await click('Save');
    expect(saves).toEqual([['foundation-exam']]);
    expect(done).toEqual([1]);
    expect(text()).not.toContain('We found these in your CV');
  });

  it('US-L023-AC02 Cancel saves nothing', async () => {
    await choose(pdf());
    await click('Cancel');
    expect(saves).toEqual([]);
    expect(done).toEqual([0]);
    expect(text()).not.toContain('CTFL in 2019');
  });

  it('US-L023-AC06 explains each file that cannot be used and points to manual recording', async () => {
    const cases: [() => Promise<void>, string][] = [
      [() => drop(new File(['x'], 'cv.doc')), 'Choose a PDF or Word (.docx) file up to 10 MB.'],
      [() => choose(pdf(10 * 1024 * 1024 + 1)), 'Choose a PDF or Word (.docx) file up to 10 MB.'],
      [async () => { cvText = 'scan'; await choose(pdf()); }, "We couldn't read text from this file (it may be a scanned image)."],
      [async () => { cvText = 'Eight years of manual and exploratory testing at a bank in Aarhus.'; await choose(pdf()); },
        "We didn't find any certifications we recognise."],
    ];
    for (const [act, message] of cases) {
      await act();
      expect(text()).toContain(message);
      expect(text()).toContain('You can record your achievements yourself instead.');
    }
    TestBed.inject(CvTextService).extractors.pdf = async () => { throw new Error('PasswordException'); };
    await choose(pdf());
    expect(text()).toContain("We couldn't open this file.");
    expect(saves).toEqual([]);
  });

  it('US-L023-AC08 a failed save keeps the findings and offers a retry', async () => {
    saveResult = { ok: false, message: 'Unable to reach the API. Please try again.' };
    await choose(pdf());
    await click('Save');
    expect(text()).toContain('Unable to reach the API. Please try again.');
    expect(boxes()).toHaveLength(2);
    expect(done).toEqual([]);
    saveResult = { ok: true };
    await click('Try again');
    expect(saves).toEqual([['foundation-exam', 'analyst-exam'], ['foundation-exam', 'analyst-exam']]);
    expect(done).toEqual([2]);
  });

  it('US-L023-AC04 scanning the same CV again lists saved findings as already recorded', async () => {
    await choose(pdf());
    await click('Save');
    await choose(pdf());
    expect(boxes()).toHaveLength(0);
    expect(text()).toContain('Nothing new in your CV');
    expect(host().querySelector('.cvs-recorded')!.textContent).toContain('Passed ISTQB Foundation');
  });
});
