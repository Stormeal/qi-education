import { Injectable, computed, inject, signal } from '@angular/core';
import {
  AdminCareerPath,
  CareerPath,
  CareerPathDraft,
  CareerPathIssue,
  CareerPathSelection,
  CourseContentDocument,
  CourseListItem,
} from '../app.models';
import { careerPathProgress } from '../utils/career-path-progress';
import { ApiClientService } from './api-client.service';
import { CourseService } from './course.service';
import { LearningProgressService } from './learning-progress.service';

export type CareerPathResult = { ok: true } | { ok: false; message: string; issues?: CareerPathIssue[] };

/** Published career paths, the signed-in account's selected path, and its progress. */
@Injectable({ providedIn: 'root' })
export class CareerPathService {
  private readonly apiClient = inject(ApiClientService);
  private readonly courseService = inject(CourseService);
  private readonly learningProgress = inject(LearningProgressService);
  private readonly email = signal('');
  private readonly outlines = signal<Record<string, CourseContentDocument>>({});

  readonly token = signal('');
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly paths = signal<CareerPath[]>([]);
  readonly selection = signal<CareerPathSelection | null>(null);
  readonly adminPaths = signal<AdminCareerPath[]>([]);
  readonly adminCourses = signal<CourseListItem[]>([]);

  readonly selectedPath = computed(() => this.paths().find((path) => path.id === this.selection()?.pathId) ?? null);
  readonly progress = computed(() => {
    const path = this.selectedPath();
    return path ? careerPathProgress(path, (courseId) => this.coursePercent(courseId) === 100) : null;
  });

  /** Percent from the same saved lesson completion that My Learning and Home use; null while unknown. */
  coursePercent(courseId: string): number | null {
    const outline = this.outlines()[courseId];
    return outline ? this.learningProgress.forContent(this.email(), outline).percent : null;
  }

  async load(token: string, email: string): Promise<void> {
    if (token !== this.token()) {
      this.paths.set([]);
      this.selection.set(null);
      this.adminPaths.set([]);
      this.outlines.set({});
    }
    this.token.set(token);
    this.email.set(email);
    this.state.set('loading');
    try {
      const [paths, selection] = await Promise.all([
        this.request<CareerPath[]>('/career-paths', token),
        this.request<{ selection: CareerPathSelection | null }>('/users/me/career-path', token),
      ]);
      if (token !== this.token()) return;
      if (!paths.ok || !selection.ok) throw new Error();
      this.paths.set(paths.body);
      this.selection.set(selection.body.selection);
      this.state.set('ready');
      void this.loadOutlines();
    } catch {
      if (token === this.token()) this.state.set('error');
    }
  }

  reload(): Promise<void> {
    return this.load(this.token(), this.email());
  }

  async select(pathId: string): Promise<CareerPathResult> {
    const result = await this.request<{ selection: CareerPathSelection }>('/users/me/career-path', this.token(), 'PUT', { pathId });
    if (!result.ok) return { ok: false, message: result.message };
    this.selection.set(result.body.selection);
    void this.loadOutlines();
    return { ok: true };
  }

  async loadAdmin(): Promise<CareerPathResult> {
    const token = this.token();
    try {
      const [paths, courses] = await Promise.all([
        this.request<AdminCareerPath[]>('/admin/career-paths', token),
        this.courseService.listCourses(token),
      ]);
      if (!paths.ok) return { ok: false, message: paths.message };
      this.adminPaths.set(paths.body);
      this.adminCourses.set(courses);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Unable to reach the API. Please try again.' };
    }
  }

  async saveDraft(id: string, draft: CareerPathDraft, publish: boolean): Promise<CareerPathResult> {
    let result = await this.request<AdminCareerPath>(`/admin/career-paths/${encodeURIComponent(id)}`, this.token(), 'PUT', draft);
    if (result.ok && publish) {
      this.replaceAdminPath(result.body);
      result = await this.request<AdminCareerPath>(`/admin/career-paths/${encodeURIComponent(id)}/publish`, this.token(), 'POST');
    }
    if (!result.ok) return result;
    this.replaceAdminPath(result.body);
    if (publish) void this.reload();
    return { ok: true };
  }

  private replaceAdminPath(path: AdminCareerPath): void {
    this.adminPaths.update((paths) => [...paths.filter((item) => item.id !== path.id), path]);
  }

  private async loadOutlines(): Promise<void> {
    const token = this.token();
    const courseIds = (this.selectedPath()?.steps ?? []).flatMap((step) => step.courses)
      .filter((course) => course.available && !this.outlines()[course.courseId]).map((course) => course.courseId);
    await Promise.all([...new Set(courseIds)].map(async (courseId) => {
      try {
        const outline = await this.courseService.loadCourseOutline(courseId, token);
        if (token === this.token()) this.outlines.update((outlines) => ({ ...outlines, [courseId]: outline }));
      } catch { /* Unknown progress stays unknown; the step is simply not counted as complete. */ }
    }));
  }

  private async request<T>(path: string, token: string, method = 'GET', body?: unknown):
    Promise<{ ok: true; body: T } | { ok: false; message: string; issues?: CareerPathIssue[] }> {
    try {
      const response = await this.apiClient.fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const json = await response.json().catch(() => ({}));
      return response.ok ? { ok: true, body: json as T }
        : { ok: false, message: json.message ?? 'The request could not be completed.', issues: json.issues };
    } catch {
      return { ok: false, message: 'Unable to reach the API. Please try again.' };
    }
  }
}
