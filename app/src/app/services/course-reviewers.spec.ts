import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ApiClientService } from './api-client.service';
import { CourseService } from './course.service';

describe('US-A007 CourseService reviewers', () => {
  let fetch: ReturnType<typeof vi.fn>;
  let service: CourseService;
  const reviewers = [{ id: 'R', displayName: 'Rikke Dam', email: 'rikke@example.test', active: true }];
  const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    fetch = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: ApiClientService, useValue: { fetch, invalidateCache: vi.fn() } }] });
    service = TestBed.inject(CourseService);
  });

  it('US-A007-AC01 loads and saves the reviewers of a course, keeping a mail warning', async () => {
    fetch.mockResolvedValueOnce(answer(200, { reviewers }));
    expect(await service.loadCourseReviewers('course 1', 'token')).toEqual({ ok: true, reviewers });
    expect(fetch).toHaveBeenLastCalledWith('/courses/course%201/reviewers', expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer token' }) }));

    fetch.mockResolvedValueOnce(answer(200, { reviewers, mailWarning: 'Reviewers were saved, but some emails could not be sent.' }));
    expect(await service.saveCourseReviewers('course', ['R'], 'token')).toEqual({ ok: true, reviewers,
      mailWarning: 'Reviewers were saved, but some emails could not be sent.' });
    expect(fetch).toHaveBeenLastCalledWith('/courses/course/reviewers', expect.objectContaining({
      method: 'PUT', body: JSON.stringify({ reviewerIds: ['R'] }) }));
  });

  it('passes the API message on, or a fallback when there is none', async () => {
    fetch.mockResolvedValueOnce(answer(400, { message: 'T teaches this course and cannot also review it.' }));
    expect(await service.saveCourseReviewers('course', ['T'], 'token')).toEqual({ ok: false, message: 'T teaches this course and cannot also review it.' });
    fetch.mockRejectedValueOnce(new Error('offline'));
    expect(await service.loadCourseReviewers('course', 'token')).toEqual({ ok: false, message: 'Unable to load course reviewers.' });
  });

  it('US-A007-AC05 loads my reviews, and reads a failure as none', async () => {
    const reviews = [{ courseId: 'c1', title: 'Test design', status: 'ready-for-review', verdict: 'waiting' }];
    fetch.mockResolvedValueOnce(answer(200, { reviews }));
    expect(await service.loadMyReviews('token')).toEqual(reviews);
    expect(fetch).toHaveBeenLastCalledWith('/reviews/mine', expect.anything());
    fetch.mockResolvedValueOnce(answer(404, { message: 'Not found' }));
    expect(await service.loadMyReviews('token')).toEqual([]);
  });
});
