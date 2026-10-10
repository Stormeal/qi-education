/**
 * Keeps a textarea looking like a bullet list while it is typed in: every line has its
 * bullet, including the empty line just started. A bullet with its space deleted is the
 * teacher backspacing the line away, so that line is removed.
 */
export function normalizeBulletList(value: string): string {
  if (!value.trim()) return value.includes('\n') ? value.split(/\r?\n/).map(() => '• ').join('\n') : '';
  return value
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '•')
    .map((line) => `• ${line.replace(/^\s*[•*-]?\s*/, '')}`)
    .join('\n');
}
