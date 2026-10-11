import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import type { LoginState } from '../app.models';
import { ApiClientService } from './api-client.service';
import { AppStateService } from './app-state.service';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

const token = (exp: number) => `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: 'u1', exp })).replace(/=+$/, '')}.signature`;
const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;
function stored(role: 'student' | 'teacher', exp = inAnHour()): LoginState {
  return { token: token(exp), user: { id: 'u1', role, email: 'u1@example.test', displayName: 'U One', status: 'active', createdAt: '',
    enrolledCourseIds: [] }, permissions: { canCreateCourses: role === 'teacher', hasAdminAccess: false } };
}

describe('US-P010 opening the app from the stored session', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  /** Starts the app with this stored session; `check` is what the background session check answers. */
  async function start(session: LoginState | null, check?: () => Promise<Omit<LoginState, 'token'> | null>) {
    if (session) localStorage.setItem('qiEducationSession', JSON.stringify(session));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    // Every other request of the start-up stays in the test and answers with nothing.
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async () => new Response('[]'));
    const restore = vi.spyOn(TestBed.inject(AuthService), 'restoreSession');
    if (check) restore.mockImplementation(check);
    const state = TestBed.inject(AppStateService);
    await vi.waitFor(() => expect(restore.mock.results.every((result) => result.type !== 'incomplete')).toBe(true));
    await Promise.resolve(); await Promise.resolve();
    return { state, restore };
  }

  it('AC01 is signed in from the first moment and checks the session in the background', async () => {
    let answer!: (value: Omit<LoginState, 'token'>) => void;
    const session = stored('student');
    localStorage.setItem('qiEducationSession', JSON.stringify(session));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async () => new Response('[]'));
    const restore = vi.spyOn(TestBed.inject(AuthService), 'restoreSession')
      .mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const state = TestBed.inject(AppStateService);
    // The check has not answered, and the user is already in.
    expect(state.loginState()?.user.displayName).toBe('U One');
    expect(restore).toHaveBeenCalledWith(session.token);
    const before = state.loginState();
    answer({ user: session.user, permissions: session.permissions });
    await Promise.resolve(); await Promise.resolve();
    // Unchanged account: the very same session object, so loads that were running stay valid.
    expect(state.loginState()).toBe(before);
  });

  it('AC02 shows the current role when it changed, and remembers it for the next visit', async () => {
    const now = stored('teacher');
    const { state } = await start(stored('student'), async () => ({ user: now.user, permissions: now.permissions }));
    await vi.waitFor(() => expect(state.loginState()?.user.role).toBe('teacher'));
    expect(state.loginState()?.permissions.canCreateCourses).toBe(true);
    expect(JSON.parse(localStorage.getItem('qiEducationSession')!).user.role).toBe('teacher');
  });

  it('AC03 signs out with a request to log in again when the session is no longer valid', async () => {
    const { state } = await start(stored('student'), async () => null);
    await vi.waitFor(() => expect(state.loginState()).toBeNull());
    expect(state.loginError()).toBe('Please log in again.');
    expect(localStorage.getItem('qiEducationSession')).toBeNull();
  });

  it('AC03 does not show the app or ask the API when the stored token has already expired', async () => {
    const { state, restore } = await start(stored('student', Math.floor(Date.now() / 1000) - 60));
    expect(state.loginState()).toBeNull();
    expect(restore).not.toHaveBeenCalled();
    expect(state.loginError()).toBe('Your session has expired. Please log in again.');
    expect(localStorage.getItem('qiEducationSession')).toBeNull();
  });

  it('AC04 stays signed in when the check cannot be made', async () => {
    const { state } = await start(stored('student'), async () => { throw new TypeError('Failed to fetch'); });
    expect(state.loginState()?.user.id).toBe('u1');
    expect(state.loginError()).toBe('');
    expect(localStorage.getItem('qiEducationSession')).not.toBeNull();
  });

  it('AC04 treats only a 401 as "not valid"; a server error is a failed check', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fetch = vi.spyOn(TestBed.inject(ApiClientService), 'fetch');
    const auth = TestBed.inject(AuthService);
    fetch.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    expect(await auth.restoreSession('t')).toBeNull();
    fetch.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await expect(auth.restoreSession('t')).rejects.toThrow();
  });

  it('keeps a stored token it cannot read, so the API decides', () => {
    localStorage.setItem('qiEducationSession', JSON.stringify({ ...stored('student'), token: 'not-a-token' }));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const sessions = TestBed.inject(SessionService);
    expect(sessions.restoreLoginState()?.token).toBe('not-a-token');
    expect(sessions.expiredOnRestore).toBe(false);
  });
});
