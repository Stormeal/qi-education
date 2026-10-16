// Old UI patterns that migrated code must not bring back. Tasks 7-11 add entries.
export const REMOVED = [
  { id: 'app-button', kind: 'element', name: 'app-button' },
  { id: 'app-button-class', kind: 'class', name: 'app-button' },
  { id: 'cp-btn', kind: 'class', name: 'cp-btn' },
  { id: 'cp-btn-primary', kind: 'class', name: 'cp-btn-primary' },
  { id: 'cp-btn-secondary', kind: 'class', name: 'cp-btn-secondary' },
  { id: 'cp-btn-ghost', kind: 'class', name: 'cp-btn-ghost' },
  { id: 'cp-btn-map', kind: 'class', name: 'cp-btn-map' },
  { id: 'cp-btn-arrow', kind: 'class', name: 'cp-btn-arrow' },
  { id: 'cpe-btn', kind: 'class', name: 'cpe-btn' },
  { id: 'learning-primary-button', kind: 'class', name: 'learning-primary-button' },
  { id: 'learning-secondary-button', kind: 'class', name: 'learning-secondary-button' },
  { id: 'learning-attachment-item', kind: 'class', name: 'learning-attachment-item' },
  { id: 'curriculum-expand-button', kind: 'class', name: 'curriculum-expand-button' },
  { id: 'course-admin-action', kind: 'class', name: 'course-admin-action' },
  { id: 'price-modal-close', kind: 'class', name: 'price-modal-close' },
  { id: 'carousel-control', kind: 'class', name: 'carousel-control' },
  { id: 'filters-toggle', kind: 'class', name: 'filters-toggle' },
  { id: 'filters-clear', kind: 'class', name: 'filters-clear' },
  { id: 'course-preview-action', kind: 'class', name: 'course-preview-action' },
  { id: 'icon-action-button', kind: 'class', name: 'icon-action-button' },
  { id: 'icon-action-button-danger', kind: 'class', name: 'icon-action-button-danger' },
  { id: 'chevron-button', kind: 'class', name: 'chevron-button' },
  { id: 'component-row-action', kind: 'class', name: 'component-row-action' },
  { id: 'component-row-action-danger', kind: 'class', name: 'component-row-action-danger' },
  { id: 'mux-upload-button', kind: 'class', name: 'mux-upload-button' },
  { id: 'add-component-button', kind: 'class', name: 'add-component-button' },
  { id: 'quiz-add-question-button', kind: 'class', name: 'quiz-add-question-button' },
  { id: 'quiz-inline-action', kind: 'class', name: 'quiz-inline-action' },
  { id: 'quiz-question-remove', kind: 'class', name: 'quiz-question-remove' },
  { id: 'quiz-answer-remove', kind: 'class', name: 'quiz-answer-remove' },
  { id: 'attachment-icon-button', kind: 'class', name: 'attachment-icon-button' },
  { id: 'attachment-icon-button-danger', kind: 'class', name: 'attachment-icon-button-danger' },
  { id: 'component-picker-add', kind: 'class', name: 'component-picker-add' },
  { id: 'admin-feedback-tabs', kind: 'class', name: 'admin-feedback-tabs' },
  { id: 'catalog-view-tabs', kind: 'class', name: 'catalog-view-tabs' },
  { id: 'learning-quiz-progress', kind: 'class', name: 'learning-quiz-progress' },
  { id: 'db-action-progress', kind: 'class', name: 'db-action-progress' },
  { id: 'preview-progress-track', kind: 'class', name: 'preview-progress-track' },
  { id: 'mux-upload-progress', kind: 'class', name: 'mux-upload-progress' },
  { id: 'attachment-upload-progress', kind: 'class', name: 'attachment-upload-progress' },
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lineAt = (text, index) => text.slice(0, index).split('\n').length;

function matchesFor(entry, text, path) {
  const name = escape(entry.name);
  const token = `(?<![\\w-])${name}(?![\\w-])`;
  const indexes = [];
  const push = (re) => {
    for (const m of text.matchAll(re)) indexes.push(m.index);
  };
  if (entry.kind === 'element') {
    if (path.endsWith('.scss')) push(new RegExp(`(?<![\\w.#-])${name}(?![\\w-])`, 'g'));
    else push(new RegExp(`</?${name}(?![\\w-])`, 'g'));
  } else {
    if (!path.endsWith('.scss')) {
      push(new RegExp(`\\[class\\.${name}\\]`, 'g'));
      for (const attr of text.matchAll(/\b(?:class|ngClass)\s*=\s*("[^"]*"|'[^']*')/g)) {
        for (const t of attr[0].matchAll(new RegExp(token, 'g'))) indexes.push(attr.index + t.index);
      }
    }
    if (!path.endsWith('.html')) push(new RegExp(`\\.${name}(?![\\w-])`, 'g'));
  }
  return indexes;
}

export function findRemoved(files, removed = REMOVED) {
  const findings = [];
  for (const { path, text } of files) {
    const seen = new Set();
    const fileFindings = [];
    for (const entry of removed) {
      for (const index of matchesFor(entry, text, path)) {
        const line = lineAt(text, index);
        const key = `${line}:${entry.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        fileFindings.push({ path, line, id: entry.id });
      }
    }
    findings.push(...fileFindings.sort((a, b) => a.line - b.line));
  }
  return findings;
}
