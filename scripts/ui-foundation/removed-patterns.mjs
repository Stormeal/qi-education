// Old UI patterns that migrated code must not bring back. Tasks 7-11 add entries.
export const REMOVED = [];

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
