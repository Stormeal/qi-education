import { readFile } from 'node:fs/promises';
import type { CourseContentComponent, CourseContentSection } from './courseContent.js';
import type { ImportFile, ImportPlan } from './riseImport.js';

export type ImportOptions = {
  apiUrl: string; email: string; password: string; courseId?: string;
  fetch?: typeof fetch; readFile?: (path: string) => Promise<Buffer>; log?: (line: string) => void;
};

/** Carries the course id once the course exists, so the caller can offer a resume. */
export class RiseImportError extends Error {
  constructor(message: string, readonly courseId: string | null) { super(message); }
}

type Review = { version: number; revisionId: string | null };
type ContentAnswer = { sections?: CourseContentSection[]; review?: Review };

// The API stores the same characters; matching on them lets a resume recognise its own uploads.
const asciiFileName = (name: string) => name.replace(/[^a-zA-Z0-9._ -]/g, '-');
const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export async function runRiseImport(plan: ImportPlan, options: ImportOptions):
  Promise<{ courseId: string; videosUploaded: number; attachmentsUploaded: number }> {
  const send = options.fetch ?? fetch;
  const read = options.readFile ?? readFile;
  const log = options.log ?? (() => undefined);
  const api = options.apiUrl.replace(/\/+$/, '');
  let courseId = options.courseId ?? null;
  let token = '';

  const call = async (step: string, path: string, init: RequestInit = {}) => {
    let response: Response;
    try {
      response = await send(`${api}${path}`, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } });
    } catch (error) {
      throw new RiseImportError(`${step}: ${message(error)}`, courseId);
    }
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new RiseImportError(`${step}: ${response.status} ${String(body.message ?? response.statusText)}`, courseId);
    return body;
  };
  const json = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit =>
    ({ method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const bytes = async (file: { path: string }) => new Uint8Array(await read(file.path));

  token = String((await call('Sign in', '/auth/login', json('POST', { email: options.email, password: options.password }))).token);

  let current: ContentAnswer;
  if (courseId) {
    current = await call('Read course', `/courses/${courseId}/content?view=author`) as ContentAnswer;
  } else {
    const created = await call('Create course', '/courses', json('POST', { ...plan.course, status: 'draft' }));
    courseId = String(created.id);
    log(`Course created: ${courseId}`);
    current = { sections: [], review: created.review as Review };
  }
  // A run that stopped right after creating the course resumes by saving the lessons too.
  if (!current.sections?.length) {
    const revision = JSON.stringify({ version: current.review?.version, revisionId: current.review?.revisionId ?? null });
    current = await call('Save lessons', `/courses/${courseId}/content`, json('PATCH', { sections: plan.sections }, { 'X-Course-Revision': revision })) as ContentAnswer;
    if (plan.thumbnail) {
      await call('Upload thumbnail', `/courses/${courseId}/thumbnail`,
        { method: 'PUT', headers: { 'Content-Type': plan.thumbnail.contentType }, body: await bytes(plan.thumbnail) });
    }
  }
  const lesson = (file: ImportFile): CourseContentComponent => {
    const found = current.sections?.find((section) => section.id === file.sectionId)?.components.find((component) => component.id === file.componentId);
    if (!found) throw new RiseImportError(`${file.fileName}: lesson ${file.componentId} is not in the course`, courseId);
    return found;
  };
  const lessonPath = (file: ImportFile) => `/courses/${courseId}/content/components/${encodeURIComponent(file.componentId)}`;

  let attachmentsUploaded = 0;
  for (const file of plan.attachments) {
    const fileName = asciiFileName(file.fileName);
    if (lesson(file).attachments.some((attachment) => attachment.fileName === fileName)) continue;
    log(`Attachment: ${file.fileName} (${megabytes(file.sizeBytes)} MB)`);
    await call(`Upload ${file.fileName}`, `${lessonPath(file)}/attachments`, { method: 'PUT',
      headers: { 'Content-Type': file.contentType, 'X-Section-Id': file.sectionId, 'X-File-Name': fileName }, body: await bytes(file) });
    attachmentsUploaded += 1;
  }

  let videosUploaded = 0;
  for (const [index, file] of plan.videos.entries()) {
    const component = lesson(file);
    const mux = 'mux' in component ? component.mux : undefined;
    // Mux fills in assetId seconds after a finished upload; a waiting video without one never received its file.
    if (mux && !(mux.status === 'errored' || (mux.status === 'waiting' && !mux.assetId))) continue;
    if (mux) await call(`Remove stalled video ${component.title}`, `${lessonPath(file)}/mux-video`, json('DELETE', { sectionId: file.sectionId }));
    const { uploadUrl } = await call(`Start video upload ${component.title}`, `${lessonPath(file)}/mux-upload`, json('POST', { sectionId: file.sectionId }));
    log(`Video ${index + 1}/${plan.videos.length}: ${component.title} (${megabytes(file.sizeBytes)} MB)`);
    try {
      const response = await send(String(uploadUrl), { method: 'PUT', headers: { 'Content-Type': file.contentType }, body: await bytes(file) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      throw new RiseImportError(`Upload video ${component.title}: ${message(error)}`, courseId);
    }
    videosUploaded += 1;
  }

  return { courseId, videosUploaded, attachmentsUploaded };
}
