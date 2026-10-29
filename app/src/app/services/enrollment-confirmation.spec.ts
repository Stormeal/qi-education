import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppStateService } from './app-state.service';
import { ApiClientService } from './api-client.service';
import { CourseService } from './course.service';
import { AuthService } from './auth.service';

describe('US-P020 confirmation before course acquisition', () => {
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockResolvedValue(new Response('[]'));
  });
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });
  function start(emailConfirmed?: boolean) {
    const state = TestBed.inject(AppStateService);
    state.loginState.set({ token: 'test-session', user: { id: 'learner', displayName: 'Learner', email: 'learner@example.test', role: 'student', status: 'active', createdAt: '', enrolledCourseIds: [], emailConfirmed }, permissions: { canCreateCourses: false, hasAdminAccess: false } });
    return state;
  }
  it.each([undefined, true, false])('requires confirmation only for an explicitly unconfirmed account (%s)', confirmed => {
    expect(start(confirmed).mustConfirmEmail()).toBe(confirmed === false);
  });
  it.each(['enroll', 'checkout'])('maps a stale %s refusal to a confirmation notice and existing resend action', async operation => {
    const state = start(true), courses = TestBed.inject(CourseService);
    vi.spyOn(courses, operation === 'enroll' ? 'enrollCourse' : 'startCheckout').mockResolvedValue({ ok: false, message: 'email-not-confirmed' });
    if (operation === 'enroll') await state.enrollInCourse('course'); else await state.startCoursePurchase('course');
    expect(state.courseEnrollmentError()).toBe('Confirm your email to enroll.');
    expect(state.mustConfirmEmail()).toBe(true);
    const resend = vi.spyOn(TestBed.inject(AuthService), 'resendEmailConfirmation').mockResolvedValue({ confirmed: true, message: '' });
    await state.resendEmailConfirmation();
    expect(resend).toHaveBeenCalledWith('test-session');
    expect(state.mustConfirmEmail()).toBe(false);
  });
  it('allows organization-included acquisition for an unconfirmed account', async () => {
    const state = start(false), courses = TestBed.inject(CourseService);
    state.organizationAccess.set({ name: 'Team', openCourseIds: ['course'] });
    const enroll = vi.spyOn(courses, 'enrollCourse').mockResolvedValue({ ok: false, message: 'isolated failure' });
    await state.enrollInCourse('course');
    expect(enroll).toHaveBeenCalledWith('course', 'test-session');
  });
});
