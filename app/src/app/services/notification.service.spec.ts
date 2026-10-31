import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiClientService } from './api-client.service';
import { NotificationService } from './notification.service';
import { AppStateService } from './app-state.service';
import { AuthService } from './auth.service';
import type { NotificationItem, LoginState } from '../app.models';

const row: NotificationItem = { id: 'n', userId: 'one', type: 'org-invitation', title: 'You are invited', link: '/organization', createdAt: '2026-10-29T10:00:00Z', readAt: null };
describe('US-P019 C1 notification session service', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); TestBed.configureTestingModule({ providers: [provideRouter([])] }); });
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });
  it('caches within the session, refreshes on demand, and marks only by authenticated API calls', async () => {
    const client = TestBed.inject(ApiClientService), service = TestBed.inject(NotificationService);
    const fetcher = vi.spyOn(client, 'fetch').mockImplementation(async (_path, init) =>
      init.method === 'POST' ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ notifications: [row] })));
    service.setSession('token'); service.setUnreadCount(3);
    expect(await service.list()).toEqual([row]); expect(await service.list()).toEqual([row]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await service.list(true); expect(fetcher).toHaveBeenCalledTimes(2);
    await service.markRead('n'); expect(service.unreadCount()).toBe(2);
    expect(fetcher).toHaveBeenCalledWith('/notifications/n/read', expect.objectContaining({ method: 'POST', headers: { authorization: 'Bearer token' } }));
    await service.markAllRead(); expect(service.unreadCount()).toBe(0);
    expect(fetcher).toHaveBeenCalledWith('/notifications/read-all', expect.objectContaining({ method: 'POST' }));
  });
  it('discards stale replies and private cache/count when the account changes', async () => {
    const service = TestBed.inject(NotificationService);
    let answer!: (response: Response) => void;
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockReturnValue(new Promise(resolve => answer = resolve));
    service.setSession('one'); service.setUnreadCount(5);
    const pending = service.list(); service.setSession('two');
    answer(new Response(JSON.stringify({ notifications: [row] })));
    expect(await pending).toEqual([]); expect(service.unreadCount()).toBe(0);
  });
  it('does not clear the count when a mark-read request fails', async () => {
    const service = TestBed.inject(NotificationService);
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockResolvedValue(new Response('{}', { status: 503 }));
    service.setSession('token'); service.setUnreadCount(4);
    await expect(service.markAllRead()).rejects.toThrow();
    expect(service.unreadCount()).toBe(4);
  });
  it('applies a refreshed unread count even when the restored user and permissions have not changed', async () => {
    const session: LoginState = { token: 'session-token', user: { id: 'one', email: 'one@example.test', displayName: 'One', role: 'student', status: 'active', createdAt: '', enrolledCourseIds: [] }, permissions: { canCreateCourses: false, hasAdminAccess: false } };
    sessionStorage.setItem('qiEducationSession', JSON.stringify(session));
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async () => new Response('[]'));
    vi.spyOn(TestBed.inject(AuthService), 'restoreSession').mockResolvedValue({ user: session.user, permissions: session.permissions, unreadNotifications: 7 });
    TestBed.inject(AppStateService);
    await vi.waitFor(() => expect(TestBed.inject(NotificationService).unreadCount()).toBe(7));
  });
  it('hydrates the unread count after a fresh sign-in without a new poller', async () => {
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async () => new Response('[]'));
    const session = { token: 'new-session', user: { id: 'one', email: 'one@example.test', displayName: 'One', role: 'student' as const, status: 'active' as const, createdAt: '', enrolledCourseIds: [] }, permissions: { canCreateCourses: false, hasAdminAccess: false } };
    vi.spyOn(TestBed.inject(AuthService), 'login').mockResolvedValue({ ok: true, login: session });
    vi.spyOn(TestBed.inject(AuthService), 'restoreSession').mockResolvedValue({ ...session, unreadNotifications: 4 });
    const state = TestBed.inject(AppStateService);
    state.updateEmail('one@example.test'); state.updatePassword('Password123!');
    await state.submitLogin();
    await vi.waitFor(() => expect(TestBed.inject(NotificationService).unreadCount()).toBe(4));
  });

  it('US-P024-AC01 starts a list during sign-in without waiting for it to complete', async () => {
    let resolveList!: (response: Response) => void;
    const listReply = new Promise<Response>(resolve => resolveList = resolve);
    const fetcher = vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async path =>
      path === '/notifications' ? listReply : new Response('[]'));
    const session: LoginState = { token: 'new-session', user: { id: 'one', email: 'one@example.test', displayName: 'One',
      role: 'student', status: 'active', createdAt: '', enrolledCourseIds: [] },
      permissions: { canCreateCourses: false, hasAdminAccess: false } };
    vi.spyOn(TestBed.inject(AuthService), 'login').mockResolvedValue({ ok: true, login: session });
    vi.spyOn(TestBed.inject(AuthService), 'restoreSession').mockResolvedValue({ ...session, unreadNotifications: 1 });
    const state = TestBed.inject(AppStateService);
    state.updateEmail('one@example.test'); state.updatePassword('Password123!');
    await state.submitLogin();
    expect(state.loginState()?.token).toBe('new-session');
    expect(state.isSubmitting()).toBe(false);
    expect(fetcher).toHaveBeenCalledWith('/notifications', expect.objectContaining({ method: 'GET' }));
    resolveList(new Response(JSON.stringify({ notifications: [row] })));
    expect(await TestBed.inject(NotificationService).list()).toEqual([row]);
  });

  it('US-P024-AC01 preloads after validating an unchanged restored session', async () => {
    const session: LoginState = { token: 'restored', user: { id: 'one', email: 'one@example.test', displayName: 'One',
      role: 'student', status: 'active', createdAt: '', enrolledCourseIds: [] },
      permissions: { canCreateCourses: false, hasAdminAccess: false } };
    sessionStorage.setItem('qiEducationSession', JSON.stringify(session));
    const fetcher = vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async path =>
      new Response(JSON.stringify(path === '/notifications' ? { notifications: [row] } : [])));
    vi.spyOn(TestBed.inject(AuthService), 'restoreSession').mockResolvedValue({ ...session, unreadNotifications: 1 });
    TestBed.inject(AppStateService);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledWith('/notifications', expect.objectContaining({ method: 'GET' })));
    expect(await TestBed.inject(NotificationService).list()).toEqual([row]);
  });

  it('US-P024-AC01 starts a list after signup without delaying the new session', async () => {
    const fetcher = vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async path =>
      path === '/notifications' ? new Promise<Response>(() => {}) : new Response('[]'));
    const session: LoginState = { token: 'signed-up', user: { id: 'one', email: 'one@example.test', displayName: 'One',
      role: 'student', status: 'active', createdAt: '', enrolledCourseIds: [] },
      permissions: { canCreateCourses: false, hasAdminAccess: false } };
    vi.spyOn(TestBed.inject(AuthService), 'signup').mockResolvedValue({ ok: true, login: session });
    const state = TestBed.inject(AppStateService);
    state.signupDisplayName.set('One User'); state.updateEmail('one@example.test');
    state.updatePassword('Password123!'); state.signupPasswordConfirmation.set('Password123!');
    await state.submitSignup();
    expect(state.loginState()?.token).toBe('signed-up'); expect(state.isSubmitting()).toBe(false);
    expect(fetcher).toHaveBeenCalledWith('/notifications', expect.objectContaining({ method: 'GET' }));
  });

  it('US-P024-AC04 a failed background preload does not fail sign-in and a later list retries', async () => {
    let failList!: (response: Response) => void;
    const failedReply = new Promise<Response>(resolve => failList = resolve);
    const fetcher = vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async path =>
      path === '/notifications' ? failedReply : new Response('[]'));
    const session: LoginState = { token: 'session', user: { id: 'one', email: 'one@example.test', displayName: 'One',
      role: 'student', status: 'active', createdAt: '', enrolledCourseIds: [] },
      permissions: { canCreateCourses: false, hasAdminAccess: false } };
    vi.spyOn(TestBed.inject(AuthService), 'login').mockResolvedValue({ ok: true, login: session });
    vi.spyOn(TestBed.inject(AuthService), 'restoreSession').mockResolvedValue({ ...session, unreadNotifications: 1 });
    const state = TestBed.inject(AppStateService);
    state.updateEmail('one@example.test'); state.updatePassword('Password123!');
    await state.submitLogin();
    await vi.waitFor(() => expect(TestBed.inject(NotificationService).unreadCount()).toBe(1));
    expect(state.loginState()?.token).toBe('session'); expect(state.loginError()).toBe('');
    const failedRequest = TestBed.inject(NotificationService).list();
    failList(new Response('{}', { status: 503 }));
    await expect(failedRequest).rejects.toThrow('could not be loaded');
    fetcher.mockResolvedValue(new Response(JSON.stringify({ notifications: [row] })));
    expect(await TestBed.inject(NotificationService).list()).toEqual([row]);
  });

  it.each(['one', 'all'])('US-P024-AC05 applies marking %s read even if a list refreshed while the POST was pending', async action => {
    const service = TestBed.inject(NotificationService);
    let finishWrite!: (response: Response) => void;
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async (_path, init) =>
      init.method === 'POST' ? new Promise(resolve => finishWrite = resolve)
        : new Response(JSON.stringify({ notifications: [row] })));
    service.setSession('token'); service.setUnreadCount(1); await service.list();
    const write = action === 'one' ? service.markRead('n') : service.markAllRead();
    await service.list(true);
    finishWrite(new Response(null, { status: 204 })); await write;
    expect(service.unreadCount()).toBe(0);
    expect((await service.list())[0].readAt).not.toBeNull();
  });

  it('US-P024-AC05 ignores a pre-read sign-in count that arrives after Mark all read', async () => {
    const session: LoginState = { token: 'session', user: { id: 'one', email: 'one@example.test', displayName: 'One',
      role: 'student', status: 'active', createdAt: '', enrolledCourseIds: [] },
      permissions: { canCreateCourses: false, hasAdminAccess: false } };
    let finishCount!: (value: Omit<LoginState, 'token'> & { unreadNotifications: number }) => void;
    const oldCount = new Promise<Omit<LoginState, 'token'> & { unreadNotifications: number }>(resolve => finishCount = resolve);
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async (path, init) => init.method === 'POST'
      ? new Response(null, { status: 204 }) : new Response(JSON.stringify(path === '/notifications' ? { notifications: [row] } : [])));
    vi.spyOn(TestBed.inject(AuthService), 'login').mockResolvedValue({ ok: true, login: session });
    vi.spyOn(TestBed.inject(AuthService), 'restoreSession').mockReturnValue(oldCount);
    const state = TestBed.inject(AppStateService), service = TestBed.inject(NotificationService);
    state.updateEmail('one@example.test'); state.updatePassword('Password123!'); await state.submitLogin();
    service.setUnreadCount(1); await service.markAllRead();
    finishCount({ ...session, unreadNotifications: 1 }); await oldCount;
    expect(service.unreadCount()).toBe(0);
  });

  it('US-P024-AC05 keeps the newer count when two background count replies arrive out of order', async () => {
    const service = TestBed.inject(NotificationService);
    const replies: ((response: Response) => void)[] = [];
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(() => new Promise(resolve => replies.push(resolve)));
    service.setSession('token');
    const older = service.refreshCount(), newer = service.refreshCount();
    replies[1](new Response(JSON.stringify({ unreadNotifications: 3 }))); await newer;
    replies[0](new Response(JSON.stringify({ unreadNotifications: 1 }))); await older;
    expect(service.unreadCount()).toBe(3);
  });
});

describe('Notification saved inbox and live count', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); TestBed.configureTestingModule({ providers: [provideRouter([])] }); });
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });
  const stream = (...chunks: string[]) => new Response(new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); },
  }), { headers: { 'content-type': 'text/event-stream' } });

  it('restores the saved inbox only for the account that owns it', async () => {
    const first = TestBed.inject(NotificationService);
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockResolvedValue(new Response(JSON.stringify({ notifications: [row] })));
    first.liveUpdates = false;
    first.setSession('token-a', 'user-a'); first.setUnreadCount(1); await first.list();
    TestBed.resetTestingModule(); TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const reloaded = TestBed.inject(NotificationService); reloaded.liveUpdates = false;
    reloaded.setSession('token-a', 'user-a');
    expect(reloaded.unreadCount()).toBe(1); expect(reloaded.cachedList()).toEqual([row]);
    reloaded.setSession('token-b', 'user-b');
    expect(reloaded.unreadCount()).toBe(0); expect(reloaded.cachedList()).toBeUndefined();
    expect(sessionStorage.getItem('qi-education:notifications')).toBeNull();
  });

  it('applies counts pushed by the stream and refreshes a loaded list', async () => {
    const service = TestBed.inject(NotificationService);
    const later = { ...row, id: 'm' };
    let lists = 0;
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async path => {
      if (path === '/notifications/stream') return stream('event: count\ndata: 1\n\n', ': keep-alive\n\nevent: co', 'unt\ndata: 2\n\n');
      lists++; return new Response(JSON.stringify({ notifications: lists === 1 ? [row] : [later, row] }));
    });
    service.setSession('token', 'user'); await service.prefetch();
    await vi.waitFor(() => expect(service.unreadCount()).toBe(2));
    await vi.waitFor(() => expect(service.cachedList()).toEqual([later, row]));
    service.setSession('');
  });
});
