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
});
