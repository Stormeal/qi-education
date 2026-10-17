import { CourseComponentType } from '../app.models';
import { inertHtml } from './inert-html';

/** Lesson text as HTML: stored editor HTML (without its editor-only controls) or the small markdown subset. */
export function renderLessonMarkdown(document: Document, markdown: string): string {
  if (/<\/?[a-z][\s\S]*>/i.test(markdown)) {
    // Attachment cards carry editor-only download/remove controls; learners use the file list instead.
    const container = inertHtml(document, markdown);
    container.querySelectorAll('.rich-attachment-actions').forEach((actions) => actions.remove());
    return container.innerHTML;
  }

  const html: string[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (listItems.length > 0) {
      html.push(`<ul>${listItems.join('')}</ul>`);
      listItems = [];
    }
  };

  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const listItem = trimmed.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      listItems.push(`<li>${renderInline(listItem[1])}</li>`);
      continue;
    }

    flushList();
    html.push(`<p>${renderInline(trimmed)}</p>`);
  }

  flushList();
  return html.join('');
}

function renderInline(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\+\+(.+?)\+\+/g, '<u>$1</u>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

/** "45 min", "2h", "1h 5m"; "0 min" for nothing. */
export function formatDuration(durationMinutes: number): string {
  if (durationMinutes < 60) return `${Math.max(0, durationMinutes)} min`;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function formatFileSize(sizeBytes: number): string {
  return sizeBytes < 1024 * 1024
    ? `${Math.max(1, Math.round(sizeBytes / 1024))} KB`
    : `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A video position as "4:05" or "1:02:09". */
export function formatVideoTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function lessonTypeLabel(type: CourseComponentType): string {
  switch (type) {
    case 'video':
      return 'Video';
    case 'quiz':
      return 'Quiz';
    case 'resources':
      return 'Resources';
    case 'exercise':
      return 'Exercise';
    default:
      return 'Text';
  }
}
