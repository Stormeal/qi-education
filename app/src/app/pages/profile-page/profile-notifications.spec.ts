import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProfilePage } from './profile-page';
import { ApiClientService } from '../../services/api-client.service';
import { AppStateService } from '../../services/app-state.service';
import { ProfileService } from '../../services/profile.service';
import { routes } from '../../app.routes';

describe('US-P019 D1 notification settings', () => {
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    TestBed.configureTestingModule({ imports: [ProfilePage], providers: [provideRouter([])] });
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async () => new Response('[]'));
  });
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });
  it.each([['Student', false, ['Organization']], ['Teacher', false, ['Organization', 'Review activity']], ['Platform admin', true, ['Organization', 'Review activity', 'Admin inbox']]] as const)('shows role-appropriate choices for %s', (roleLabel, canAccessAdmin, labels) => {
    const fixture = TestBed.createComponent(ProfilePage);
    const inputs = { appVersion: 'test', currentYear: 2026, displayName: 'Learner', email: 'learner@example.test', roleLabel,
      canAccessAdmin, memberSince: '', enrolledCount: 0, avatarColor: '#2f4f43', avatarColorOptions: ['#2f4f43'], bio: '', jobTitle: '', company: '', learningGoals: '', profileSaving: false, profileSaved: false, profileDirty: true, isFeedbackOpen: false, feedbackSubmitted: false, feedbackPage: '', feedbackRating: '', feedbackText: '', feedbackSubmitting: false, feedbackError: '', feedbackOptions: [], initialTab: 'notifications', notificationPrefs: { reviewActivity: true, organization: true, adminInbox: true } };
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe('Notifications');
    const toggles = Array.from(page.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(toggles.map(input => input.closest('label')?.querySelector('strong')?.textContent?.trim())).toEqual([...labels]);
    const changed = vi.fn(); fixture.componentInstance.notificationPrefsChanged.subscribe(changed);
    toggles[0].checked = false; toggles[0].dispatchEvent(new Event('change'));
    expect(changed).toHaveBeenCalledWith({ reviewActivity: true, organization: false, adminInbox: true });
    expect(routes.find(route => route.path === 'settings')?.data?.['initialTab']).toBe('notifications');
  });
  it('round-trips preferences with the account profile and marks the edit clean after save', async () => {
    const profiles = TestBed.inject(ProfileService);
    const account = { bio: '', jobTitle: '', company: '', learningGoals: '', avatarColor: '#2f4f43', updatedAt: '2026-10-29', notificationPrefs: { reviewActivity: true, organization: false, adminInbox: true } };
    vi.spyOn(profiles, 'loadAccount').mockResolvedValue(account);
    const save = vi.spyOn(profiles, 'saveAccount').mockResolvedValue({ ok: true });
    const state = TestBed.inject(AppStateService);
    state.loginState.set({ token: 'token', user: { id: 'one', displayName: 'One', email: 'one@example.test', role: 'student', status: 'active', createdAt: '', enrolledCourseIds: [] }, permissions: { canCreateCourses: false, hasAdminAccess: false } });
    (state as unknown as { loadProfileForCurrentUser(): void }).loadProfileForCurrentUser();
    await vi.waitFor(() => expect(state.profileNotificationPrefs().organization).toBe(false));
    state.updateNotificationPrefs({ ...state.profileNotificationPrefs(), organization: true });
    expect(state.profileDirty()).toBe(true);
    await state.saveProfile();
    expect(save).toHaveBeenCalledWith('token', expect.objectContaining({ notificationPrefs: { reviewActivity: true, organization: true, adminInbox: true } }));
    expect(state.profileDirty()).toBe(false);
  });
});
