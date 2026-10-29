import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import type { NotificationItem } from '../../app.models';
import { NotificationService } from '../../services/notification.service';
import { Icon, type IconName } from '../icon/icon';
import { Button } from '../button/button';

const eventIcons: Record<NotificationItem['type'], IconName> = {
  'review-requested': 'file', 'course-submitted': 'file', 'review-changes-requested': 'message', 'course-published': 'check',
  'org-invitation': 'mail', 'org-request-received': 'briefcase', 'org-request-approved': 'check', 'org-request-declined': 'alert', 'org-member-joined': 'user',
};
@Component({
  selector: 'app-notification-bell', imports: [Icon, Button], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notification-bell.html', styleUrl: './notification-bell.scss',
  host: { '(document:keydown.escape)': 'close()', '(document:click)': 'closeWhenOutside($event)' },
})
export class NotificationBell {
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  readonly unreadCount = input<number | undefined>(undefined);
  readonly opened = output<void>();
  protected readonly count = computed(() => this.unreadCount() ?? this.notifications.unreadCount());
  protected readonly isOpen = signal(false);
  protected readonly items = signal<NotificationItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private request = 0;
  constructor() {
    effect(() => { this.notifications.sessionVersion(); untracked(() => { this.close(false); this.items.set([]); this.error.set(''); }); });
  }
  protected async toggle(): Promise<void> {
    if (this.isOpen()) { this.close(false); return; }
    this.isOpen.set(true); this.opened.emit(); await Promise.all([this.load(), this.notifications.refreshCount()]);
  }
  protected async load(): Promise<void> {
    const request = ++this.request, session = this.notifications.sessionVersion();
    this.loading.set(true); this.error.set('');
    try {
      const rows = await this.notifications.list(true);
      if (request === this.request && session === this.notifications.sessionVersion()) this.items.set(rows);
    } catch {
      if (request === this.request) this.error.set('Your notifications could not be loaded. Please try again.');
    } finally { if (request === this.request) this.loading.set(false); }
  }
  protected close(restoreFocus = true): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false); this.request++;
    if (restoreFocus) this.trigger()?.nativeElement.focus();
  }
  protected closeWhenOutside(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }
  protected async select(row: NotificationItem): Promise<void> {
    if (this.busy()) return;
    const session = this.notifications.sessionVersion();
    this.busy.set(true); this.error.set('');
    try {
      if (row.readAt === null) await this.notifications.markRead(row.id);
      if (session !== this.notifications.sessionVersion()) return;
      const link = row.link.startsWith('/') && !row.link.startsWith('//') ? row.link : '/';
      this.close(false); await this.router.navigateByUrl(link);
    } catch { if (session === this.notifications.sessionVersion()) this.error.set('Read status could not be saved. Please try again.'); }
    finally { this.busy.set(false); }
  }
  protected async markAll(): Promise<void> {
    if (this.busy()) return;
    const session = this.notifications.sessionVersion();
    this.busy.set(true); this.error.set('');
    try {
      await this.notifications.markAllRead();
      if (session === this.notifications.sessionVersion()) this.items.update(rows => rows.map(row => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })));
    } catch { if (session === this.notifications.sessionVersion()) this.error.set('Read status could not be saved. Please try again.'); }
    finally { this.busy.set(false); }
  }
  protected icon(row: NotificationItem): IconName { return eventIcons[row.type] ?? 'bell'; }
  protected relativeTime(createdAt: string): string {
    const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 60_000));
    if (!Number.isFinite(minutes)) return 'Recently';
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return `${Math.floor(minutes / 1440)}d ago`;
  }
}
