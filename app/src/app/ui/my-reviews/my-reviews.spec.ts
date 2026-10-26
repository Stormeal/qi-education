import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AppStateService } from '../../services/app-state.service';
import { CourseService } from '../../services/course.service';
import { MyReviews } from './my-reviews';

describe('US-A007 To review on Home', () => {
  let loadMyReviews: ReturnType<typeof vi.fn>;
  const loginState = signal<{ token: string; user: { role: string } } | null>(null);

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    loadMyReviews = vi.fn();
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      { provide: CourseService, useValue: { loadMyReviews } },
      { provide: AppStateService, useValue: { loginState } },
    ] });
  });
  afterEach(() => TestBed.resetTestingModule());

  async function render(role: string) {
    loginState.set({ token: 'token', user: { role } });
    const fixture = TestBed.createComponent(MyReviews);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('US-A007-AC05 lists the courses to review with my own verdict', async () => {
    loadMyReviews.mockResolvedValue([
      { courseId: 'c1', title: 'Test design', status: 'ready-for-review', verdict: 'waiting' },
      { courseId: 'c2', title: 'Exploratory testing', status: 'ready-for-review', verdict: 'approved' },
    ]);
    const host = await render('teacher');

    expect(loadMyReviews).toHaveBeenCalledWith('token');
    expect(host.querySelector('h2')?.textContent).toBe('To review');
    const links = [...host.querySelectorAll('a')];
    expect(links.map((link) => link.textContent)).toEqual(['Test design', 'Exploratory testing']);
    expect(links[0].getAttribute('href')).toBe('/courses/c1/edit');
    expect(host.textContent).toContain('Waiting for you');
    expect(host.textContent).toContain('Approved');
  });

  it('shows nothing when there is nothing to review, or for students', async () => {
    loadMyReviews.mockResolvedValue([]);
    expect((await render('admin')).textContent?.trim()).toBe('');
    loadMyReviews.mockClear();
    expect((await render('student')).textContent?.trim()).toBe('');
    expect(loadMyReviews).not.toHaveBeenCalled();
  });
});
