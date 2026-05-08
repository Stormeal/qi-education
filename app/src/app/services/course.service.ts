import { Injectable, inject } from '@angular/core';
import { CourseCreateDraft, CourseListItem } from '../app.models';
import { ApiClientService } from './api-client.service';

export type CourseSaveMode = 'create' | 'edit';

export type CourseSaveResult =
  | {
      ok: true;
      course: CourseListItem;
    }
  | {
      ok: false;
      message: string;
    };

@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly apiClient = inject(ApiClientService);

  async listCourses(): Promise<CourseListItem[]> {
    const { ok, body } = await this.apiClient.fetchJson<CourseListItem[]>('/courses');

    if (!ok || !Array.isArray(body)) {
      throw new Error(!Array.isArray(body) && body.message ? body.message : 'Unable to load courses.');
    }

    return body;
  }

  async saveCourse(
    mode: CourseSaveMode,
    draft: CourseCreateDraft,
    token: string,
    fallbackTeacher: string,
    courseId: string | null,
  ): Promise<CourseSaveResult> {
    if (mode === 'edit' && !courseId) {
      return {
        ok: false,
        message: 'Select a course to edit before saving.',
      };
    }

    const endpoint = mode === 'edit' ? `/courses/${encodeURIComponent(courseId!)}` : '/courses';
    const method = mode === 'edit' ? 'PATCH' : 'POST';
    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      requirements: this.splitMultilineList(draft.requirements),
      audience: draft.audience.trim(),
      level: draft.level.trim(),
      teacher: draft.teacher.trim() || fallbackTeacher,
      careerGoals: draft.careerGoals
        .split(',')
        .map((goal) => goal.trim())
        .filter(Boolean),
      status: draft.status,
    };
    const response = await this.apiClient.fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as CourseListItem | { message?: string };

    if (!response.ok || !('id' in body)) {
      return {
        ok: false,
        message:
          'message' in body && body.message
            ? body.message
            : mode === 'edit'
              ? 'Unable to save course.'
              : 'Unable to create course.',
      };
    }

    this.apiClient.invalidateCache('/courses');

    return {
      ok: true,
      course: body,
    };
  }

  private splitMultilineList(value: string): string[] {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
