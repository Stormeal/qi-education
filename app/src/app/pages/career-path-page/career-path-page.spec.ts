import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CareerPath, CareerPathSelection } from '../../app.models';
import { CareerPathService } from '../../services/career-path.service';
import { careerPathProgress } from '../../utils/career-path-progress';
import { CareerPathPage } from './career-path-page';

const path = (id: string, title: string, courseIds: string[]): CareerPath => ({
  id, revision: 1, title, summary: '', outcomes: [], estimatedHours: 0,
  steps: courseIds.map((courseId, index) => ({ id: `${id}-${index}`, title: `${title} step ${index + 1}`, description: '', required: true,
    prerequisiteStepIds: [], courses: [{ courseId, title: courseId, placeholder: false, available: true }] })),
});

describe('deliberate career path changes (US-L011)', () => {
  let fixture: ComponentFixture<CareerPathPage>;
  let saved: string[];
  let failNextSave: boolean;
  const selection = signal<CareerPathSelection | null>(null);

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  async function click(label: string): Promise<void> {
    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((item) => item.textContent?.trim().startsWith(label));
    if (!button) throw new Error(`No button "${label}" in: ${text()}`);
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    saved = [];
    failNextSave = false;
    selection.set({ pathId: 'analyst', revision: 1, selectedAt: '' });
    const paths = signal([path('analyst', 'Test Analyst', ['shared', 'design']), path('manager', 'Test Manager', ['shared', 'leading'])]);
    const selectedPath = computed(() => paths().find((item) => item.id === selection()?.pathId) ?? null);
    const progressFor = (item: CareerPath) => careerPathProgress(item, (courseId) => courseId === 'shared');
    const service = {
      state: signal('ready'), paths, selection, selectedPath, progressFor,
      progress: computed(() => (selectedPath() ? progressFor(selectedPath()!) : null)),
      nextAction: signal(null), coursePercent: (courseId: string) => (courseId === 'shared' ? 100 : 0),
      loadOutlines: async () => {}, reload: async () => {},
      select: async (pathId: string) => {
        if (failNextSave) { failNextSave = false; return { ok: false, message: 'Unable to reach the API. Please try again.' }; }
        saved.push(pathId);
        selection.set({ pathId, revision: 1, selectedAt: '' });
        return { ok: true };
      },
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: CareerPathService, useValue: service }] });
    fixture = TestBed.createComponent(CareerPathPage);
    const inputs: Record<string, unknown> = {
      appVersion: '0', currentYear: 2026, student: { name: 'Learner', currentRole: 'Student' }, userEmail: 'learner@example.test',
      userRoleLabel: 'Student', canAccessAdmin: false, isFeedbackOpen: false, feedbackSubmitted: false, feedbackPage: '',
      feedbackRating: '', feedbackText: '', feedbackSubmitting: false, feedbackError: '', feedbackOptions: [],
    };
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await click('Change target career');
  });

  it('AC01 choosing another path previews what carries over and saves nothing', async () => {
    await click('Choose this path');
    expect(text()).toContain('Switch from Test Analyst to Test Manager?');
    expect(text()).toContain('1 of 2 required steps are already complete');
    expect(text()).toContain('Test Manager step 1');
    expect(text()).toContain('Still to do: Test Manager step 2.');
    expect(saved).toEqual([]);
    expect(selection()?.pathId).toBe('analyst');
  });

  it('AC02 confirming saves the new path and opens it with the shared course counted once', async () => {
    await click('Choose this path');
    await click('Switch to Test Manager');
    expect(saved).toEqual(['manager']);
    expect(text()).toContain('Your flight path to Test Manager');
    expect(text()).toContain('1 of 2 required steps complete');
  });

  it('AC03 cancelling keeps the saved path; a failed save keeps the proposed choice with a retry', async () => {
    await click('Choose this path');
    await click('Keep Test Analyst');
    expect(text()).not.toContain('Switch from');
    expect(saved).toEqual([]);

    await click('Choose this path');
    failNextSave = true;
    await click('Switch to Test Manager');
    expect(text()).toContain('Your choice was not saved.');
    expect(selection()?.pathId).toBe('analyst');
    await click('Retry switching');
    expect(saved).toEqual(['manager']);
  });
});
