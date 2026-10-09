import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { CourseContentDocument, CourseListItem } from '../app.models';
import { CourseService } from './course.service';

export type CourseProgress = {
  state: 'loading' | 'ready' | 'error';
  percent: number | null;
  completed: number;
  total: number;
  nextLesson: string;
};
type OutlineState = { content?: CourseContentDocument; failed?: boolean };

@Injectable({ providedIn: 'root' })
export class LearningProgressService {
  private readonly courseService = inject(CourseService);
  private readonly outlines = signal<Record<string, OutlineState>>({});
  private readonly revision = signal(0);
  private readonly completions = new Map<string, string[]>();
  private generation = 0;

  constructor() {
    const refresh = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
      if (event.key && !event.key.startsWith('qi-education:course-progress:')) return;
      if (event.key) this.completions.delete(event.key);
      else this.completions.clear();
      this.revision.update(value => value + 1);
    };
    window.addEventListener('storage', refresh);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', refresh));
  }

  reset(): void {
    this.cancelLoads();
    this.completions.clear();
    this.revision.update(value => value + 1);
  }

  cancelLoads(): void {
    this.generation++;
    this.outlines.set({});
  }

  async loadCourses(courses: CourseListItem[], token: string): Promise<void> {
    const generation = ++this.generation;
    this.outlines.set({});
    await Promise.all(courses.map(async course => {
      try {
        const content = await this.courseService.loadCourseOutline(course.id, token);
        if (generation !== this.generation) return;
        this.outlines.update(values => ({ ...values, [course.id]: { content } }));
      } catch {
        if (generation !== this.generation) return;
        this.outlines.update(values => ({ ...values, [course.id]: { failed: true } }));
      }
    }));
  }

  completedIds(email: string, courseId: string): string[] {
    this.revision();
    if (!email || !courseId) return [];
    const key = this.key(email, courseId);
    const cached = this.completions.get(key);
    if (cached) return cached;
    let ids: string[] = [];
    try {
      const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
      if (Array.isArray(value)) ids = [...new Set(value.filter((id): id is string => typeof id === 'string'))];
    } catch { /* Corrupt or inaccessible storage has no known completion. */ }
    this.completions.set(key, ids);
    return ids;
  }

  complete(email: string, content: CourseContentDocument, componentId: string): void {
    if (!email || !content.sections.some(section => section.components.some(component => component.id === componentId))) return;
    const current = this.completedIds(email, content._id);
    if (current.includes(componentId)) return;
    const completed = [...current, componentId];
    this.completions.set(this.key(email, content._id), completed);
    try { window.localStorage.setItem(this.key(email, content._id), JSON.stringify(completed)); }
    catch { /* Keep session values when browser persistence is unavailable. */ }
    this.revision.update(value => value + 1);
  }

  summary(email: string, courseId: string): CourseProgress {
    const outline = this.outlines()[courseId];
    if (!outline?.content) return { state: outline?.failed ? 'error' : 'loading', percent: null, completed: 0, total: 0, nextLesson: '' };
    return this.forContent(email, outline.content);
  }

  forContent(email: string, content: CourseContentDocument): CourseProgress {
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
}
