import { TestBed } from '@angular/core/testing';
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

  function render(course: { priceDkk: number | null }, isEnrolled = true) {
    const fixture = TestBed.createComponent(CourseViewPage);
    const inputs = { appVersion: 'test', currentYear: 2026, student: { name: 'Learner', initials: 'L', role: 'Student' },
      authToken: 'session', userEmail: 'learner@example.test', userRoleLabel: 'Student', canAccessAdmin: false, canEditCourse: false,
      course: { id: 'course', title: 'Practice course', description: 'Practise.', teacher: 'Teacher', level: 'Beginner', status: 'published', priceDkk: course.priceDkk, requirements: [], whatYoullLearn: [], careerGoals: [],
        thumbnailAssetId: '', category: 'Uncategorized', languages: [], rating: 0, ratingCount: 0, createdAt: '' },
      coursesLoading: false, coursesError: '', courseContent: content, courseContentLoading: false, courseContentError: '',
      priceSaving: false, priceSaveNotice: '', priceSaveNoticeError: false, catalogSaving: false, catalogSaveNotice: '', catalogSaveNoticeError: false,
      isEnrolled, enrollmentSubmitting: false, enrollmentError: '', isFeedbackOpen: false,
      feedbackSubmitted: false, feedbackPage: '', feedbackRating: '', feedbackText: '', feedbackSubmitting: false, feedbackError: '', feedbackOptions: [],
    };
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('US-L016-AC08 lists an exercise lesson in the curriculum', () => {
    const item = render({ priceDkk: null }).querySelector('.curriculum-item-copy')!;
    expect(item.querySelector('strong')?.textContent).toBe('Rewrite the brittle test');
    expect(item.querySelector('small')?.textContent).toBe('Exercise');
  });

  it('US-L001 says a listed price is for information and enrolling is free', () => {
    const priced = render({ priceDkk: 400 }, false);
    expect(priced.querySelector('.course-price')?.textContent).toContain('400 DKK');
    expect(priced.querySelector('.course-price-note')?.textContent).toBe('Price for information only. Enrolling is free.');
  });

  it('US-L001 shows no payment note on a free course', () => {
    expect(render({ priceDkk: null }, false).querySelector('.course-price-note')).toBeNull();
  });
});
