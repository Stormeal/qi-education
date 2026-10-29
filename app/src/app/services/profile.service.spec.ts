import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { UserProfileDetails } from '../app.models';
import { ApiClientService } from './api-client.service';
import { AppStateService } from './app-state.service';

const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const never = { bio: '', jobTitle: '', company: '', learningGoals: '', avatarColor: '#2f4f43', updatedAt: null };
const onAccount = { bio: 'Tester since 2019', jobTitle: 'QA engineer', company: 'Nordic Test', learningGoals: 'ISTQB Advanced', avatarColor: '#7a4b2a', updatedAt: '2026-10-13T08:00:00.000Z' };
const notificationPrefs = { reviewActivity: true, organization: true, adminInbox: true };
const onDevice: UserProfileDetails = { bio: 'Old bio', jobTitle: 'Tester', company: '', learningGoals: 'Automation', avatarColor: '#2f4f43', notificationPrefs };

describe('US-L003 profile details on the account', () => {
  const login = (id = 'u1') => ({ token: `token-${id}`, user: { id, role: 'student' as const, email: `${id}@example.test`, displayName: 'U One',
    status: 'active' as const, createdAt: '', enrolledCourseIds: [] }, permissions: { canCreateCourses: false, hasAdminAccess: false } });
  let state: AppStateService;
  let account: unknown;
  let saveReply: () => Response;
  let calls: { method: string; authorization: string; body?: UserProfileDetails }[];
  const loadProfile = () => (state as unknown as { loadProfileForCurrentUser(): void }).loadProfileForCurrentUser();
  const puts = () => calls.filter((call) => call.method === 'PUT');

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    account = never; calls = []; saveReply = () => reply({ ...onAccount });
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    // No request may reach a real API: a 401 from one would sign the test user out.
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async (path, init = {}) => {
      if (path !== '/users/me/profile') return new Response('[]');
      const method = init.method ?? 'GET';
      calls.push({ method, authorization: (init.headers as Record<string, string>)['authorization'], body: init.body ? JSON.parse(init.body as string) : undefined });
      return method === 'PUT' ? saveReply() : reply(account);
    });
    state = TestBed.inject(AppStateService);
  });
  afterEach(() => vi.restoreAllMocks());

  it('AC01 shows the profile saved to the account, on a device that has never seen it', async () => {
    account = onAccount;
    state.loginState.set(login());
    loadProfile();
    await vi.waitFor(() => expect(state.profileJobTitle()).toBe('QA engineer'));
    expect([state.profileBio(), state.profileCompany(), state.profileLearningGoals(), state.profileAvatarColor()])
      .toEqual(['Tester since 2019', 'Nordic Test', 'ISTQB Advanced', '#7a4b2a']);
    expect(state.profileDirty()).toBe(false);
    expect(calls[0]).toMatchObject({ method: 'GET', authorization: 'Bearer token-u1' });
    expect(puts()).toHaveLength(0);
  });

  it('AC01 saves to the account and reports it only after the account accepted it', async () => {
    state.loginState.set(login());
    loadProfile();
    state.updateProfileJobTitle('  Test lead ');
    await state.saveProfile();
    expect(puts()).toHaveLength(1);
    expect(puts()[0].authorization).toBe('Bearer token-u1');
    expect(puts()[0].body).toEqual({ bio: '', jobTitle: 'Test lead', company: '', learningGoals: '', avatarColor: '#2f4f43', notificationPrefs });
    expect(state.profileSaved()).toBe(true);
    expect(state.profileDirty()).toBe(false);
  });

  it('AC02 keeps the edits and says why when the account refuses or cannot be reached, then saves on retry', async () => {
    state.loginState.set(login());
    loadProfile();
    state.updateProfileLearningGoals('Become a test architect');
    saveReply = () => reply({ message: 'Learning goals can be at most 280 characters.' }, 400);
    await state.saveProfile();
    expect(state.profileError()).toBe('Your profile was not saved. Learning goals can be at most 280 characters.');
    expect(state.profileLearningGoals()).toBe('Become a test architect');
    expect(state.profileDirty()).toBe(true);
    expect(state.profileSaved()).toBe(false);
    expect(localStorage.getItem('qiEducationProfile:u1')).toBeNull();

    saveReply = () => { throw new Error('offline'); };
    await state.saveProfile();
    expect(state.profileError()).toContain('Unable to reach the API');
    expect(state.profileDirty()).toBe(true);

    saveReply = () => reply({ ...onAccount });
    await state.saveProfile();
    expect(state.profileError()).toBe('');
    expect(state.profileDirty()).toBe(false);
  });

  it('hands a profile kept on this device over to an account that has none, once', async () => {
    localStorage.setItem('qiEducationProfile:u1', JSON.stringify(onDevice));
    state.loginState.set(login());
    loadProfile();
    await vi.waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0].body).toEqual(onDevice);
    expect(state.profileJobTitle()).toBe('Tester');

    account = { ...onDevice, updatedAt: '2026-10-13T09:00:00.000Z' };
    loadProfile();
    await vi.waitFor(() => expect(calls.filter((call) => call.method === 'GET')).toHaveLength(2));
    await Promise.resolve();
    expect(puts()).toHaveLength(1);
  });

  it('sends nothing when neither the account nor the device has a profile', async () => {
    state.loginState.set(login());
    loadProfile();
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await Promise.resolve();
    expect(puts()).toHaveLength(0);
  });

  it('keeps the device copy when the account cannot be read, and what the user is typing when it arrives late', async () => {
    localStorage.setItem('qiEducationProfile:u1', JSON.stringify(onDevice));
    account = { message: 'Profile storage is temporarily unavailable.' };
    state.loginState.set(login());
    loadProfile();
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(state.profileBio()).toBe('Old bio');

    account = onAccount;
    loadProfile();
    state.updateProfileBio('Typing right now');
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    await Promise.resolve();
    expect(state.profileBio()).toBe('Typing right now');
  });

  it('AC02 never shows one account the profile of the account that was signed in before', async () => {
    account = onAccount;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const fetch = vi.mocked(TestBed.inject(ApiClientService).fetch);
    const answer = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (path, init) => { await held; return answer(path, init); });
    state.loginState.set(login('u1'));
    loadProfile();
    state.loginState.set(login('u2'));
    release();
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await Promise.resolve();
    expect(state.profileJobTitle()).toBe('');
    expect(localStorage.getItem('qiEducationProfile:u2')).toBeNull();
  });
});
