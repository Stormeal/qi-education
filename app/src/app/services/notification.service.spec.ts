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
});
