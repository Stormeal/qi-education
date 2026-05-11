import { Injectable, inject } from '@angular/core';
import { CourseContentDocument, CourseCreateDraft, CourseListItem, CourseSection } from '../app.models';
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

export type CourseContentSaveResult =
  | {
      ok: true;
      content: CourseContentDocument;
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
      whatYoullLearn: this.splitMultilineList(draft.whatYoullLearn),
      audience: draft.audience.trim(),
      level: draft.level.trim(),
      partOfCareer: draft.partOfCareer.trim(),
      teacher: draft.teacher.trim() || fallbackTeacher,
      careerGoals: draft.careerGoals
        .split(',')
        .map((goal) => goal.trim())
        .filter(Boolean),
      status: draft.status,
      priceDkk: draft.priceDkk,
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

  async loadCourseContent(courseId: string): Promise<CourseContentDocument> {
    const { ok, body } = await this.apiClient.fetchJson<CourseContentDocument>(
      `/courses/${encodeURIComponent(courseId)}/content`,
      {},
      true,
    );

    if (!ok || !('_id' in body)) {
      throw new Error(!('_id' in body) && body.message ? body.message : 'Unable to load course content.');
    }

    return body;
  }

  async saveCourseContent(
    courseId: string,
    sections: CourseSection[],
    token: string,
  ): Promise<CourseContentSaveResult> {
    const response = await this.apiClient.fetch(`/courses/${encodeURIComponent(courseId)}/content`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sections }),
    });
    const body = (await response.json().catch(() => ({}))) as CourseContentDocument | { message?: string };

    if (!response.ok || !('_id' in body)) {
      return {
        ok: false,
        message: !('_id' in body) && body.message ? body.message : 'Unable to save course content.',
      };
    }

    this.apiClient.invalidateCache(`/courses/${encodeURIComponent(courseId)}/content`);

    return {
      ok: true,
      content: body,
    };
  }

  async saveCoursePrice(
    courseId: string,
    priceDkk: number | null,
    token: string,
  ): Promise<CourseSaveResult> {
    const response = await this.apiClient.fetch(`/courses/${encodeURIComponent(courseId)}/price`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ priceDkk }),
    });
    const body = (await response.json().catch(() => ({}))) as CourseListItem | { message?: string };

    if (!response.ok || !('id' in body)) {
      return {
        ok: false,
        message: 'message' in body && body.message ? body.message : 'Unable to save course price.',
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
      .map((item) => item.replace(/^[•*-]\s*/, '').trim())
      .filter(Boolean);
  }
}
