import { Injectable } from '@angular/core';
import type { CourseCreateDraft, CourseSection } from '../app.models';
import type { CourseRevision } from './course.service';

export type CourseEditorBuffer = { sectionId: string; componentId?: string; value: string };
export type RecoverableCourseDraft = {
  key: string; updatedAt: number; accountId: string; courseId: string;
  draft: CourseCreateDraft; sections: CourseSection[]; revision: CourseRevision | null;
};
const prefix = 'qi-course-draft-v1:';
const lifetime = 7 * 86400000;
const maxLength = 2_000_000;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: Record<string, unknown>, fields: string[]) => fields.every(field => typeof value[field] === 'string');
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
function validSections(value: unknown): value is CourseSection[] {
  return Array.isArray(value) && value.every(section => object(section) && strings(section, ['id', 'title']) && Array.isArray(section['components']) && section['components'].every(component => {
    if (!object(component) || !strings(component, ['id', 'title', 'content', 'resourceUrl']) || !number(component['durationMinutes']) ||
      !['text', 'video', 'resources', 'quiz'].includes(String(component['type'])) || !Array.isArray(component['attachments']) ||
      !component['attachments'].every(attachment => object(attachment) && strings(attachment, ['id', 'assetId', 'fileName', 'contentType', 'createdAt']) && number(attachment['sizeBytes']))) return false;
    if (component['type'] === 'quiz') {
      const quiz = component['quiz'];
      if (!object(quiz) || !number(quiz['passPoints']) || !Array.isArray(quiz['questions']) || !quiz['questions'].every(question => object(question) && strings(question, ['id', 'question']) && number(question['points']) && Array.isArray(question['answers']) && question['answers'].length === 4 && question['answers'].every(answer => object(answer) && strings(answer, ['id', 'text']) && (answer['description'] === undefined || typeof answer['description'] === 'string') && (answer['isCorrect'] === undefined || typeof answer['isCorrect'] === 'boolean')))) return false;
    }
    if (component['mux'] !== undefined) {
      const mux = component['mux'];
      if (!object(mux) || mux['provider'] !== 'mux' || !strings(mux, ['uploadId', 'assetId', 'playbackId', 'thumbnailUrl', 'errorMessage']) ||
        !['public', 'signed'].includes(String(mux['playbackPolicy'])) || !['waiting', 'uploading', 'processing', 'ready', 'errored'].includes(String(mux['status'])) ||
        !(mux['durationSeconds'] === null || number(mux['durationSeconds'])) || !Array.isArray(mux['captions']) || !mux['captions'].every(caption => object(caption) && strings(caption, ['id', 'languageCode', 'name']) && ['ready', 'processing', 'errored'].includes(String(caption['status'])))) return false;
    }
    return true;
  }));
}
function valid(value: unknown): value is Omit<RecoverableCourseDraft, 'key'> {
  if (!object(value) || !strings(value, ['accountId', 'courseId']) || !number(value['updatedAt']) || !object(value['draft'])) return false;
  const draft = value['draft'], revision = value['revision'];
  return strings(draft, ['title', 'description', 'requirements', 'whatYoullLearn', 'audience', 'level', 'partOfCareer', 'teacher', 'careerGoals']) &&
    draft['status'] === 'draft' && (draft['priceDkk'] === null || number(draft['priceDkk'])) && validSections(value['sections']) &&
    (revision === null || (object(revision) && Number.isSafeInteger(revision['version']) && Number(revision['version']) >= 0 && (revision['revisionId'] === null || typeof revision['revisionId'] === 'string')));
}

/** Untrusted, device-local recovery only. Never persists credentials or publishes content. */
@Injectable({ providedIn: 'root' })
export class CourseDraftRecoveryService {
  // A fresh document identity also isolates duplicated tabs, whose sessionStorage
  // is cloned by browsers. Previous documents remain explicitly recoverable.
  private readonly tabId = crypto.randomUUID();
  key(accountId: string, courseId: string): string {
    return prefix + [accountId, courseId, this.tabId].map(encodeURIComponent).join(':');
  }
  save(data: Omit<RecoverableCourseDraft, 'key' | 'updatedAt'>): boolean {
    try {
      const serialized = JSON.stringify({ ...data, updatedAt: Date.now() });
      if (new TextEncoder().encode(serialized).byteLength > maxLength) return false;
      localStorage.setItem(this.key(data.accountId, data.courseId), serialized); return true;
    } catch { return false; }
  }
  load(accountId: string, courseId: string): RecoverableCourseDraft | null {
    return this.loadAll(accountId, courseId)[0] ?? null;
  }
  loadAll(accountId: string, courseId: string): RecoverableCourseDraft[] {
    try {
      const ownKey = this.key(accountId, courseId);
      const scope = prefix + [accountId, courseId].map(encodeURIComponent).join(':') + ':';
      const records: RecoverableCourseDraft[] = [];
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index)!;
        if (!key.startsWith(scope)) continue;
        try {
          const raw = localStorage.getItem(key)!;
          if (new TextEncoder().encode(raw).byteLength > maxLength) continue;
          const data: unknown = JSON.parse(raw);
          if (valid(data) && data.accountId === accountId && data.courseId === courseId && data.updatedAt <= Date.now() && Date.now() - data.updatedAt < lifetime) records.push({ ...data, key });
        } catch { /* Corrupt records cannot become editor state. */ }
      }
      return records.sort((a, b) => a.key === ownKey ? -1 : b.key === ownKey ? 1 : b.updatedAt - a.updatedAt);
    } catch { return []; }
  }
  remove(key: string): boolean {
    try { localStorage.removeItem(key); return true; } catch { return false; }
  }
}
