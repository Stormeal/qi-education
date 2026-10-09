import { Injectable, inject, signal } from '@angular/core';
import {
  CourseCatalogMetadataDraft,
  CourseReviewAction,
  CourseReviewState,
  CourseComponentAttachment,
  CourseContentDocument,
  CourseCreateDraft,
  CourseListItem,
  CourseSection,
  LoginResponse,
  QuizAssessmentResult,
} from '../app.models';
import { ApiClientService } from './api-client.service';

export type CourseSaveMode = 'create' | 'edit';
export type CourseRevision = Pick<CourseReviewState, 'version' | 'revisionId'>;
export function courseRevisionHeaders(revision?: CourseRevision | null): Record<string, string> {
  return revision ? { 'X-Course-Revision': JSON.stringify({ version: revision.version, revisionId: revision.revisionId }) } : {};
}

export type CourseSaveResult =
  | {
      ok: true;
      course: CourseListItem;
      review?: CourseReviewState;
    }
  | {
      ok: false;
      message: string;
      code?: string;
    };

export type CourseContentSaveResult =
  | {
      ok: true;
      content: CourseContentDocument;
    }
  | {
      ok: false;
      message: string;
      code?: string;
    };

export type CourseMuxUploadResult =
  | {
      ok: true;
      uploadId: string;
      uploadUrl: string;
      content: CourseContentDocument;
    }
  | {
      ok: false;
      message: string;
      code?: string;
    };

export type CourseMuxVideoRemoveResult =
  | {
      ok: true;
      content: CourseContentDocument;
    }
  | {
      ok: false;
      message: string;
      code?: string;
    };

export type CourseAttachmentUploadResult =
  | {
      ok: true;
      attachment: CourseComponentAttachment;
      content: CourseContentDocument;
    }
  | {
      ok: false;
      message: string;
      code?: string;
    };

export type CourseAttachmentRemoveResult =
  | {
      ok: true;
      content: CourseContentDocument;
    }
  | {
      ok: false;
      message: string;
      code?: string;
    };

export type CourseAttachmentDownloadResult =
  | {
      ok: true;
      blob: Blob;
    }
  | {
      ok: false;
      message: string;
      code?: string;
    };

export type CourseEnrollmentResult =
  | {
      ok: true;
      login: Omit<LoginResponse, 'token'>;
    }
  | {
      ok: false;
      message: string;
      code?: string;
    };

@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly apiClient = inject(ApiClientService);
  private readonly thumbnailUrls = signal<Record<string, string>>({});
  private readonly thumbnailWarmRequests = new Map<string, Promise<void>>();
  private thumbnailToken = '';
  private thumbnailGeneration = 0;
  private activeAttachmentUploadRequest: XMLHttpRequest | null = null;

  async listCourses(token: string): Promise<CourseListItem[]> {
    const { ok, body } = await this.apiClient.fetchJson<CourseListItem[]>('/courses', {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!ok || !Array.isArray(body)) {
      throw new Error(!Array.isArray(body) && body.message ? body.message : 'Unable to load courses.');
    }
    return body;
  }

  thumbnailUrl(course: CourseListItem | null): string {
    return course?.thumbnailAssetId ? this.thumbnailUrls()[`${course.id}:${course.thumbnailAssetId}`] ?? '' : '';
  }

  clearPrivateThumbnails(): void {
    this.thumbnailGeneration++;
    for (const url of Object.values(this.thumbnailUrls())) URL.revokeObjectURL(url);
    this.thumbnailUrls.set({});
    this.thumbnailWarmRequests.clear();
    this.thumbnailToken = '';
  }

  async preloadCourseThumbnails(courses: CourseListItem[], token = this.thumbnailToken): Promise<void> {
    if (token !== this.thumbnailToken) {
      this.clearPrivateThumbnails();
      this.thumbnailToken = token;
    }
    const generation = this.thumbnailGeneration;
    await Promise.all(courses.filter((course) => !!course.thumbnailAssetId).map((course) => {
      const key = `${course.id}:${course.thumbnailAssetId}`;
      if (this.thumbnailUrls()[key]) return Promise.resolve();
      const pending = this.thumbnailWarmRequests.get(key);
      if (pending) return pending;
      const request = (async () => {
        try {
          const response = await this.apiClient.fetch(`/courses/${encodeURIComponent(course.id)}/thumbnail?v=${encodeURIComponent(course.thumbnailAssetId)}`, {
            method: 'GET', headers: token ? { authorization: `Bearer ${token}` } : {},
          });
          if (!response.ok) return;
          const blob = await response.blob();
          if (generation !== this.thumbnailGeneration) return;
          const url = URL.createObjectURL(blob);
          this.thumbnailUrls.update((urls) => ({ ...urls, [key]: url }));
        } catch { /* A failed thumbnail must not prevent course access. */ }
        finally { if (generation === this.thumbnailGeneration) this.thumbnailWarmRequests.delete(key); }
      })();
      this.thumbnailWarmRequests.set(key, request);
      return request;
    }));
  }

  async saveCourse(
    mode: CourseSaveMode,
    draft: CourseCreateDraft,
    token: string,
    fallbackTeacher: string,
    courseId: string | null,
      revision?: CourseRevision | null,
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
        ...courseRevisionHeaders(revision),
      },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as (CourseListItem & { review?: CourseReviewState }) | { message?: string; code?: string };

    if (!response.ok || !('id' in body)) {
      return {
        ok: false,
        code: "code" in body ? body.code : undefined,
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
      course: (({ review, ...course }) => course)(body as CourseListItem & { review?: CourseReviewState }),
      review: (body as CourseListItem & { review?: CourseReviewState }).review,
    };
  }

  async performReviewAction(courseId: string, action: CourseReviewAction, state: CourseReviewState,
    reason: string, token: string): Promise<CourseContentDocument> {
    const response = await this.apiClient.fetch(`/courses/${encodeURIComponent(courseId)}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, reason, revisionId: state.revisionId, expectedVersion: state.version }),
    });
    const body = await response.json() as CourseContentDocument | { message?: string };
    if (!response.ok || !('_id' in body) || !body.review) throw new Error('message' in body && body.message ? body.message : 'Unable to save the review action.');
    this.apiClient.invalidateCache('/courses');
    return body;
  }

  async loadCourseContent(courseId: string, token: string, view: 'learner' | 'author' = 'learner'): Promise<CourseContentDocument> {
    const { ok, body } = await this.apiClient.fetchJson<CourseContentDocument>(
      `/courses/${encodeURIComponent(courseId)}/content?view=${view}`,
      { headers: { authorization: `Bearer ${token}` } },
      true,
    );

    if (!ok || !('_id' in body)) {
      throw new Error(!('_id' in body) && body.message ? body.message : 'Unable to load course content.');
    }

    return body;
  }

  async loadCourseOutline(courseId: string, token: string): Promise<CourseContentDocument> {
    type Outline = { _id: string; sections: { id: string; title: string; components: {
      id: string; title: string; type: 'text' | 'video' | 'quiz' | 'resources'; durationMinutes: number;
    }[] }[] };
    const { ok, body } = await this.apiClient.fetchJson<Outline>(`/courses/${encodeURIComponent(courseId)}/outline`, {
      headers: { authorization: `Bearer ${token}` },
    }, true);
    if (!ok || !('_id' in body)) throw new Error('message' in body && body.message ? body.message : 'Unable to load course outline.');
    return { ...body, createdAt: '', updatedAt: '', view: 'outline', sections: body.sections.map((section) => ({
      ...section, components: section.components.map((component) => {
        const base = { ...component, content: '', resourceUrl: '', attachments: [] };
        return component.type === 'quiz' ? { ...base, type: 'quiz' as const, quiz: { passPoints: 1, questions: [] } } :
          { ...base, type: component.type as 'text' | 'video' | 'resources' };
      }),
    })) };
  }

  async gradeQuiz(courseId: string, sectionId: string, componentId: string,
    answers: { questionId: string; answerId: string }[], token: string): Promise<QuizAssessmentResult> {
    const response = await this.apiClient.fetch(`/courses/${encodeURIComponent(courseId)}/content/components/${encodeURIComponent(componentId)}/quiz-attempts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ sectionId, answers }),
    });
    const body = await response.json() as QuizAssessmentResult | { message?: string };
    if (!response.ok || !('feedback' in body)) throw new Error('message' in body && body.message ? body.message : 'Unable to score this quiz. Please try again.');
    return body;
  }

  async saveCourseContent(
    courseId: string,
    sections: CourseSection[],
    token: string,
      revision?: CourseRevision | null,
  ): Promise<CourseContentSaveResult> {
    const response = await this.apiClient.fetch(`/courses/${encodeURIComponent(courseId)}/content`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
        ...courseRevisionHeaders(revision),
      },
      body: JSON.stringify({ sections }),
    });
    const body = (await response.json().catch(() => ({}))) as CourseContentDocument | { message?: string; code?: string };

    if (!response.ok || !('_id' in body)) {
      return {
        ok: false,
        code: "code" in body ? body.code : undefined,
        message: !('_id' in body) && body.message ? body.message : 'Unable to save course content.',
      };
    }

    this.apiClient.invalidateCache(`/courses/${encodeURIComponent(courseId)}/content`);

    return {
      ok: true,
      content: body,
    };
  }

  async createMuxUpload(
    courseId: string,
    sectionId: string,
    componentId: string,
    token: string,
      revision?: CourseRevision | null,
  ): Promise<CourseMuxUploadResult> {
    const response = await this.apiClient.fetch(
      `/courses/${encodeURIComponent(courseId)}/content/components/${encodeURIComponent(componentId)}/mux-upload`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        ...courseRevisionHeaders(revision),
        },
        body: JSON.stringify({ sectionId }),
      },
    );
    const body = (await response.json().catch(() => ({}))) as
      | {
          uploadId?: string;
          uploadUrl?: string;
          content?: CourseContentDocument;
          message?: string;
          code?: string;
        };

    if (!response.ok || !body.uploadId || !body.uploadUrl || !body.content) {
      return {
        ok: false,
        code: "code" in body ? body.code : undefined,
        message: body.message ?? 'Unable to create Mux upload.',
      };
    }

    this.apiClient.invalidateCache(`/courses/${encodeURIComponent(courseId)}/content`);

    return {
      ok: true,
      uploadId: body.uploadId,
      uploadUrl: body.uploadUrl,
      content: body.content,
    };
  }

  async removeMuxVideo(
    courseId: string,
    sectionId: string,
    componentId: string,
    token: string,
      revision?: CourseRevision | null,
  ): Promise<CourseMuxVideoRemoveResult> {
    const response = await this.apiClient.fetch(
      `/courses/${encodeURIComponent(courseId)}/content/components/${encodeURIComponent(componentId)}/mux-video`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        ...courseRevisionHeaders(revision),
        },
        body: JSON.stringify({ sectionId }),
      },
    );
    const body = (await response.json().catch(() => ({}))) as
      | {
          content?: CourseContentDocument;
          message?: string;
          code?: string;
        };

    if (!response.ok || !body.content) {
      return {
        ok: false,
        code: "code" in body ? body.code : undefined,
        message: body.message ?? 'Unable to remove Mux video.',
      };
    }

    this.apiClient.invalidateCache(`/courses/${encodeURIComponent(courseId)}/content`);

    return {
      ok: true,
      content: body.content,
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

  async uploadComponentAttachment(
    courseId: string,
    sectionId: string,
    componentId: string,
    file: File,
    token: string,
    markerId: string,
    onProgress?: (progress: number) => void,
    revision?: CourseRevision | null,
  ): Promise<CourseAttachmentUploadResult> {
    const response = await this.uploadComponentAttachmentRequest(
      courseId,
      sectionId,
      componentId,
      file,
      token,
      markerId,
      onProgress,
      revision,
    );

    if (!response.ok) {
      return {
        ok: false,
        message: response.message,
        code: response.code,
      };
    }

    this.apiClient.invalidateCache(`/courses/${encodeURIComponent(courseId)}/content`);

    return {
      ok: true,
      attachment: response.attachment,
      content: response.content,
    };
  }

  cancelComponentAttachmentUpload(): void {
    this.activeAttachmentUploadRequest?.abort();
    this.activeAttachmentUploadRequest = null;
  }

  async removeComponentAttachment(
    courseId: string,
    sectionId: string,
    componentId: string,
    assetId: string,
    token: string,
      revision?: CourseRevision | null,
  ): Promise<CourseAttachmentRemoveResult> {
    const response = await this.apiClient.fetch(
      `/courses/${encodeURIComponent(courseId)}/content/components/${encodeURIComponent(componentId)}/attachments/${encodeURIComponent(assetId)}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        ...courseRevisionHeaders(revision),
        },
        body: JSON.stringify({ sectionId }),
      },
    );
    const body = (await response.json().catch(() => ({}))) as
      | {
          content?: CourseContentDocument;
          message?: string;
          code?: string;
        };

    if (!response.ok || !body.content) {
      return {
        ok: false,
        code: "code" in body ? body.code : undefined,
        message: body.message ?? 'Unable to remove attachment.',
      };
    }

    this.apiClient.invalidateCache(`/courses/${encodeURIComponent(courseId)}/content`);

    return {
      ok: true,
      content: body.content,
    };
  }

  async downloadComponentAttachment(
    courseId: string,
    assetId: string,
    token: string,
  ): Promise<CourseAttachmentDownloadResult> {
    const response = await this.apiClient.fetch(
      `/courses/${encodeURIComponent(courseId)}/content/attachments/${encodeURIComponent(assetId)}`,
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };

      return {
        ok: false,
        message: body.message ?? 'Unable to download attachment.',
      };
    }

    return {
      ok: true,
      blob: await response.blob(),
    };
  }

  async saveCourseCatalogMetadata(
    courseId: string,
    metadata: CourseCatalogMetadataDraft,
    token: string,
  ): Promise<CourseSaveResult> {
    const response = await this.apiClient.fetch(`/courses/${encodeURIComponent(courseId)}/catalog-metadata`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(metadata),
    });
    const body = (await response.json().catch(() => ({}))) as CourseListItem | { message?: string };

    if (!response.ok || !('id' in body)) {
      return {
        ok: false,
        message:
          'message' in body && body.message ? body.message : 'Unable to save course catalog metadata.',
      };
    }

    this.apiClient.invalidateCache('/courses');

    return {
      ok: true,
      course: body,
    };
  }

  async uploadCourseThumbnail(courseId: string, file: File, token: string, revision?: CourseRevision | null): Promise<CourseSaveResult> {
    const response = await this.apiClient.fetch(`/courses/${encodeURIComponent(courseId)}/thumbnail`, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
        'X-File-Name': file.name,
        authorization: `Bearer ${token}`,
        ...courseRevisionHeaders(revision),
      },
      body: file,
    });
    const body = (await response.json().catch(() => ({}))) as CourseListItem | { message?: string; code?: string };

    if (!response.ok || !('id' in body)) {
      return {
        ok: false,
        code: "code" in body ? body.code : undefined,
        message: 'message' in body && body.message ? body.message : 'Unable to upload course thumbnail.',
      };
    }

    this.apiClient.invalidateCache('/courses');

    return {
      ok: true,
      course: (({ review, ...course }) => course)(body as CourseListItem & { review?: CourseReviewState }),
      review: (body as CourseListItem & { review?: CourseReviewState }).review,
    };
  }

  async enrollCourse(courseId: string, token: string): Promise<CourseEnrollmentResult> {
    const response = await this.apiClient.fetch(`/users/me/courses/${encodeURIComponent(courseId)}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const body = (await response.json().catch(() => ({}))) as
      | Omit<LoginResponse, 'token'>
      | { message?: string };

    if (!response.ok || !('user' in body)) {
      return {
        ok: false,
        message: 'message' in body && body.message ? body.message : 'Unable to enroll in this course.',
      };
    }

    this.apiClient.invalidateCache('/me');

    return {
      ok: true,
      login: body,
    };
  }

  private splitMultilineList(value: string): string[] {
    return value
      .split(/\r?\n/)
      .map((item) => item.replace(/^[•*-]\s*/, '').trim())
      .filter(Boolean);
  }

  private attachmentContentType(file: File): string {
    if (file.type) {
      return file.type;
    }

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

    switch (extension) {
      case 'zip':
        return 'application/zip';
      case 'ppt':
        return 'application/vnd.ms-powerpoint';
      case 'pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case 'pdf':
        return 'application/pdf';
      case 'doc':
        return 'application/msword';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'txt':
        return 'text/plain';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      default:
        return 'application/octet-stream';
    }
  }

  private uploadComponentAttachmentRequest(
    courseId: string,
    sectionId: string,
    componentId: string,
    file: File,
    token: string,
    markerId: string,
    onProgress?: (progress: number) => void,
    revision?: CourseRevision | null,
  ): Promise<
    | {
        ok: true;
        attachment: CourseComponentAttachment;
        content: CourseContentDocument;
      }
    | {
        ok: false;
        message: string;
      code?: string;
      }
  > {
    return new Promise((resolve) => {
      const request = new XMLHttpRequest();
      this.activeAttachmentUploadRequest = request;
      const url = this.apiClient.resourceUrl(
        `/courses/${encodeURIComponent(courseId)}/content/components/${encodeURIComponent(componentId)}/attachments`,
      );

      request.open('PUT', url);
      request.responseType = 'json';
      request.setRequestHeader('Content-Type', this.attachmentContentType(file));
      request.setRequestHeader('X-File-Name', file.name);
      request.setRequestHeader('X-Section-Id', sectionId);
      request.setRequestHeader('X-Attachment-Marker', markerId);
      request.setRequestHeader('authorization', `Bearer ${token}`);
      for (const [name, value] of Object.entries(courseRevisionHeaders(revision))) request.setRequestHeader(name, value);

      if (onProgress) {
        request.upload.addEventListener('progress', (event) => {
          if (!event.lengthComputable) {
            return;
          }

          onProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))));
        });
      }

      request.addEventListener('load', () => {
        const body = (request.response ??
          this.parseJsonResponse(request.responseText)) as
          | {
              attachment?: CourseComponentAttachment;
              content?: CourseContentDocument;
              message?: string;
              code?: string;
            }
          | undefined;

        if (request.status < 200 || request.status >= 300 || !body?.attachment || !body.content) {
          resolve({
            ok: false,
            message: body?.message ?? 'Unable to upload attachment.',
            code: body?.code,
          });
          return;
        }

        resolve({
          ok: true,
          attachment: body.attachment,
          content: body.content,
        });
      });

      request.addEventListener('error', () => {
        this.activeAttachmentUploadRequest = null;
        resolve({
          ok: false,
          message: 'Unable to upload attachment.',
        });
      });

      request.addEventListener('abort', () => {
        this.activeAttachmentUploadRequest = null;
        resolve({
          ok: false,
          message: 'Upload cancelled.',
        });
      });

      request.addEventListener('loadend', () => {
        if (this.activeAttachmentUploadRequest === request) {
          this.activeAttachmentUploadRequest = null;
        }
      });

      request.send(file);
    });
  }

  private parseJsonResponse(value: string): unknown {
    try {
      return value ? JSON.parse(value) : {};
    } catch {
      return {};
    }
  }

}
