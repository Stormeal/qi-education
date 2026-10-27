import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TeachingCourse } from '../../app.models';
import { AppStateService } from '../../services/app-state.service';
import { CourseService } from '../../services/course.service';
import { TeachingOverview } from './teaching-overview';

const course = (over: Partial<TeachingCourse>): TeachingCourse => ({ courseId: 'c1', title: 'Test design', status: 'published',
  enrolledLearners: 12, startedLearners: 8, completedLearners: 3, averageProgress: 46,
  feedback: { helpful: 5, notHelpful: 1, problems: 1 }, recentFeedback: [], ...over });

describe('US-T016 Your teaching on Home', () => {
  let load: () => Promise<TeachingCourse[]>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      { provide: AppStateService, useValue: { loginState: signal({ token: 'token' }) } },
      { provide: CourseService, useValue: { teachingOverview: () => load() } }] });
  });
  afterEach(() => TestBed.resetTestingModule());

  async function render() {
    const fixture = TestBed.createComponent(TeachingOverview);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('US-T016-AC01 lists my courses with learner numbers and average progress', async () => {
    load = async () => [course({}), course({ courseId: 'c2', title: 'Draft course', status: 'draft', enrolledLearners: 0,
      startedLearners: 0, completedLearners: 0, averageProgress: null, feedback: { helpful: 0, notHelpful: 0, problems: 0 } })];
    const host = await render();

    expect(host.querySelector('h2')?.textContent).toBe('Your teaching');
    const links = [...host.querySelectorAll('a')];
    expect(links.map((link) => link.textContent)).toEqual(['Test design', 'Draft course']);
    expect(links[1].getAttribute('href')).toBe('/courses/c2/edit');
    expect(host.textContent).toMatch(/12 enrolled, 8 started,\s+3 completed/);
    expect(host.textContent).toContain('Average progress 46%');
    expect(host.textContent).toContain('No learners yet');
  });

  it('US-T016-AC02 shows lesson feedback counts and the newest items without a learner name', async () => {
    load = async () => [course({ recentFeedback: [
      { id: 'f1', componentId: 'l1', lessonTitle: 'Boundary values', kind: 'problem', category: 'video', message: 'Stops at 2:10', createdAt: '2026-10-26T10:00:00Z' },
      { id: 'f2', componentId: 'gone', lessonTitle: null, kind: 'helpful', category: null, message: '', createdAt: '2026-10-25T10:00:00Z' },
    ] })];
    const host = await render();

    expect(host.querySelector('summary')?.textContent).toMatch(/5 helpful, 1 not helpful,\s+1 problem\b/);
    expect(host.textContent).toContain('Problem: Video does not play');
    expect(host.textContent).toContain('Boundary values');
    expect(host.textContent).toContain('Stops at 2:10');
    expect(host.textContent).toContain('Removed lesson');
  });

  it('shows nothing when I teach no course', async () => {
    load = async () => [];
    expect((await render()).textContent?.trim()).toBe('');
  });

  it('US-T016-AC04 says so with Try again when the overview cannot be loaded', async () => {
    load = async () => { throw new Error('Unable to load your courses.'); };
    const fixture = TestBed.createComponent(TeachingOverview);
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Unable to load your courses.');

    load = async () => [course({})];
    host.querySelector('button')!.click();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain('Test design');
  });
});
