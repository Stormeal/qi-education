import { Injectable, inject } from '@angular/core';
import { ApiClientService } from './api-client.service';

export type LessonNote = {
  id: string;
  courseId: string;
  componentId: string;
  text: string;
  videoSeconds: number | null;
  createdAt: string;
  updatedAt: string;
};
export type AddLessonNoteInput = Pick<LessonNote, 'componentId' | 'text' | 'videoSeconds'>;
export type LessonFeedbackKind = 'helpful' | 'not-helpful' | 'problem';
export type ProblemCategory = 'video' | 'content-error' | 'unclear' | 'files' | 'other';
export type LessonFeedbackInput = {
  componentId: string;
  kind: LessonFeedbackKind;
  category?: ProblemCategory;
  message?: string;
};

@Injectable({ providedIn: 'root' })
export class LessonExtrasService {
  private readonly apiClient = inject(ApiClientService);

  async listNotes(courseId: string, token: string): Promise<LessonNote[]> {
    const body = await this.request<{ notes: LessonNote[] }>(courseId, '/notes', token, 'GET', undefined, 'Unable to load notes.');
    return body.notes;
  }

  async addNote(courseId: string, input: AddLessonNoteInput, token: string): Promise<LessonNote> {
    const body = await this.request<{ note: LessonNote }>(courseId, '/notes', token, 'POST', input, 'Unable to add the note.');
    return body.note;
  }

  async updateNote(courseId: string, noteId: string, text: string, token: string): Promise<LessonNote> {
    const body = await this.request<{ note: LessonNote }>(courseId, `/notes/${encodeURIComponent(noteId)}`, token, 'PATCH', { text }, 'Unable to update the note.');
    return body.note;
  }

  async deleteNote(courseId: string, noteId: string, token: string): Promise<void> {
    await this.request<void>(courseId, `/notes/${encodeURIComponent(noteId)}`, token, 'DELETE', undefined, 'Unable to delete the note.');
  }

  async sendLessonFeedback(courseId: string, input: LessonFeedbackInput, token: string): Promise<void> {
    await this.request<{ id: string }>(courseId, '/lesson-feedback', token, 'POST', input, 'Unable to send lesson feedback.');
  }

  async enrolledLearners(courseId: string, token: string): Promise<number> {
    const body = await this.request<{ enrolledLearners: number }>(courseId, '/learners/count', token, 'GET', undefined, 'Unable to load the learner count.');
    return body.enrolledLearners;
  }

  private async request<T>(courseId: string, suffix: string, token: string, method: string, input: unknown, fallback: string): Promise<T> {
    let response: Response;
    try {
      // Reads deliberately bypass the shared JSON cache: notes and counts can
      // change on another device, and must always use the supplied account.
      response = await this.apiClient.fetch(`/courses/${encodeURIComponent(courseId)}${suffix}`, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(input === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      });
    } catch {
      throw new Error(fallback);
    }
    if (response.ok && response.status === 204) return undefined as T;
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' && body.message.trim()
        ? body.message : fallback;
      throw new Error(message);
    }
    if (body === undefined) throw new Error(fallback);
    return body as T;
  }
}
