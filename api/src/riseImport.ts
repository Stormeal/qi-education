import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { updateCourseContentSchema, type CourseContentComponent, type CourseContentSection } from './courseContent.js';
import { assessmentIssues } from './quizAssessment.js';

export type ImportFile = { sectionId: string; componentId: string; path: string; fileName: string; contentType: string; sizeBytes: number };
export type ImportPlan = {
  course: { title: string; description: string; teacher: string; level: string };
  sections: CourseContentSection[];
  videos: ImportFile[];
  attachments: ImportFile[];
  thumbnail: Omit<ImportFile, 'sectionId' | 'componentId'> | null;
  skipped: string[];
  problems: string[];
};

export class NotRiseExportError extends Error {
  constructor() { super('Only Articulate Rise exports can be imported.'); }
}

const ATTACHMENT_LIMIT = 4 * 1024 * 1024;
const THUMBNAIL_LIMIT = 2 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// Rise's export format is undocumented; these are the fields the importer reads.
type RiseMedia = { key?: string; duration?: number; originalUrl?: string; mimeType?: string; crushedKey?: string };
type RiseItem = {
  id: string; heading?: string; paragraph?: string; title?: string; type?: string; feedback?: string; correct?: boolean;
  answers?: RiseItem[]; media?: { video?: RiseMedia; attachment?: RiseMedia };
};
type RiseBlock = { id: string; type?: string; variant?: string; items?: RiseItem[] };
type RiseCourse = {
  title?: string; description?: string; authors?: { authorName?: string }[];
  coverImage?: { media?: { image?: RiseMedia } }; lessons?: { id: string; title?: string; items?: RiseBlock[] }[];
};

const entities: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeEntities = (text: string) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) =>
  name[0] === '#' ? String.fromCodePoint(Number.parseInt(name.slice(name[1] === 'x' || name[1] === 'X' ? 2 : 1), name[1] === 'x' || name[1] === 'X' ? 16 : 10))
    : entities[name.toLowerCase()] ?? match);

function riseText(html = ''): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const KEPT_TAGS = new Set(['p', 'br', 'strong', 'em', 'ul', 'ol', 'li']);
function riseHtml(html = ''): string {
  const keptLinks: boolean[] = [];
  return html.replace(/<(\/?)([a-z0-9]+)([^>]*)>/gi, (_tag, closing: string, rawName: string, attributes: string) => {
    const name = rawName.toLowerCase();
    if (KEPT_TAGS.has(name)) return `<${closing}${name}>`;
    if (name !== 'a') return '';
    if (closing) return keptLinks.pop() ? '</a>' : '';
    const href = /\bhref\s*=\s*"(https?:\/\/[^"]*)"/i.exec(attributes)?.[1];
    keptLinks.push(Boolean(href));
    return href ? `<a href="${href}">` : '';
  }).replace(/<p>\s*<\/p>/g, '').trim();
}

const lessonCount = (count: number) => `${count} lesson${count === 1 ? '' : 's'}`;
const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

export async function planRiseImport(folder: string): Promise<ImportPlan> {
  const assets = join(folder, 'scormcontent', 'assets');
  const course = await readRiseCourse(folder);
  const plan: ImportPlan = {
    course: {
      title: riseText(course.title), description: riseText(course.description),
      teacher: course.authors?.[0]?.authorName?.trim() ?? '', level: 'Foundation',
    },
    sections: [], videos: [], attachments: [], thumbnail: null, skipped: [], problems: [],
  };
  const dropped = new Map<string, number>();
  // DEF-059: a media key from runtime-data.js is untrusted; only files really inside the assets folder are read, links followed.
  const root = await realpath(assets).catch(() => resolve(assets));
  const inside = (path: string) => { const rel = relative(root, path); return !!rel && !rel.startsWith('..') && !isAbsolute(rel); };
  const assetFile = async (name: string): Promise<{ path: string; size: number } | null> => {
    const path = resolve(assets, name);
    const real = await realpath(path).catch(() => null);
    if (!inside(real ?? path)) { plan.problems.push(`File outside the export folder: ${name}`); return null; }
    if (!real) { plan.problems.push(`Missing file: ${name}`); return null; }
    // shortcut: checked here and read later by the import run, so a file swapped in between is not caught; fine for an operator CLI.
    return { path, size: (await stat(real)).size };
  };

  for (const lesson of course.lessons ?? []) {
    const sectionTitle = riseText(lesson.title);
    const components: CourseContentComponent[] = [];
    let topic: string | null = null;
    let headingIsTopic = false;
    // Rise labels a block with a heading above it; it names the next lesson rather than being one.
    let pendingTitle: string | null = null;
    let videosInTopic = 0;
    let openQuiz: Extract<CourseContentComponent, { type: 'quiz' }> | null = null;
    const base = (id: string, title: string) => ({ id, title, durationMinutes: 0, content: '', resourceUrl: '', attachments: [] });

    for (const block of lesson.items ?? []) {
      const first = block.items?.[0];
      if (block.type !== 'knowledgeCheck') openQuiz = null;
      if (block.variant === 'numbered divider') {
        topic = null; headingIsTopic = true; videosInTopic = 0; pendingTitle = null;
        continue;
      }
      if (block.variant === 'heading' && headingIsTopic) {
        topic = riseText(first?.heading); headingIsTopic = false;
        continue;
      }
      headingIsTopic = false;
      if (block.variant === 'heading' && (block.items ?? []).length === 1 && riseText(first?.heading).length <= 200) {
        pendingTitle = riseText(first?.heading);
        continue;
      }
      const title = topic ?? sectionTitle;
      const label = pendingTitle;
      pendingTitle = null;

      if (block.type === 'knowledgeCheck') {
        if (!openQuiz) {
          openQuiz = { ...base(block.id, `Videnstjek: ${title}`), type: 'quiz', quiz: { passPoints: 0, questions: [] } };
          components.push(openQuiz);
        }
        for (const item of block.items ?? []) {
          const answers = (item.answers ?? []).map((answer) => ({
            id: answer.id, text: riseText(answer.title), description: riseText(answer.feedback), isCorrect: answer.correct === true,
          }));
          openQuiz.quiz.questions.push({ id: item.id, question: riseText(item.title), points: 1,
            explanation: answers.find((answer) => answer.isCorrect)?.description ?? '', image: null, answers });
        }
        openQuiz.quiz.passPoints = openQuiz.quiz.questions.length;
      } else if (block.variant === 'video' && first?.media?.video?.key) {
        const media = first.media.video;
        videosInTopic += 1;
        components.push({ ...base(block.id, label ?? (videosInTopic > 1 ? `${title} (del ${videosInTopic})` : title)),
          type: 'video', durationMinutes: Math.ceil((media.duration ?? 0) / 60) });
        const name = decodeURIComponent(media.key!);
        const file = await assetFile(name);
        if (file) plan.videos.push({ sectionId: lesson.id, componentId: block.id, path: file.path, fileName: name, contentType: 'video/mp4', sizeBytes: file.size });
      } else if (block.variant === 'attachment' && first?.media?.attachment?.key) {
        const media = first.media.attachment;
        const name = decodeURIComponent(media.key!);
        const fileName = media.originalUrl?.trim() || name;
        components.push({ ...base(block.id, fileName.replace(/\.pdf$/i, '')), type: 'resources' });
        const file = await assetFile(name);
        if (file && file.size > ATTACHMENT_LIMIT) plan.skipped.push(`${fileName}: ${megabytes(file.size)} MB is over the 4 MB attachment limit`);
        else if (file) plan.attachments.push({ sectionId: lesson.id, componentId: block.id, path: file.path, fileName,
          contentType: media.mimeType || 'application/pdf', sizeBytes: file.size });
      } else if (block.type === 'text' && first) {
        components.push({ ...base(block.id, label ?? title), type: 'text',
          content: (block.items ?? []).map((item) => riseHtml(`${item.heading ?? ''}${item.paragraph ?? ''}`)).join('') });
      } else {
        const kind = block.variant ?? block.type ?? 'unknown';
        dropped.set(kind, (dropped.get(kind) ?? 0) + 1);
      }
    }
    plan.sections.push({ id: lesson.id, title: sectionTitle, components });
  }

  const cover = course.coverImage?.media?.image?.crushedKey;
  const coverType = cover && IMAGE_TYPES[extname(cover).toLowerCase()];
  if (cover && coverType) {
    const file = await assetFile(cover);
    if (file && file.size > THUMBNAIL_LIMIT) plan.skipped.push(`Cover image ${cover}: ${megabytes(file.size)} MB is over the 2 MB thumbnail limit`);
    else if (file) plan.thumbnail = { path: file.path, fileName: cover, contentType: coverType, sizeBytes: file.size };
  }
  if (dropped.size) plan.skipped.push(`Dropped Rise blocks: ${[...dropped].map(([kind, count]) => `${count} ${kind}`).join(', ')}`);

  const parsed = updateCourseContentSchema.safeParse({ sections: plan.sections });
  if (!parsed.success) plan.problems.push(...parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  plan.problems.push(...assessmentIssues(plan.sections, true).map((issue) => issue.message));
  return plan;
}

async function readRiseCourse(folder: string): Promise<RiseCourse> {
  let source: string;
  try { source = await readFile(join(folder, 'scormcontent', 'runtime-data.js'), 'utf8'); } catch { throw new NotRiseExportError(); }
  const encoded = /__jsonp\("runtime-data\.js",\s*"([A-Za-z0-9+/=]+)"\)/.exec(source)?.[1];
  if (!encoded) throw new NotRiseExportError();
  const course = (JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as { course?: RiseCourse }).course;
  if (!course) throw new NotRiseExportError();
  return course;
}

export function summarizePlan(plan: ImportPlan): string[] {
  const lines = plan.sections.map((section) => {
    const count = (type: string) => section.components.filter((component) => component.type === type).length;
    return `${section.title}: ${lessonCount(section.components.length)} (${count('video')} video, ${count('quiz')} quiz, ${count('resources')} resources, ${count('text')} text)`;
  });
  const lessons = plan.sections.reduce((total, section) => total + section.components.length, 0);
  const minutes = plan.sections.flatMap((section) => section.components).filter((component) => component.type === 'video')
    .reduce((total, component) => total + component.durationMinutes, 0);
  const bytes = [...plan.videos, ...plan.attachments, ...(plan.thumbnail ? [plan.thumbnail] : [])].reduce((total, file) => total + file.sizeBytes, 0);
  lines.push(`Course: "${plan.course.title}" by ${plan.course.teacher}, ${plan.sections.length} sections, ${lessonCount(lessons)}`);
  lines.push(`Videos: ${plan.videos.length}, about ${minutes} minutes. Upload: ${megabytes(bytes)} MB`);
  lines.push(...plan.skipped.map((line) => `Skipped: ${line}`), ...plan.problems.map((line) => `Problem: ${line}`));
  return lines;
}
