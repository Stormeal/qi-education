import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MyReview } from '../../app.models';
import { AppStateService } from '../../services/app-state.service';
import { MyReviews } from './my-reviews';

describe('US-A007 To review on Home', () => {
  const myReviews = signal<MyReview[]>([]);

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AppStateService, useValue: { myReviews } }] });
  });
  afterEach(() => TestBed.resetTestingModule());

  function render(reviews: MyReview[]) {
    myReviews.set(reviews);
    const fixture = TestBed.createComponent(MyReviews);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('US-A007-AC05 lists the courses to review with my own verdict', () => {
    const host = render([
      { courseId: 'c1', title: 'Test design', status: 'ready-for-review', verdict: 'waiting' },
      { courseId: 'c2', title: 'Exploratory testing', status: 'ready-for-review', verdict: 'approved' },
    ]);

    expect(host.querySelector('h2')?.textContent).toBe('To review');
    const links = [...host.querySelectorAll('a')];
    expect(links.map((link) => link.textContent)).toEqual(['Test design', 'Exploratory testing']);
    expect(links[0].getAttribute('href')).toBe('/courses/c1/edit');
    expect(host.textContent).toContain('Waiting for you');
    expect(host.textContent).toContain('Approved');
  });

  it('shows the course state instead of a stale verdict once it left review', () => {
    const host = render([
      { courseId: 'c1', title: 'Test design', status: 'published', verdict: 'waiting' },
      { courseId: 'c2', title: 'Exploratory testing', status: 'draft', verdict: 'waiting' },
    ]);
    expect(host.textContent).toContain('Published');
    expect(host.textContent).toContain('Back with its teachers');
    expect(host.textContent).not.toContain('Waiting for you');
  });

  it('shows nothing when there is nothing to review', () => {
    expect(render([]).textContent?.trim()).toBe('');
  });
});
