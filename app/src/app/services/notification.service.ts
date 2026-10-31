import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import type { NotificationItem } from '../app.models';
import { ApiClientService } from './api-client.service';

// The tab's saved inbox, labelled with its owner so another account never sees it.
const STORE_KEY = 'qi-education:notifications';
type SavedInbox = { identityKey: string; unread: number; notifications?: NotificationItem[] };

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private readonly api = inject(ApiClientService);
  private token = '';
  private identityKey = '';
  private generation = 0;
  private countRequest = 0;
  private cache?: NotificationItem[];
  private pending?: Promise<NotificationItem[]>;
  private live?: AbortController;
  private readonly unread = signal(0);
  readonly unreadCount = this.unread.asReadonly();
  readonly sessionVersion = signal(0);
  /** Replaceable so specs can turn the background stream off or drive it. */
  liveUpdates = true;

  // A hidden tab holds no server connection; a returning one reconnects and gets a fresh count.
  private readonly onVisibility = () => { if (document.hidden) this.stopLive(); else this.startLive(); };
  constructor() { if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility); }
  ngOnDestroy(): void {
    this.stopLive();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
  }

  setSession(token: string, identityKey = ''): void {
    if (this.token === token) return;
    this.stopLive();
    this.token = token; this.identityKey = token ? identityKey : ''; this.invalidate(); this.unread.set(0);
    this.sessionVersion.update(value => value + 1);
    this.restore();
  }
  beginCountRefresh(): number { return ++this.countRequest; }
  setUnreadCount(count: number, request?: number): void {
    if (request !== undefined && request !== this.countRequest) return;
    this.unread.set(Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
    this.save();
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
    this.startLive();
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
      this.cache = body.notifications; this.save();
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
    this.cache = cache; this.save();
    if (countChanged) void this.refreshCount();
  }
  async markAllRead(): Promise<void> {
    const session = this.sessionVersion();
    this.countRequest++;
    await this.post('/notifications/read-all');
    if (session !== this.sessionVersion()) return;
    const readAt = new Date().toISOString();
    const cache = this.cache?.map(row => ({ ...row, readAt: row.readAt ?? readAt }));
    this.unread.set(0); this.invalidate(); this.cache = cache; this.save();
  }

  /** Server-sent events over fetch (EventSource cannot send the bearer token). A stream ends
   * after a short server lifetime and reconnects; each connect reports the current count. */
  private startLive(): void {
    if (!this.liveUpdates || !this.token || this.live || (typeof document !== 'undefined' && document.hidden)) return;
    const controller = this.live = new AbortController();
    void this.runLive(this.token, controller.signal).finally(() => { if (this.live === controller) this.live = undefined; });
  }
  private stopLive(): void { this.live?.abort(); this.live = undefined; }
  private async runLive(token: string, signal: AbortSignal): Promise<void> {
    let delay = 1000;
    while (!signal.aborted && token === this.token) {
      try {
        const response = await this.api.fetch('/notifications/stream', { method: 'GET', headers: { authorization: `Bearer ${token}` }, signal });
        if (response.status === 401) return;
        if (!response.ok || !response.body) throw new Error('stream unavailable');
        delay = 1000;
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
            const count = /^event: count\ndata: (\d+)$/.exec(buffer.slice(0, end));
            buffer = buffer.slice(end + 2);
            if (count && token === this.token) this.applyLiveCount(Number(count[1]));
          }
        }
      } catch {
        if (signal.aborted) return;
        delay = Math.min(delay * 2, 30_000);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  private applyLiveCount(count: number): void {
    if (count === this.unread()) return;
    this.countRequest++; // Older count replies must not undo the server's newer answer.
    this.setUnreadCount(count);
    if (this.cache) void this.list(true).catch(() => { /* The bell retries on open. */ });
  }

  private restore(): void {
    try {
      if (!this.identityKey) { sessionStorage.removeItem(STORE_KEY); return; }
      const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? 'null') as SavedInbox | null;
      if (saved?.identityKey !== this.identityKey) { sessionStorage.removeItem(STORE_KEY); return; }
      this.unread.set(saved.unread);
      if (Array.isArray(saved.notifications)) this.cache = saved.notifications;
    } catch { /* Blocked storage: start empty and load from the API. */ }
  }
  private save(): void {
    try {
      if (!this.identityKey) { sessionStorage.removeItem(STORE_KEY); return; }
      const saved: SavedInbox = { identityKey: this.identityKey, unread: this.unread(), notifications: this.cache };
      sessionStorage.setItem(STORE_KEY, JSON.stringify(saved));
    } catch { /* Saving is a convenience; the API stays the source of truth. */ }
  }
  private invalidate(): void { this.generation++; this.countRequest++; this.cache = undefined; this.pending = undefined; }
  private async post(path: string): Promise<void> {
    if (!this.token) throw new Error('Please sign in again.');
    const response = await this.api.fetch(path, { method: 'POST', headers: { authorization: `Bearer ${this.token}` } });
    if (!response.ok) throw new Error('Read status could not be saved. Please try again.');
  }
}
