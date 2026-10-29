import { Injectable, inject, signal } from '@angular/core';
import type { NotificationItem } from '../app.models';
import { ApiClientService } from './api-client.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly api = inject(ApiClientService);
  private token = '';
  private generation = 0;
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
  setUnreadCount(count: number): void { this.unread.set(Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0); }
  async refreshCount(): Promise<void> {
    if (!this.token) return;
    const generation = this.generation, token = this.token;
    try {
      const response = await this.api.fetch('/me', { method: 'GET', headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const body = await response.json() as { unreadNotifications?: unknown };
      if (generation === this.generation && typeof body.unreadNotifications === 'number') this.setUnreadCount(body.unreadNotifications);
    } catch { /* Keep the last known count while the list remains available. */ }
  }
  list(refresh = false): Promise<NotificationItem[]> {
    if (!this.token) return Promise.resolve([]);
    if (refresh) this.invalidate();
    if (!refresh && this.cache) return Promise.resolve(structuredClone(this.cache));
    if (!refresh && this.pending) return this.pending;
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
    const generation = this.generation;
    await this.post(`/notifications/${encodeURIComponent(id)}/read`);
    if (generation !== this.generation) return;
    if (wasUnread) this.unread.update(count => Math.max(0, count - 1));
    this.invalidate();
  }
  async markAllRead(): Promise<void> {
    const generation = this.generation;
    await this.post('/notifications/read-all');
    if (generation !== this.generation) return;
    this.unread.set(0); this.invalidate();
  }
  private invalidate(): void { this.generation++; this.cache = undefined; this.pending = undefined; }
  private async post(path: string): Promise<void> {
    if (!this.token) throw new Error('Please sign in again.');
    const response = await this.api.fetch(path, { method: 'POST', headers: { authorization: `Bearer ${this.token}` } });
    if (!response.ok) throw new Error('Read status could not be saved. Please try again.');
  }
}
