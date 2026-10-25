import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CourseContentDocument } from '../../app.models';
import { CourseService } from '../../services/course.service';
import { CourseViewPage } from './course-view-page';

// The learning view and its quiz tests moved to learning-page.spec.ts (US-L016).
const content: CourseContentDocument = { _id: 'course', createdAt: '', updatedAt: '', sections: [{ id: 's', title: 'Practice', components: [
  { id: 'exercise', title: 'Rewrite the brittle test', type: 'exercise', durationMinutes: 30, content: 'Steps', resourceUrl: '', attachments: [] },
] }] };

describe('course details page', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({ imports: [CourseViewPage], providers: [provideRouter([]),
      { provide: CourseService, useValue: { thumbnailUrl: () => '', downloadAttachment: () => Promise.resolve() } },
    ] }).compileComponents();
  });

  let rendered: CourseViewPage;
  let fixture: ComponentFixture<CourseViewPage>;

  function render(course: { priceDkk: number | null }, isEnrolled = true, purchaseStatus = 'idle', enrollmentError = '') {
    fixture = TestBed.createComponent(CourseViewPage);
    const inputs = { appVersion: 'test', currentYear: 2026, student: { name: 'Learner', initials: 'L', role: 'Student' },
      authToken: 'session', userEmail: 'learner@example.test', userRoleLabel: 'Student', canAccessAdmin: false, canEditCourse: false,
      course: { id: 'course', title: 'Practice course', description: 'Practise.', teacher: 'Teacher', level: 'Beginner', status: 'published', priceDkk: course.priceDkk, requirements: [], whatYoullLearn: [], careerGoals: [],
        thumbnailAssetId: '', category: 'Uncategorized', languages: [], rating: 0, ratingCount: 0, createdAt: '' },
      coursesLoading: false, coursesError: '', courseContent: content, courseContentLoading: false, courseContentError: '',
      priceSaving: false, priceSaveNotice: '', priceSaveNoticeError: false, catalogSaving: false, catalogSaveNotice: '', catalogSaveNoticeError: false,
      isEnrolled, enrollmentSubmitting: false, enrollmentError, purchaseStatus, isFeedbackOpen: false,
      feedbackSubmitted: false, feedbackPage: '', feedbackRating: '', feedbackText: '', feedbackSubmitting: false, feedbackError: '', feedbackOptions: [],
    };
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    rendered = fixture.componentInstance;
    return fixture.nativeElement as HTMLElement;
  }

  it('US-L016-AC08 lists an exercise lesson in the curriculum', () => {
    const item = render({ priceDkk: null }).querySelector('.curriculum-item-copy')!;
    expect(item.querySelector('strong')?.textContent).toBe('Rewrite the brittle test');
    expect(item.querySelector('small')?.textContent).toBe('Exercise');
  });

  it('US-L024 offers to buy a priced course and emits the purchase', () => {
    const page = render({ priceDkk: 499 }, false);
    const started: string[] = [];
    rendered.coursePurchaseStarted.subscribe(id => started.push(id));
    const button = page.querySelector<HTMLButtonElement>('.course-enroll-body button')!;
    expect(button.textContent?.trim()).toBe('Buy for 499 DKK');
    expect(page.textContent).not.toContain('Price for information only');
    button.click();
    expect(started).toEqual(['course']);
  });

  it('price field accepts free or 3 to 999,999 DKK only (Stripe minimum)', () => {
    render({ priceDkk: null }, false);
    const page = rendered as unknown as { updatePriceDraft(v: string): void; applyPriceDraft(id: string): void; priceDraftError(): string };
    const saved: (number | null)[] = [];
    rendered.coursePriceSaved.subscribe(event => saved.push(event.priceDkk));
    for (const value of ['2', '1000000']) {
      page.updatePriceDraft(value); page.applyPriceDraft('course');
      expect(page.priceDraftError()).toBe('Enter 0 for free, or a whole number of DKK from 3 to 999,999.');
    }
    for (const value of ['', '0', '3', '999999']) { page.updatePriceDraft(value); page.applyPriceDraft('course'); }
    expect(saved).toEqual([null, 0, 3, 999999]);
  });

  it('DEF-057 catalog settings show the stored category, not the first option', async () => {
    const page = render({ priceDkk: null });
    const view = rendered as unknown as { openCatalogModal(course: unknown): void; course(): unknown };
    view.openCatalogModal(view.course());
    TestBed.tick();
    await new Promise(resolve => setTimeout(resolve));
    expect(page.querySelector<HTMLSelectElement>('.price-field select')?.value).toBe('Uncategorized');
  });

  it('X10 the enroll dialog takes focus, closes on Escape and gives focus back', async () => {
    const page = render({ priceDkk: null }, false);
    document.body.appendChild(page);
    const opener = page.querySelector<HTMLButtonElement>('.course-enroll-body button')!;
    opener.focus();
    opener.click();
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve));
    const dialog = page.querySelector('[role=dialog]')!;
    expect(dialog.contains(document.activeElement)).toBe(true);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve));
    expect(page.querySelector('[role=dialog]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    page.remove();
  });

  it('US-O001-AC09 shows Enroll (included by the organization) instead of Buy', () => {
    const page = render({ priceDkk: 499 }, false);
    fixture.componentRef.setInput('organizationAccess', { name: 'QA Team', openCourseIds: ['course'] });
    fixture.detectChanges();
    expect(page.querySelector('.course-enroll-body button')?.textContent?.trim()).toBe('Enroll (included by QA Team)');
    expect(page.textContent).not.toContain('Buy for');
  });

  it('US-L024 keeps Enroll on a free course', () => {
    expect(render({ priceDkk: null }, false).querySelector('.course-enroll-body button')?.textContent?.trim()).toBe('Enroll');
    expect(render({ priceDkk: 0 }, false).querySelector('.course-enroll-body button')?.textContent?.trim()).toBe('Enroll');
  });

  it.each([
    ['confirming', 'Confirming payment'],
    ['unpaid', 'The payment was not completed. You have not been charged.'],
    ['unreachable', 'We could not confirm your payment yet. Do not pay again: if you were charged, the course appears in My Learning within a few minutes.'],
    ['cancelled', 'Payment cancelled. You have not been charged.'],
  ])('US-L024 shows the %s purchase message', (status, message) => {
    expect(render({ priceDkk: 499 }, false, status).querySelector('.purchase-status')?.textContent).toContain(message);
  });

  it('US-L024 offers Try again after an unpaid return', () => {
    expect(render({ priceDkk: 499 }, false, 'unpaid').querySelector('.course-enroll-body button')?.textContent?.trim()).toBe('Try again');
  });

  it('US-L024 confirms a paid purchase next to Start learning', () => {
    const page = render({ priceDkk: 499 }, true, 'paid');
    expect(page.querySelector('.purchase-status')?.textContent).toContain('Payment received');
    expect(page.querySelector('.course-enroll-body button')?.textContent?.trim()).toBe('Start learning');
  });

  it('US-L024 shows a refused checkout next to the buy button', () => {
    expect(render({ priceDkk: 499 }, false, 'idle', 'Purchases are temporarily unavailable.')
      .querySelector('.course-enroll-body .course-error')?.textContent).toBe('Purchases are temporarily unavailable.');
  });
});
