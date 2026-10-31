import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { CourseContentDocument } from '../app.models';
import { LearningPage } from '../pages/learning-page/learning-page';
import { CourseViewPage } from '../pages/course-view-page/course-view-page';
import { ApiClientService } from './api-client.service';
import { CourseRatingsService } from './course-ratings.service';
import { CourseService } from './course.service';
import { LessonExtrasService } from './lesson-extras.service';

vi.hoisted(() => {
  if (!customElements.get('mux-player')) customElements.define('mux-player', class extends HTMLElement {});
});

const content: CourseContentDocument = { _id: 'course', createdAt: '', updatedAt: '', sections: [{ id: 's', title: 'Start', components: [
  { id: 'text', title: 'Read me', type: 'text', durationMinutes: 5, content: 'Text', resourceUrl: '', attachments: [] },
] }] };
const course = { id: 'course', title: 'Practice course', description: 'Practise.', teacher: 'Teacher', level: 'Beginner', status: 'published',
  priceDkk: null, requirements: [], whatYoullLearn: [], careerGoals: [], thumbnailAssetId: '', category: 'Uncategorized', languages: [],
  rating: 0, ratingCount: 0, createdAt: '' };
const common = { appVersion: 'test', currentYear: 2026, student: { name: 'Learner', initials: 'L', role: 'Student' }, authToken: 'session',
  userEmail: 'learner@example.test', userRoleLabel: 'Student', canAccessAdmin: false, canEditCourse: false, course,
  coursesLoading: false, coursesError: '', courseContent: content, courseContentLoading: false, courseContentError: '', isEnrolled: true,
  isFeedbackOpen: false, feedbackSubmitted: false, feedbackPage: '', feedbackRating: '', feedbackText: '', feedbackSubmitting: false,
  feedbackError: '', feedbackOptions: [] };
const settle = async () => { await new Promise((resolve) => setTimeout(resolve)); };
const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('US-L028 course ratings', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  it('calls the rating routes with the agreed paths and bodies', async () => {
    TestBed.configureTestingModule({});
    const fetch = vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async () => new Response('{}'));
    const service = TestBed.inject(CourseRatingsService);
    await service.mine('c 1', 't');
    await service.save('c 1', { stars: 4, comment: 'Clear' }, 't');
    await service.reviews('c 1', '');
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await service.setHidden('c 1', 'r1', true, 't');
    expect(fetch.mock.calls.map(([path, init]) => [path, init?.method, init?.body])).toEqual([
      ['/users/me/courses/c%201/rating', 'GET', undefined],
      ['/users/me/courses/c%201/rating', 'PUT', JSON.stringify({ stars: 4, comment: 'Clear' })],
      ['/courses/c%201/reviews', 'GET', undefined],
      ['/admin/courses/c%201/reviews/r1', 'PATCH', JSON.stringify({ hidden: true })],
    ]);
    // A signed-out read sends no authorization header.
    expect(new Headers(fetch.mock.calls[2][1]?.headers).has('authorization')).toBe(false);
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Complete a lesson in this course before rating it.' }), { status: 403 }));
    await expect(service.save('c', { stars: 5 }, 't')).rejects.toThrow('Complete a lesson in this course before rating it.');
  });

  describe('learning page', () => {
    const ratings = { mine: vi.fn(), save: vi.fn() };

    async function setup(completed: string[], canRate: boolean) {
      if (completed.length) localStorage.setItem('qi-education:course-progress:learner@example.test:course', JSON.stringify(completed));
      ratings.mine.mockResolvedValue({ canRate, rating: null });
      ratings.save.mockResolvedValue({ rating: { stars: 4, comment: 'Clear steps', hidden: false, updatedAt: '' }, average: 4, count: 1 });
      TestBed.configureTestingModule({ imports: [LearningPage], providers: [provideRouter([]),
        { provide: CourseService, useValue: { downloadAttachment: vi.fn(), loadQuizImages: () => {}, quizImageUrls: () => ({}) } },
        { provide: LessonExtrasService, useValue: { listNotes: async () => [], enrolledLearners: async () => 1 } },
        { provide: CourseRatingsService, useValue: ratings },
      ] });
      const fixture = TestBed.createComponent(LearningPage);
      for (const [name, value] of Object.entries(common)) fixture.componentRef.setInput(name, value);
      fixture.detectChanges(); await settle(); fixture.detectChanges();
      return { fixture, body: fixture.nativeElement as HTMLElement };
    }

    it('US-L028-AC03 asks for a completed lesson before showing the form', async () => {
      const { body } = await setup([], false);
      expect(text(body.querySelector('.course-rating'))).toContain('Complete a lesson to rate this course.');
      expect(body.querySelector('.course-rating form')).toBeNull();
    });

    it('US-L028-AC01 sends stars and comment, then offers to update', async () => {
      const { fixture, body } = await setup(['text'], false);
      const send = () => [...body.querySelectorAll<HTMLButtonElement>('.course-rating button')].find((button) => /rating/.test(text(button)))!;
      expect(send().disabled).toBe(true);
      body.querySelector<HTMLButtonElement>('[aria-label="4 stars"]')!.click();
      const comment = body.querySelector<HTMLTextAreaElement>('.course-rating textarea')!;
      comment.value = '  Clear steps  '; comment.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      send().click(); await settle(); fixture.detectChanges();
      expect(ratings.save).toHaveBeenCalledWith('course', { stars: 4, comment: 'Clear steps' }, 'session');
      expect(text(body.querySelector('.course-rating h2'))).toBe('Your rating');
      expect(text(send())).toBe('Update rating');
      expect(text(body.querySelector('.course-rating'))).toContain('Saved.');
    });
  });

  describe('course details page', () => {
    const ratings = { reviews: vi.fn(), setHidden: vi.fn() };
    const list = (hidden: boolean) => ({ average: hidden ? 0 : 4, count: hidden ? 0 : 1, reviews: [
      { id: 'r1', firstName: 'Mette', stars: 4, comment: 'Useful exercises', updatedAt: '2026-10-30T10:00:00.000Z', ...(hidden ? { hidden: true } : {}) },
    ] });

    async function setup(admin: boolean) {
      ratings.reviews.mockReset().mockResolvedValueOnce(list(false)).mockResolvedValue(list(true));
      ratings.setHidden.mockReset().mockResolvedValue(undefined);
      TestBed.configureTestingModule({ imports: [CourseViewPage], providers: [provideRouter([]),
        { provide: CourseService, useValue: { thumbnailUrl: () => '', downloadAttachment: () => Promise.resolve() } },
        { provide: CourseRatingsService, useValue: ratings },
      ] });
      const fixture = TestBed.createComponent(CourseViewPage);
      const inputs = { ...common, canAccessAdmin: admin, priceSaving: false, priceSaveNotice: '', priceSaveNoticeError: false,
        catalogSaving: false, catalogSaveNotice: '', catalogSaveNoticeError: false, enrollmentSubmitting: false, enrollmentError: '', purchaseStatus: 'idle' };
      for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
      fixture.detectChanges(); await settle(); fixture.detectChanges();
      return { fixture, body: fixture.nativeElement as HTMLElement };
    }

    it('US-L028-AC02 shows the learner average and reviews with first names only', async () => {
      const { body } = await setup(false);
      const reviews = text(body.querySelector('#course-reviews'));
      expect(reviews).toContain('4.0');
      expect(reviews).toContain('1 rating');
      expect(reviews).toContain('Mette');
      expect(reviews).toContain('Useful exercises');
      expect(text(body.querySelector('.course-view-meta'))).toContain('4.0 (1)');
      expect(body.querySelector('.review-toggle')).toBeNull();
    });

    it('lets an admin hide a review, which reloads the list and the average', async () => {
      const { fixture, body } = await setup(true);
      body.querySelector<HTMLButtonElement>('.review-toggle')!.click(); await settle(); fixture.detectChanges();
      expect(ratings.setHidden).toHaveBeenCalledWith('course', 'r1', true, 'session');
      expect(text(body.querySelector('.review'))).toContain('Hidden');
      expect(text(body.querySelector('.review-toggle'))).toBe('Show');
      expect(text(body.querySelector('.course-view-meta'))).toContain('0.0 (0)');
    });
  });
});
