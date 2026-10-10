import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { CourseContentDocument, CourseListItem } from '../app.models';
import { CourseService } from './course.service';
import { ApiClientService } from './api-client.service';
import { SessionService } from './session.service';

export type CourseProgress = {
  state: 'loading' | 'ready' | 'error';
  percent: number | null;
  completed: number;
  total: number;
  nextLesson: string;
};
type OutlineState = { content?: CourseContentDocument; failed?: boolean };
type AccountProgress = { courseId: string; completedIds: string[] };
type SyncContext = {
  id: string; email: string; token: string; abort: AbortController;
  known: Map<string, Set<string>>; contents: Map<string, CourseContentDocument>;
  blocked: Set<string>; needsRead: boolean; dirty: boolean; running?: Promise<void>; failures: number;
};

@Injectable({ providedIn: 'root' })
export class LearningProgressService {
  private readonly courseService = inject(CourseService);
  private readonly api = inject(ApiClientService);
  private readonly session = inject(SessionService);
  private readonly outlines = signal<Record<string, OutlineState>>({});
  private readonly revision = signal(0);
  private readonly completions = new Map<string, string[]>();
  private generation = 0;
  private context?: SyncContext;
  private queuedStart?: { id: string; email: string; token: string; contents: Map<string, CourseContentDocument> };
  private retryTimer?: ReturnType<typeof setTimeout>;
  readonly accountSyncState = signal<'idle' | 'syncing' | 'pending' | 'ready'>('idle');
  readonly accountSyncError = signal('');

  constructor() {
    const refresh = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
      if (event.key && !event.key.startsWith('qi-education:course-progress:')) return;
      if (event.key) {
        const current = this.completions.get(event.key) ?? [];
        this.completions.set(event.key, [...new Set([...current, ...this.readLocal(event.key)])]);
      }
      this.revision.update(value => value + 1);
      if (this.context) void this.sync(this.context, true);
    };
    const online = () => { if (this.context) void this.sync(this.context, true); };
    window.addEventListener('storage', refresh);
    window.addEventListener('online', online);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('storage', refresh); window.removeEventListener('online', online); this.stopSync();
    });
  }

  reset(): void {
    this.stopSync();
    this.cancelLoads();
    this.completions.clear();
    this.revision.update(value => value + 1);
  }

  cancelLoads(): void {
    this.generation++;
    this.outlines.set({});
  }

  async loadCourses(courses: CourseListItem[], token: string): Promise<void> {
    const context = this.bindAccount(token);
    const generation = ++this.generation;
    this.outlines.set({});
    await Promise.all(courses.map(async course => {
      try {
        const content = await this.courseService.loadCourseOutline(course.id, token);
        if (generation !== this.generation) return;
        this.outlines.update(values => ({ ...values, [course.id]: { content } }));
        if (context && this.isCurrent(context)) context.contents.set(course.id, content);
      } catch {
        if (generation !== this.generation) return;
        this.outlines.update(values => ({ ...values, [course.id]: { failed: true } }));
      }
    }));
    if (context && generation === this.generation) {
      context.blocked.clear();
      await this.sync(context, true);
    }
  }

  completedIds(email: string, courseId: string): string[] {
    this.revision();
    if (!email || !courseId) return [];
    const key = this.key(email, courseId);
    const cached = this.completions.get(key);
    if (cached) return cached;
    const ids = this.readLocal(key);
    this.completions.set(key, ids);
    return ids;
  }

  private readLocal(key: string): string[] {
    let ids: string[] = [];
    try {
      const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
      if (Array.isArray(value)) ids = [...new Set(value.filter((id): id is string => typeof id === 'string'))];
    } catch { /* Corrupt or inaccessible storage has no known completion. */ }
    return ids;
  }

  complete(email: string, content: CourseContentDocument, componentId: string): void {
    if (!email || !content.sections.some(section => section.components.some(component => component.id === componentId))) return;
    const current = this.completedIds(email, content._id);
    if (!current.includes(componentId)) this.mergeLocal(email, content._id, [componentId]);
    const context = this.context;
    if (context?.email === email && this.isCurrent(context)) {
      context.contents.set(content._id, content);
      context.blocked.delete(JSON.stringify([content._id, componentId]));
      void this.sync(context);
    }
  }

  summary(email: string, courseId: string): CourseProgress {
    const outline = this.outlines()[courseId];
    if (!outline?.content) return { state: outline?.failed ? 'error' : 'loading', percent: null, completed: 0, total: 0, nextLesson: '' };
    return this.forContent(email, outline.content);
  }

  forContent(email: string, content: CourseContentDocument): CourseProgress {
    this.ensureAccountSync(email, content);
    const components = [...new Map(content.sections.flatMap(section => section.components).map(component => [component.id, component])).values()];
    const saved = new Set(this.completedIds(email, content._id));
    const completed = components.filter(component => saved.has(component.id)).length;
    const percent = !components.length ? 0 : completed === components.length ? 100 : Math.min(99, Math.round(completed / components.length * 100));
    return { state: 'ready', percent,
      completed, total: components.length, nextLesson: components.find(component => !saved.has(component.id))?.title ?? '' };
  }

  private key(email: string, courseId: string): string {
    return `qi-education:course-progress:${email}:${courseId}`;
  }

  private mergeLocal(email: string, courseId: string, ids: string[]): void {
    const key = this.key(email, courseId);
    const merged = [...new Set([...this.completedIds(email, courseId), ...this.readLocal(key), ...ids])];
    this.completions.set(key, merged);
    try { window.localStorage.setItem(key, JSON.stringify(merged)); }
    catch { /* Session memory remains authoritative when browser writes fail. */ }
    this.revision.update(value => value + 1);
  }

  private storedAccount() {
    try { return this.session.restoreLoginState(); } catch { return null; }
  }

  private ensureAccountSync(email: string, content: CourseContentDocument): void {
    const account = this.storedAccount();
    if (!account || account.user.email !== email) return;
    const context = this.context;
    if (context && this.isCurrent(context)) {
      if (!context.contents.has(content._id)) {
        context.contents.set(content._id, content);
        queueMicrotask(() => { void this.sync(context); });
      }
      return;
    }
    if (this.queuedStart?.id === account.user.id && this.queuedStart.token === account.token) {
      this.queuedStart.contents.set(content._id, content); return;
    }
    const queued = this.queuedStart = { id: account.user.id, email, token: account.token, contents: new Map([[content._id, content]]) };
    // Readers stay synchronous, including inside career-page computed signals.
    // Defer signal writes and network work until that calculation has finished.
    queueMicrotask(() => {
      if (this.queuedStart !== queued) return;
      this.queuedStart = undefined;
      const current = this.storedAccount();
      if (current?.user.id !== queued.id || current.user.email !== queued.email || current.token !== queued.token) return;
      const bound = this.bindAccount(queued.token);
      if (!bound) return;
      queued.contents.forEach((value, key) => bound.contents.set(key, value));
      void this.sync(bound, true);
    });
  }

  private bindAccount(token: string): SyncContext | undefined {
    const account = this.storedAccount();
    if (!account || account.token !== token) return undefined;
    if (this.context?.id === account.user.id && this.context.token === token && this.context.email === account.user.email) return this.context;
    this.stopSync();
    return this.context = { id: account.user.id, email: account.user.email, token, abort: new AbortController(),
      known: new Map(), contents: new Map(), blocked: new Set(), needsRead: true, dirty: false, failures: 0 };
  }

  private isCurrent(context: SyncContext): boolean {
    const account = this.storedAccount();
    return this.context === context && !context.abort.signal.aborted && account?.token === context.token &&
      account.user.id === context.id && account.user.email === context.email;
  }

  private stopSync(): void {
    this.queuedStart = undefined;
    this.context?.abort.abort(); this.context = undefined;
    clearTimeout(this.retryTimer); this.retryTimer = undefined;
    this.accountSyncState.set('idle'); this.accountSyncError.set('');
  }

  private sync(context: SyncContext, read = false): Promise<void> {
    if (!this.isCurrent(context)) return Promise.resolve();
    context.needsRead ||= read; context.dirty = true;
    clearTimeout(this.retryTimer); this.retryTimer = undefined;
    if (context.running) return context.running;
    context.running = this.synchronize(context).finally(() => { context.running = undefined; });
    return context.running;
  }

  private async synchronize(context: SyncContext): Promise<void> {
    this.accountSyncState.set('syncing'); this.accountSyncError.set('');
    let retry = false;
    const headers = { authorization: `Bearer ${context.token}` };
    const root = '/users/me/learning-progress';
    const request = async (path: string, method = 'GET') => {
      const response = await this.api.fetch(path, { method, headers, signal: context.abort.signal });
      const body: unknown = await response.json().catch(() => null);
      if (this.isCurrent(context) && (response.status >= 500 || response.status === 429)) retry = true;
      return { response, body };
    };
    try {
      do {
        context.dirty = false;
        if (context.needsRead) {
          const { response, body } = await request(root);
          if (!this.isCurrent(context)) return;
          if (!response.ok || !this.isProgressList(body)) {
            this.accountSyncState.set('pending'); this.accountSyncError.set('Account progress could not be loaded. Local completion is retained.');
            return;
          }
          context.needsRead = false;
          for (const item of body.progress) this.accept(context, item);
        }
        // Legacy browser records for this account may include courses not on the current page.
        const prefix = this.key(context.email, '');
        const courseIds = new Set(context.contents.keys());
        try {
          for (let index = 0; index < window.localStorage.length; index++) {
            const key = window.localStorage.key(index);
            if (key?.startsWith(prefix)) courseIds.add(key.slice(prefix.length));
          }
        } catch { /* Cached/current content still allows session completion to sync. */ }
        for (const courseId of courseIds) {
          if (!this.isCurrent(context)) return;
          const content = context.contents.get(courseId);
          const currentIds = content && new Set(content.sections.flatMap(section => section.components.map(component => component.id)));
          for (const componentId of this.completedIds(context.email, courseId)) {
            // Off-page legacy IDs are validated by the save route itself. An
            // unrelated outline outage must not prevent their union/retry.
            if ((currentIds && !currentIds.has(componentId)) || context.known.get(courseId)?.has(componentId)) continue;
            const key = JSON.stringify([courseId, componentId]);
            if (context.blocked.has(key)) continue;
            const { response, body } = await request(`${root}/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(componentId)}`, 'PUT');
            if (!this.isCurrent(context)) return;
            if (retry) { this.accountSyncState.set('pending'); this.accountSyncError.set('Account save failed. Local completion will retry.'); return; }
            if (response.ok && this.isProgress(body) && body.courseId === courseId && body.completedIds.includes(componentId)) this.accept(context, body);
            else context.blocked.add(key);
          }
        }
      } while (context.dirty && this.isCurrent(context));
      if (this.isCurrent(context)) {
        context.failures = 0;
        this.accountSyncState.set(context.blocked.size ? 'pending' : 'ready');
        if (context.blocked.size) this.accountSyncError.set('Some local lessons could not be saved to the account. Legacy quizzes need a new passing attempt.');
      }
    } catch {
      if (!this.isCurrent(context)) return;
      retry = true;
      this.accountSyncState.set('pending'); this.accountSyncError.set('Account sync is unavailable. Local completion will retry.');
    } finally {
      if (retry && this.isCurrent(context)) {
        const delay = Math.min(5_000 * 2 ** Math.min(context.failures++, 4), 60_000);
        this.retryTimer = setTimeout(() => { void this.sync(context, true); }, delay);
      }
    }
  }

  private accept(context: SyncContext, item: AccountProgress): void {
    const known = context.known.get(item.courseId) ?? new Set<string>();
    item.completedIds.forEach(id => known.add(id)); context.known.set(item.courseId, known);
    this.mergeLocal(context.email, item.courseId, item.completedIds);
  }

  private isProgress(value: unknown): value is AccountProgress {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<AccountProgress>;
    return typeof item.courseId === 'string' && Array.isArray(item.completedIds) && item.completedIds.every(id => typeof id === 'string');
  }

  private isProgressList(value: unknown): value is { progress: AccountProgress[] } {
    return !!value && typeof value === 'object' && 'progress' in value && Array.isArray(value.progress) && value.progress.every(item => this.isProgress(item));
  }
}
