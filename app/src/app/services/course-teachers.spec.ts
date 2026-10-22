import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ApiClientService } from './api-client.service';
import { CourseService } from './course.service';

describe('US-A005 CourseService teacher list', () => {
  let fetch: ReturnType<typeof vi.fn>;
  let service: CourseService;
  const teachers = [{ id: 'A', displayName: 'Ane Holm', email: 'ane@example.test', active: true }];
  const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    fetch = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: ApiClientService, useValue: { fetch, invalidateCache: vi.fn() } }] });
    service = TestBed.inject(CourseService);
  });

  it('loads the teachers of a course as an admin', async () => {
    fetch.mockResolvedValue(answer(200, { teachers }));

    expect(await service.loadCourseTeachers('course 1', 'token')).toEqual({ ok: true, teachers });
    expect(fetch).toHaveBeenCalledWith('/courses/course%201/teachers', expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer token' }) }));
  });

  it('saves the whole list and returns the stored teachers', async () => {
    fetch.mockResolvedValue(answer(200, { teachers }));

    expect(await service.saveCourseTeachers('course', ['A'], 'token')).toEqual({ ok: true, teachers });
    expect(fetch).toHaveBeenCalledWith('/courses/course/teachers', expect.objectContaining({
      method: 'PUT', body: JSON.stringify({ teacherIds: ['A'] }) }));
  });

  it('passes the API message on, or a fallback when there is none', async () => {
    fetch.mockResolvedValueOnce(answer(400, { message: 'ghost is not a teacher account.' }));
    expect(await service.saveCourseTeachers('course', ['ghost'], 'token')).toEqual({ ok: false, message: 'ghost is not a teacher account.' });
    fetch.mockResolvedValueOnce(answer(503, {}));
    expect(await service.loadCourseTeachers('course', 'token')).toEqual({ ok: false, message: 'Unable to load course teachers.' });
    fetch.mockRejectedValueOnce(new Error('offline'));
    expect(await service.saveCourseTeachers('course', [], 'token')).toEqual({ ok: false, message: 'Unable to save course teachers.' });
  });
});
