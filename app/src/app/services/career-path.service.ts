import { Injectable, computed, inject, signal } from '@angular/core';
import {
  AccountCareers,
  AdminCareerPath,
  CareerPath,
  CareerPathDraft,
  CareerPathIssue,
  CareerPathSelection,
  CourseContentDocument,
  CourseListItem,
} from '../app.models';
import { careerPathNextCourse, careerPathProgress } from '../utils/career-path-progress';
import { ApiClientService } from './api-client.service';
import { CourseService } from './course.service';
import { LearningProgressService } from './learning-progress.service';

export type CareerPathResult = { ok: true } | { ok: false; message: string; code?: string; issues?: CareerPathIssue[] };

/** Published career paths, the signed-in account's selected path, and its progress. */
@Injectable({ providedIn: 'root' })
export class CareerPathService {
  private readonly apiClient = inject(ApiClientService);
  private readonly courseService = inject(CourseService);
  private readonly learningProgress = inject(LearningProgressService);
  private readonly email = signal('');
  private readonly enrolledCourseIds = signal<string[]>([]);
  private readonly outlines = signal<Record<string, CourseContentDocument>>({});

  readonly token = signal('');
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly paths = signal<CareerPath[]>([]);
  readonly selection = signal<CareerPathSelection | null>(null);
  readonly careers = signal<AccountCareers | null>(null);
  readonly adminPaths = signal<AdminCareerPath[]>([]);
  readonly adminCourses = signal<CourseListItem[]>([]);

  readonly focusedPath = computed(() => this.paths().find((path) => path.id === this.careers()?.focusPathId) ?? null);
  // Home still reads one path: the focus, or the legacy selection while no focus is saved.
  readonly selectedPath = computed(() => this.focusedPath()
    ?? this.paths().find((path) => path.id === this.selection()?.pathId) ?? null);
  /** Milestone guidance for a schema-2 focus, shared by Home and the tree: achieved count and the first ready milestone. */
  readonly milestoneProgress = computed(() => {
    const path = this.focusedPath();
    const states = this.careers()?.milestoneStates;
    if (path?.schemaVersion !== 2 || !states) return null;
    return {
      achieved: path.steps.filter((step) => states[step.id] === 'achieved').length,
      total: path.steps.length,
      next: path.steps.find((step) => states[step.id] === 'ready') ?? null,
    };
  });

  readonly progress = computed(() => {
    const path = this.selectedPath();
    return path ? this.progressFor(path) : null;
  });

  /** Progress the account would have on any published path, from the courses it has completed. */
  progressFor(path: CareerPath) {
    return careerPathProgress(path, (courseId) => this.coursePercent(courseId) === 100);
  }

  /** The one thing to do next on the selected path; null when finished or when nothing can be started yet. */
  readonly nextAction = computed(() => {
    const step = this.selectedPath()?.steps.find((item) => item.id === this.progress()?.nextStepId);
    const course = step && !this.progress()?.finished ? careerPathNextCourse(step, (id) => this.coursePercent(id)) : null;
    if (!step || !course) return null;
    const enrolled = this.enrolledCourseIds().includes(course.courseId);
    const percent = this.coursePercent(course.courseId) ?? 0;
    return {
      step,
      course,
      // An enrolled course opens the learning workspace; otherwise the course page, where joining is decided.
      link: [enrolled ? '/library' : '/courses', course.courseId],
      label: !enrolled ? 'View course' : percent > 0 ? 'Continue course' : 'Start course',
      reason: !enrolled ? 'Review the course and join it to begin this step.'
        : percent > 0 ? `You are ${percent}% through this course.` : 'You have joined this course and not started it yet.',
    };
  });

  /** Percent from the same saved lesson completion that My Learning and Home use; null while unknown. */
  coursePercent(courseId: string): number | null {
    const outline = this.outlines()[courseId];
    return outline ? this.learningProgress.forContent(this.email(), outline).percent : null;
  }

  async load(token: string, email: string, enrolledCourseIds: string[] = this.enrolledCourseIds()): Promise<void> {
    this.enrolledCourseIds.set(enrolledCourseIds);
    if (token !== this.token()) {
      this.paths.set([]);
      this.selection.set(null);
      this.careers.set(null);
      this.adminPaths.set([]);
      this.outlines.set({});
    }
    this.token.set(token);
    this.email.set(email);
    this.state.set('loading');
    try {
      const [paths, selection, careers] = await Promise.all([
        this.request<CareerPath[]>('/career-paths', token),
        this.request<{ selection: CareerPathSelection | null }>('/users/me/career-path', token),
        this.request<AccountCareers>('/users/me/careers', token),
      ]);
      if (token !== this.token()) return;
      if (!paths.ok || !selection.ok || !careers.ok) throw new Error();
      this.paths.set(paths.body);
      this.selection.set(selection.body.selection);
      this.careers.set(careers.body);
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
    const token = this.token();
    const result = await this.request<{ selection: CareerPathSelection }>('/users/me/career-path', token, 'PUT', { pathId });
    // A reply that arrives after logout or an account switch belongs to the old session.
    if (token !== this.token()) return { ok: false, message: 'You are signed in to a different account now.' };
    if (!result.ok) return { ok: false, message: result.message };
    this.selection.set(result.body.selection);
    void this.loadOutlines();
    return { ok: true };
  }

  follow(pathId: string): Promise<CareerPathResult> {
    return this.careersWrite(`/users/me/careers/${encodeURIComponent(pathId)}`, 'PUT');
  }

  /** Stops following; achievements and enrollments are kept by the API. */
  unfollow(pathId: string): Promise<CareerPathResult> {
    return this.careersWrite(`/users/me/careers/${encodeURIComponent(pathId)}`, 'DELETE');
  }

  focus(pathId: string): Promise<CareerPathResult> {
    return this.careersWrite('/users/me/career-focus', 'PUT', { pathId });
  }

  /** Records a self-reported achievement; the API checks that its milestone is ready. */
  declare(actionId: string): Promise<CareerPathResult> {
    return this.careersWrite('/users/me/achievements', 'POST', { actionId });
  }

  /** Saves achievements the learner confirmed from a CV scan; only action IDs leave the browser. */
  recogniseFromCv(actionIds: string[]): Promise<CareerPathResult> {
    return this.careersWrite('/users/me/achievements/cv', 'POST', { actionIds });
  }

  private async careersWrite(path: string, method: string, body?: unknown): Promise<CareerPathResult> {
    const token = this.token();
    const result = await this.request<AccountCareers>(path, token, method, body);
    // A reply that arrives after logout or an account switch belongs to the old session.
    if (token !== this.token()) return { ok: false, message: 'You are signed in to a different account now.' };
    if (!result.ok) return { ok: false, message: result.message, code: result.code };
    this.careers.set(result.body);
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
    let result = await this.adminWrite(id, '', 'PUT', draft);
    if (result.ok && publish) {
      this.replaceAdminPath(result.body);
      result = await this.adminWrite(id, '/publish', 'POST');
    }
    if (!result.ok) return result;
    this.replaceAdminPath(result.body);
    if (publish) void this.reload();
    return { ok: true };
  }

  /** Withdraws a published path from learners; its content stays as a draft. */
  async unpublish(id: string): Promise<CareerPathResult> {
    const result = await this.adminWrite(id, '/unpublish', 'POST');
    if (!result.ok) return result;
    this.replaceAdminPath(result.body);
    void this.reload();
    return { ok: true };
  }

  // Names the version this admin loaded, so the API can refuse to overwrite another admin's newer save.
  private adminWrite(id: string, action: string, method: string, body?: unknown) {
    const loaded = this.adminPaths().find((path) => path.id === id)?.updatedAt;
    return this.request<AdminCareerPath>(`/admin/career-paths/${encodeURIComponent(id)}${action}`, this.token(), method, body,
      loaded ? { 'X-Expected-Updated-At': loaded } : {});
  }

  private replaceAdminPath(path: AdminCareerPath): void {
    this.adminPaths.update((paths) => [...paths.filter((item) => item.id !== path.id), path]);
  }

  async loadOutlines(path = this.selectedPath()): Promise<void> {
    const token = this.token();
    const courseIds = (path?.steps ?? []).flatMap((step) => step.courses)
      .filter((course) => course.available && !this.outlines()[course.courseId]).map((course) => course.courseId);
    await Promise.all([...new Set(courseIds)].map(async (courseId) => {
      try {
        const outline = await this.courseService.loadCourseOutline(courseId, token);
        if (token === this.token()) this.outlines.update((outlines) => ({ ...outlines, [courseId]: outline }));
      } catch { /* Unknown progress stays unknown; the step is simply not counted as complete. */ }
    }));
  }

  private async request<T>(path: string, token: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}):
    Promise<{ ok: true; body: T } | { ok: false; message: string; code?: string; issues?: CareerPathIssue[] }> {
    try {
      const response = await this.apiClient.fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}`, ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const json = await response.json().catch(() => ({}));
      return response.ok ? { ok: true, body: json as T }
        : { ok: false, message: json.message ?? 'The request could not be completed.', code: json.code, issues: json.issues };
    } catch {
      return { ok: false, message: 'Unable to reach the API. Please try again.' };
    }
  }
}
