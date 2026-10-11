import { TestBed } from '@angular/core/testing';
import { ApiClientService } from './api-client.service';
import { InstructorProfileService } from './instructor-profile.service';
import { provideRouter } from '@angular/router';
import { AppStateService } from './app-state.service';

const reply = (value: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(value), { status });

describe('US-T007 instructor descriptions', () => {
  let service: InstructorProfileService;
  let calls: { url: string; method: string; authorization?: string; body?: string }[];
  let publicList: unknown;
  let saveStatus: number;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    calls = [];
    publicList = [{ description: 'Twenty years of test automation.', courseIds: ['c1', 'c2'] }];
    saveStatus = 200;
    const fetch = async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, method: init.method ?? 'GET', authorization: headers['authorization'], body: init.body as string | undefined });
      if (url === '/instructors') return reply(publicList);
      if (init.method === 'PUT') return saveStatus === 200 ? reply(JSON.parse(init.body as string)) : reply({ message: 'Too long.' }, saveStatus);
      if (init.method === 'DELETE') return reply(null, 204);
      return reply({ description: 'Mine' });
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiClientService, useValue: { fetch } }] });
    service = TestBed.inject(InstructorProfileService);
  });

  it('AC01 gives a card the description of whoever owns one of its courses', async () => {
    await service.loadPublic();
    expect(service.descriptionFor(['c2'])).toBe('Twenty years of test automation.');
    expect(calls[0].authorization).toBeUndefined();
  });

  it('AC02 gives no description for other courses or when the list cannot be loaded', async () => {
    await service.loadPublic();
    expect(service.descriptionFor(['other'])).toBe('');
    expect(service.descriptionFor([])).toBe('');
    publicList = { message: 'broken' };
    service.publicProfiles.set([]);
    await service.loadPublic(true);
    expect(service.descriptionFor(['c1'])).toBe('');
  });

  it('loads the public list once per visit and again after the teacher saves', async () => {
    await service.loadPublic();
    await service.loadPublic();
    expect(calls.filter((call) => call.url === '/instructors')).toHaveLength(1);
    service.token.set('teacher-token');
    const saved = await service.saveOwn('New text');
    expect(saved).toEqual({ ok: true, body: { description: 'New text' } });
    expect(calls.find((call) => call.method === 'PUT')?.authorization).toBe('Bearer teacher-token');
    await vi.waitFor(() => expect(calls.filter((call) => call.url === '/instructors')).toHaveLength(2));
  });

  it('reports the API message when a save is refused', async () => {
    saveStatus = 400;
    expect(await service.saveOwn('x')).toEqual({ ok: false, message: 'Too long.' });
  });

  it('clears a description as admin without expecting a body', async () => {
    service.token.set('admin-token');
    expect((await service.adminClear('user 1')).ok).toBe(true);
    expect(calls[0]).toMatchObject({ url: '/admin/instructor-profiles/user%201', method: 'DELETE', authorization: 'Bearer admin-token' });
  });
});

describe('US-T007 profile state', () => {
  const login = (role: 'teacher' | 'student') => ({ token: 'fresh-token', user: { id: 'u1', role, email: 'u1@example.test', displayName: 'U One',
    status: 'active' as const, createdAt: '', enrolledCourseIds: [] }, permissions: { canCreateCourses: role !== 'student', hasAdminAccess: false } });
  let state: AppStateService;
  let service: InstructorProfileService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    // No request may reach a real API: a 401 from one would sign the test user out.
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async () => new Response('[]'));
    state = TestBed.inject(AppStateService);
    service = TestBed.inject(InstructorProfileService);
  });
  afterEach(() => vi.restoreAllMocks());
  const loadProfile = () => (state as unknown as { loadProfileForCurrentUser(): void }).loadProfileForCurrentUser();

  it('reads the account description with the new session token right after sign-in', async () => {
    // A read without the token is a 401, which ends the session the user just started.
    const tokens: string[] = [];
    vi.spyOn(service, 'loadOwn').mockImplementation(async () => { tokens.push(service.token()); return { ok: true, body: { description: 'From the account' } }; });
    state.loginState.set(login('teacher'));
    loadProfile();
    await vi.waitFor(() => expect(state.profileBio()).toBe('From the account'));
    expect(tokens).toEqual(['fresh-token']);
    expect(state.profileDirty()).toBe(false);
  });

  it('does not ask for a description for a student', () => {
    const loadOwn = vi.spyOn(service, 'loadOwn');
    state.loginState.set(login('student'));
    loadProfile();
    expect(loadOwn).not.toHaveBeenCalled();
    expect(state.profileBioPublic()).toBe(false);
  });

  it('keeps the profile unsaved and says why when the account save fails, then saves on retry', async () => {
    vi.spyOn(service, 'loadOwn').mockResolvedValue({ ok: true, body: { description: '' } });
    const saveOwn = vi.spyOn(service, 'saveOwn').mockResolvedValue({ ok: false, message: 'Unable to reach the API. Please try again.' });
    state.loginState.set(login('teacher'));
    loadProfile();
    state.updateProfileBio(' I teach test design. ');
    await state.saveProfile();
    expect(state.profileError()).toContain('was not saved');
    expect(state.profileDirty()).toBe(true);
    expect(state.profileSaved()).toBe(false);

    saveOwn.mockResolvedValue({ ok: true, body: { description: 'I teach test design.' } });
    await state.saveProfile();
    expect(saveOwn).toHaveBeenLastCalledWith('I teach test design.');
    expect(state.profileError()).toBe('');
    expect(state.profileDirty()).toBe(false);
    expect(state.profileSaved()).toBe(true);
  });
});
