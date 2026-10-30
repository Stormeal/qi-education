import { Injectable, inject, signal } from '@angular/core';
import type { NotificationItem } from '../app.models';
import { ApiClientService } from './api-client.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly api = inject(ApiClientService);
  private token = '';
  private generation = 0;
  private countRequest = 0;
  private cache?: NotificationItem[];
  private pending?: Promise<NotificationItem[]>;
  private readonly unread = signal(0);
  readonly unreadCount = this.unread.asReadonly();
  readonly sessionVersion = signal(0);

  setSession(token: string): void {
    if (this.token === token) return;
    this.token = token; this.invalidate(); this.unread.set(0);
    this.sessionVersion.update(value => value + 1);
  }
  beginCountRefresh(): number { return ++this.countRequest; }
  setUnreadCount(count: number, request?: number): void {
    if (request !== undefined && request !== this.countRequest) return;
    this.unread.set(Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
  }
  async refreshCount(): Promise<void> {
    if (!this.token) return;
    const generation = this.generation, token = this.token, request = this.beginCountRefresh();
    try {
      const response = await this.api.fetch('/me', { method: 'GET', headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const body = await response.json() as { unreadNotifications?: unknown };
      if (generation === this.generation && typeof body.unreadNotifications === 'number') this.setUnreadCount(body.unreadNotifications, request);
    } catch { /* Keep the last known count while the list remains available. */ }
  }
  async prefetch(): Promise<void> {
    try { await this.list(); }
    catch { /* Opening the bell retries; background loading must never interrupt sign-in. */ }
  }
  cachedList(): NotificationItem[] | undefined {
    return this.cache === undefined ? undefined : structuredClone(this.cache);
  }
  list(refresh = false): Promise<NotificationItem[]> {
    if (!this.token) return Promise.resolve([]);
    if (!refresh && this.cache) return Promise.resolve(structuredClone(this.cache));
    if (this.pending) return this.pending;
    // Refreshing is a read: preserve the cache and validity of same-session writes.
    const token = this.token, generation = this.generation;
    const pending = this.api.fetch('/notifications', { method: 'GET', headers: { authorization: `Bearer ${token}` } }).then(async response => {
      if (!response.ok) throw new Error('Your notifications could not be loaded. Please try again.');
      const body = await response.json() as { notifications?: NotificationItem[] };
      if (generation !== this.generation) return [];
      if (!Array.isArray(body.notifications)) throw new Error('Your notifications could not be loaded. Please try again.');
      this.cache = body.notifications;
      return structuredClone(body.notifications);
    }).finally(() => { if (this.pending === pending) this.pending = undefined; });
    this.pending = pending;
    return pending;
  }
  async markRead(id: string): Promise<void> {
    const wasUnread = this.cache?.some(row => row.id === id && row.readAt === null) ?? false;
    const session = this.sessionVersion(), countRequest = ++this.countRequest;
    await this.post(`/notifications/${encodeURIComponent(id)}/read`);
    if (session !== this.sessionVersion()) return;
    const countChanged = countRequest !== this.countRequest;
    if (wasUnread && !countChanged) this.unread.update(count => Math.max(0, count - 1));
    const readAt = new Date().toISOString();
    const cache = this.cache?.map(row => row.id === id ? { ...row, readAt: row.readAt ?? readAt } : row);
    this.invalidate();
    this.cache = cache;
    if (countChanged) void this.refreshCount();
  }
  async markAllRead(): Promise<void> {
    const session = this.sessionVersion();
    this.countRequest++;
    await this.post('/notifications/read-all');
    if (session !== this.sessionVersion()) return;
    const readAt = new Date().toISOString();
    const cache = this.cache?.map(row => ({ ...row, readAt: row.readAt ?? readAt }));
    this.unread.set(0); this.invalidate(); this.cache = cache;
  }
  private invalidate(): void { this.generation++; this.countRequest++; this.cache = undefined; this.pending = undefined; }
  private async post(path: string): Promise<void> {
    if (!this.token) throw new Error('Please sign in again.');
    const response = await this.api.fetch(path, { method: 'POST', headers: { authorization: `Bearer ${this.token}` } });
    if (!response.ok) throw new Error('Read status could not be saved. Please try again.');
  }
}
