// US-L024: buying a priced course through Stripe Checkout and confirming on return.
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { LoginState } from '../app.models';
import { AppStateService } from './app-state.service';
import { CourseService } from './course.service';

function session(enrolledCourseIds: string[] = []): LoginState {
  return { token: 'token', user: { id: 'learner', role: 'student', email: 'learner@example.test', displayName: 'Learner',
    status: 'active', createdAt: '', enrolledCourseIds }, permissions: { canCreateCourses: false, hasAdminAccess: false } };
}

describe('US-L024 course purchase', () => {
  let state: AppStateService;
  let service: CourseService;
  let assigned: string[];

  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    state = TestBed.inject(AppStateService);
    service = TestBed.inject(CourseService);
    state.loginState.set(session());
    assigned = [];
    (state as unknown as { assignLocation: (url: string) => void }).assignLocation = url => assigned.push(url);
  });

  it('sends the current page as return address and goes to the Stripe URL', async () => {
    const start = vi.spyOn(service, 'startCheckout').mockResolvedValue({ ok: true, url: 'https://checkout.stripe.test/cs_1' });
    await state.startCoursePurchase('course-1');
    expect(start).toHaveBeenCalledWith('course-1', 'token', `${window.location.origin}${window.location.pathname}`);
    expect(assigned).toEqual(['https://checkout.stripe.test/cs_1']);
    expect(state.coursePurchaseStatus()).toBe('redirecting');
  });

  it('shows the API message when checkout is refused', async () => {
    vi.spyOn(service, 'startCheckout').mockResolvedValue({ ok: false, message: 'Purchases are temporarily unavailable.' });
    await state.startCoursePurchase('course-1');
    expect(assigned).toEqual([]);
    expect(state.courseEnrollmentError()).toBe('Purchases are temporarily unavailable.');
    expect(state.courseEnrollmentSubmitting()).toBe(false);
  });

  it('confirms a paid session and enrolls', async () => {
    const login = { user: session(['course-1']).user, permissions: session().permissions };
    vi.spyOn(service, 'confirmCheckout').mockResolvedValue({ status: 'paid', login });
    await state.handleCoursePurchaseReturn('course-1', 'success', 'cs_1');
    expect(service.confirmCheckout).toHaveBeenCalledWith('course-1', 'token', 'cs_1');
    expect(state.coursePurchaseStatus()).toBe('paid');
    expect(state.enrolledCourseIds()).toContain('course-1');
  });

  it('confirm on an enrolled course shows paid', async () => {
    state.loginState.set(session(['course-1']));
    vi.spyOn(service, 'confirmCheckout').mockResolvedValue({ status: 'paid',
      login: { user: session(['course-1']).user, permissions: session().permissions } });
    await state.handleCoursePurchaseReturn('course-1', 'success', 'cs_1');
    expect(state.coursePurchaseStatus()).toBe('paid');
    expect(state.enrolledCourseIds()).toEqual(['course-1']);
  });

  it('reports an unpaid session', async () => {
    vi.spyOn(service, 'confirmCheckout').mockResolvedValue({ status: 'unpaid' });
    await state.handleCoursePurchaseReturn('course-1', 'success', 'cs_1');
    expect(state.coursePurchaseStatus()).toBe('unpaid');
  });

  it('reports unreachable when confirmation fails', async () => {
    vi.spyOn(service, 'confirmCheckout').mockRejectedValue(new TypeError('offline'));
    await state.handleCoursePurchaseReturn('course-1', 'success', 'cs_1');
    expect(state.coursePurchaseStatus()).toBe('unreachable');
  });

  it('marks a cancelled checkout without calling the API', async () => {
    const confirm = vi.spyOn(service, 'confirmCheckout');
    await state.handleCoursePurchaseReturn('course-1', 'cancelled', null);
    expect(confirm).not.toHaveBeenCalled();
    expect(state.coursePurchaseStatus()).toBe('cancelled');
  });

  it('ignores a page load without payment parameters', async () => {
    const confirm = vi.spyOn(service, 'confirmCheckout');
    await state.handleCoursePurchaseReturn('course-1', null, null);
    expect(confirm).not.toHaveBeenCalled();
    expect(state.coursePurchaseStatus()).toBe('idle');
  });
});

describe('US-L024 checkout requests', () => {
  let service: CourseService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    service = TestBed.inject(CourseService);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('maps confirm answers to paid, unpaid and unreachable', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { paid: true, user: session().user, permissions: session().permissions }));
    expect((await service.confirmCheckout('course-1', 'token', 'cs_1')).status).toBe('paid');
    fetchMock.mockResolvedValueOnce(json(200, { paid: false }));
    expect(await service.confirmCheckout('course-1', 'token', 'cs_1')).toEqual({ status: 'unpaid' });
    fetchMock.mockResolvedValueOnce(json(404, { message: 'Checkout not found.' }));
    expect(await service.confirmCheckout('course-1', 'token', 'cs_1')).toEqual({ status: 'unpaid' });
    fetchMock.mockResolvedValueOnce(json(503, { message: 'Purchases are temporarily unavailable.' }));
    expect(await service.confirmCheckout('course-1', 'token', 'cs_1')).toEqual({ status: 'unreachable' });
  });

  it('answers the checkout URL or the API message', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { url: 'https://checkout.stripe.test/cs_1' }));
    expect(await service.startCheckout('course-1', 'token', 'http://localhost:4200/courses/course-1'))
      .toEqual({ ok: true, url: 'https://checkout.stripe.test/cs_1' });
    fetchMock.mockResolvedValueOnce(json(409, { message: 'You are already enrolled in this course.' }));
    expect(await service.startCheckout('course-1', 'token', 'http://localhost:4200/courses/course-1'))
      .toEqual({ ok: false, message: 'You are already enrolled in this course.' });
  });
});
