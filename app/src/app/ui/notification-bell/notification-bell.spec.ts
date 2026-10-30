import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ApiClientService } from '../../services/api-client.service';
import { NotificationService } from '../../services/notification.service';
import { NotificationBell } from './notification-bell';
import type { NotificationItem } from '../../app.models';

const row: NotificationItem = { id: 'n', userId: 'one', type: 'org-invitation', title: 'Join the team', link: '/organization', createdAt: '2026-10-29T10:00:00Z', readAt: null };
describe('US-P019 C2 notification bell', () => {
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    TestBed.configureTestingModule({ imports: [NotificationBell], providers: [provideRouter([])] });
  });
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });
  async function setup(rows: NotificationItem[] = [row]) {
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async (_path, init) =>
      init.method === 'POST' ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ notifications: rows })));
    const service = TestBed.inject(NotificationService); service.setSession('token'); service.setUnreadCount(rows.length);
    const fixture = TestBed.createComponent(NotificationBell);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    const trigger = page.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]')!;
    const open = async () => { trigger.click(); fixture.detectChanges(); await vi.waitFor(() => { fixture.detectChanges(); expect(page.textContent).not.toContain('Loading notifications...'); }); };
    return { fixture, page, trigger, service, open };
  }
  it('keeps unread state on open, marks the clicked row and navigates', async () => {
    const f = await setup(), navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    expect(f.page.querySelector('.notification-dot')).not.toBeNull();
    await f.open(); expect(f.service.unreadCount()).toBe(1);
    expect(f.page.textContent).toContain('Join the team');
    f.page.querySelector<HTMLButtonElement>('.notification-item')!.click();
    await vi.waitFor(() => expect(f.service.unreadCount()).toBe(0)); f.fixture.detectChanges();
    expect(f.service.unreadCount()).toBe(0);
    expect(navigate).toHaveBeenCalledWith('/organization');
  });
  it('refreshes the count when new activity arrived since sign-in', async () => {
    const f = await setup(); f.service.setUnreadCount(0);
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async path => new Response(JSON.stringify(
      path === '/me' ? { unreadNotifications: 1 } : { notifications: [row] })));
    await f.open();
    await vi.waitFor(() => expect(f.service.unreadCount()).toBe(1));
    expect(Array.from(f.page.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.includes('Mark all read'))?.disabled).toBe(false);
  });
  it('marks all read and returns keyboard focus to the trigger on Escape', async () => {
    const f = await setup(); document.body.append(f.page);
    await f.open();
    Array.from(f.page.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.includes('Mark all read'))!.click();
    await vi.waitFor(() => expect(f.service.unreadCount()).toBe(0)); f.fixture.detectChanges();
    expect(f.service.unreadCount()).toBe(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); f.fixture.detectChanges();
    expect(f.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(f.trigger); f.page.remove();
  });
  it('shows the empty state and clears private content when the session changes', async () => {
    const f = await setup([]); await f.open();
    expect(f.page.textContent).toContain("You're all caught up.");
    f.service.setSession('another'); f.fixture.detectChanges();
    expect(f.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(f.page.querySelector('.notification-panel')).toBeNull();
  });
  it('allows retry after list failure without clearing unread count', async () => {
    const f = await setup();
    const load = vi.spyOn(f.service, 'list').mockRejectedValue(new Error('offline'));
    await f.open();
    expect(f.page.textContent).toContain('could not be loaded');
    expect(f.service.unreadCount()).toBe(1);
    load.mockResolvedValue([row]);
    Array.from(f.page.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === 'Retry')!.click();
    await f.fixture.whenStable(); f.fixture.detectChanges();
    expect(f.page.textContent).toContain('Join the team');
  });

  it('US-P024-AC02 displays cached notices immediately while a slow refresh gets newer activity', async () => {
    const f = await setup(); await f.service.list();
    let answer!: (response: Response) => void;
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async path =>
      path === '/me' ? new Response(JSON.stringify({ unreadNotifications: 2 })) : new Promise(resolve => answer = resolve));
    f.trigger.click(); f.fixture.detectChanges();
    expect(f.page.textContent).toContain('Join the team');
    expect(f.page.textContent).not.toContain('Loading notifications...');
    answer(new Response(JSON.stringify({ notifications: [{ ...row, id: 'new', title: 'New review activity' }, row] })));
    await vi.waitFor(() => { f.fixture.detectChanges(); expect(f.page.textContent).toContain('New review activity'); });
    expect(f.page.textContent).toContain('Join the team');
  });

  it('US-P024-AC03 joins an unfinished preload instead of restarting it when the bell opens', async () => {
    const f = await setup();
    let answer!: (response: Response) => void;
    const fetcher = vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async path =>
      path === '/me' ? new Response(JSON.stringify({ unreadNotifications: 1 })) : new Promise(resolve => answer = resolve));
    const preload = f.service.list();
    f.trigger.click(); f.fixture.detectChanges();
    expect(fetcher.mock.calls.filter(([path]) => path === '/notifications')).toHaveLength(1);
    answer(new Response(JSON.stringify({ notifications: [row] })));
    await preload;
    await vi.waitFor(() => { f.fixture.detectChanges(); expect(f.page.textContent).toContain('Join the team'); });
  });

  it('US-P024-AC02 treats a cached empty inbox as ready while refreshing it', async () => {
    const f = await setup([]); await f.service.list();
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async path =>
      path === '/me' ? new Response(JSON.stringify({ unreadNotifications: 0 })) : new Promise<Response>(() => {}));
    f.trigger.click(); f.fixture.detectChanges();
    expect(f.page.textContent).toContain("You're all caught up.");
    expect(f.page.textContent).not.toContain('Loading notifications...');
  });

  it('US-P024-AC05 keeps marked-read rows when an older background refresh finishes', async () => {
    const f = await setup(); await f.service.list();
    let answer!: (response: Response) => void;
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async (path, init) =>
      init.method === 'POST' ? new Response(null, { status: 204 }) : path === '/me'
        ? new Response(JSON.stringify({ unreadNotifications: 1 })) : new Promise(resolve => answer = resolve));
    f.trigger.click(); f.fixture.detectChanges();
    const refresh = f.service.list(true);
    Array.from(f.page.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === 'Mark all read')!.click();
    await vi.waitFor(() => expect(f.service.unreadCount()).toBe(0));
    answer(new Response(JSON.stringify({ notifications: [row] })));
    await refresh;
    await f.fixture.whenStable(); f.fixture.detectChanges();
    expect(f.page.textContent).toContain('Join the team');
    expect(f.page.querySelector('.notification-item.unread')).toBeNull();
    expect(f.service.unreadCount()).toBe(0);
  });

  it('US-P024-AC05 clears visible cached notices and ignores a late refresh after switching account', async () => {
    const f = await setup(); await f.service.list();
    let answer!: (response: Response) => void;
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async path =>
      path === '/me' ? new Response(JSON.stringify({ unreadNotifications: 1 })) : new Promise(resolve => answer = resolve));
    f.trigger.click(); f.fixture.detectChanges();
    const refresh = f.service.list(true);
    f.service.setSession('other-account'); f.fixture.detectChanges();
    answer(new Response(JSON.stringify({ notifications: [row] })));
    await refresh;
    await f.fixture.whenStable(); f.fixture.detectChanges();
    expect(f.page.textContent).not.toContain('Join the team');
    expect(f.page.querySelector('.notification-panel')).toBeNull();
    expect(f.service.unreadCount()).toBe(0);
  });

  it.each(['one', 'all'])('US-P024-AC02 keeps the cached list ready after marking %s read', async action => {
    const f = await setup();
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await f.open();
    if (action === 'one') f.page.querySelector<HTMLButtonElement>('.notification-item')!.click();
    else Array.from(f.page.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === 'Mark all read')!.click();
    await vi.waitFor(() => expect(f.service.unreadCount()).toBe(0));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); f.fixture.detectChanges();
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async path =>
      path === '/me' ? new Response(JSON.stringify({ unreadNotifications: 0 })) : new Promise<Response>(() => {}));
    f.trigger.click(); f.fixture.detectChanges();
    expect(f.page.textContent).toContain('Join the team');
    expect(f.page.textContent).not.toContain('Loading notifications...');
    expect(f.page.querySelector('.notification-item.unread')).toBeNull();
  });

  it('US-P024-AC05 keeps the initial notices after Mark all read during an unfinished preload', async () => {
    const f = await setup();
    let finishInitial!: (response: Response) => void;
    let lists = 0;
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async (path, init) => {
      if (init.method === 'POST') return new Response(null, { status: 204 });
      if (path === '/me') return new Response(JSON.stringify({ unreadNotifications: 1 }));
      if (++lists === 1) return new Promise(resolve => finishInitial = resolve);
      return new Response(JSON.stringify({ notifications: [{ ...row, readAt: '2026-10-30T17:00:00Z' }] }));
    });
    f.trigger.click(); f.fixture.detectChanges();
    expect(f.page.textContent).toContain('Loading notifications...');
    Array.from(f.page.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === 'Mark all read')!.click();
    await vi.waitFor(() => expect(f.service.unreadCount()).toBe(0));
    finishInitial(new Response(JSON.stringify({ notifications: [row] })));
    await vi.waitFor(() => { f.fixture.detectChanges(); expect(f.page.textContent).toContain('Join the team'); });
    expect(f.page.textContent).not.toContain("You're all caught up.");
    expect(f.page.querySelector('.notification-item.unread')).toBeNull();
  });

  it('US-P024-AC05 keeps the read list when closing and reopening during a slow Mark all read', async () => {
    const f = await setup(); await f.open();
    let finishWrite!: (response: Response) => void, finishList!: (response: Response) => void;
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async (path, init) => init.method === 'POST'
      ? new Promise(resolve => finishWrite = resolve) : path === '/me'
        ? new Response(JSON.stringify({ unreadNotifications: 1 })) : new Promise(resolve => finishList = resolve));
    Array.from(f.page.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === 'Mark all read')!.click();
    f.trigger.click(); f.fixture.detectChanges(); f.trigger.click(); f.fixture.detectChanges();
    const refresh = f.service.list(true);
    finishWrite(new Response(null, { status: 204 }));
    await vi.waitFor(() => expect(f.service.unreadCount()).toBe(0));
    finishList(new Response(JSON.stringify({ notifications: [row] }))); await refresh;
    await f.fixture.whenStable(); f.fixture.detectChanges();
    expect(f.page.textContent).toContain('Join the team');
    expect(f.page.querySelector('.notification-item.unread')).toBeNull();
    expect(f.service.unreadCount()).toBe(0);
  });
});
