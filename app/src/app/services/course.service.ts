import { Injectable, inject } from '@angular/core';
import {
  CourseCatalogMetadataDraft,
  CourseComponentAttachment,
  CourseContentDocument,
  CourseCreateDraft,
  CourseListItem,
  CourseSection,
  LoginResponse,
} from '../app.models';
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
    };

export type CourseMuxVideoRemoveResult =
  | {
      ok: true;
      content: CourseContentDocument;
    }
  | {
      ok: false;
      message: string;
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
    };

export type CourseAttachmentRemoveResult =
  | {
      ok: true;
      content: CourseContentDocument;
    }
  | {
      ok: false;
      message: string;
    };

export type CourseAttachmentDownloadResult =
  | {
      ok: true;
      blob: Blob;
    }
  | {
      ok: false;
      message: string;
    };

export type CourseEnrollmentResult =
  | {
      ok: true;
      login: Omit<LoginResponse, 'token'>;
    }
  | {
      ok: false;
      message: string;
    };

@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly apiClient = inject(ApiClientService);
  private readonly warmedThumbnailUrls = new Set<string>();
  private readonly thumbnailWarmRequests = new Map<string, Promise<void>>();

  async listCourses(): Promise<CourseListItem[]> {
    const { ok, body } = await this.apiClient.fetchJson<CourseListItem[]>('/courses');

    if (!ok || !Array.isArray(body)) {
      throw new Error(!Array.isArray(body) && body.message ? body.message : 'Unable to load courses.');
    }

    return body;
  }

  warmCourseThumbnailCache(courses: CourseListItem[]): void {
    for (const course of courses) {
      if (!course.thumbnailAssetId) {
        continue;
      }

      this.warmThumbnailUrl(
        this.apiClient.resourceUrl(
          `/courses/${encodeURIComponent(course.id)}/thumbnail?v=${encodeURIComponent(course.thumbnailAssetId)}`,
        ),
      );
    }
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

  async createMuxUpload(
    courseId: string,
    sectionId: string,
    componentId: string,
    token: string,
  ): Promise<CourseMuxUploadResult> {
    const response = await this.apiClient.fetch(
      `/courses/${encodeURIComponent(courseId)}/content/components/${encodeURIComponent(componentId)}/mux-upload`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
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
        };

    if (!response.ok || !body.uploadId || !body.uploadUrl || !body.content) {
      return {
        ok: false,
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
  ): Promise<CourseMuxVideoRemoveResult> {
    const response = await this.apiClient.fetch(
      `/courses/${encodeURIComponent(courseId)}/content/components/${encodeURIComponent(componentId)}/mux-video`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sectionId }),
      },
    );
    const body = (await response.json().catch(() => ({}))) as
      | {
          content?: CourseContentDocument;
          message?: string;
        };

    if (!response.ok || !body.content) {
      return {
        ok: false,
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
  ): Promise<CourseAttachmentUploadResult> {
    const response = await this.apiClient.fetch(
      `/courses/${encodeURIComponent(courseId)}/content/components/${encodeURIComponent(componentId)}/attachments`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': this.attachmentContentType(file),
          'X-File-Name': file.name,
          'X-Section-Id': sectionId,
          authorization: `Bearer ${token}`,
        },
        body: file,
      },
    );
    const body = (await response.json().catch(() => ({}))) as
      | {
          attachment?: CourseComponentAttachment;
          content?: CourseContentDocument;
          message?: string;
        };

    if (!response.ok || !body.attachment || !body.content) {
      return {
        ok: false,
        message: body.message ?? 'Unable to upload attachment.',
      };
    }

    this.apiClient.invalidateCache(`/courses/${encodeURIComponent(courseId)}/content`);

    return {
      ok: true,
      attachment: body.attachment,
      content: body.content,
    };
  }

  async removeComponentAttachment(
    courseId: string,
    sectionId: string,
    componentId: string,
    assetId: string,
    token: string,
  ): Promise<CourseAttachmentRemoveResult> {
    const response = await this.apiClient.fetch(
      `/courses/${encodeURIComponent(courseId)}/content/components/${encodeURIComponent(componentId)}/attachments/${encodeURIComponent(assetId)}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sectionId }),
      },
    );
    const body = (await response.json().catch(() => ({}))) as
      | {
          content?: CourseContentDocument;
          message?: string;
        };

    if (!response.ok || !body.content) {
      return {
        ok: false,
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

  async uploadCourseThumbnail(courseId: string, file: File, token: string): Promise<CourseSaveResult> {
    const response = await this.apiClient.fetch(`/courses/${encodeURIComponent(courseId)}/thumbnail`, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
        'X-File-Name': file.name,
        authorization: `Bearer ${token}`,
      },
      body: file,
    });
    const body = (await response.json().catch(() => ({}))) as CourseListItem | { message?: string };

    if (!response.ok || !('id' in body)) {
      return {
        ok: false,
        message: 'message' in body && body.message ? body.message : 'Unable to upload course thumbnail.',
      };
    }

    this.apiClient.invalidateCache('/courses');

    return {
      ok: true,
      course: body,
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

  private warmThumbnailUrl(url: string): void {
    if (this.warmedThumbnailUrls.has(url) || this.thumbnailWarmRequests.has(url)) {
      return;
    }

    const image = new Image();
    const warmRequest = new Promise<void>((resolve) => {
      const finish = (): void => {
        image.onload = null;
        image.onerror = null;
        this.thumbnailWarmRequests.delete(url);
        this.warmedThumbnailUrls.add(url);
        resolve();
      };

      image.onload = finish;
      image.onerror = finish;
    });

    this.thumbnailWarmRequests.set(url, warmRequest);
    image.decoding = 'async';
    image.src = url;
  }
}
