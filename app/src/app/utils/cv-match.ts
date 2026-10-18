import { CareerPath } from '../app.models';

export type CvMatch = { actionId: string; actionTitle: string; milestoneTitle: string; snippet: string };

// Same form for CV text and keywords: Unicode variants, dashes and whitespace never decide a match.
const tidy = (text: string) => text.normalize('NFKC').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, ' ');
const normalise = (text: string) => tidy(text).toLowerCase();

/** Finds actions of milestone-format careers whose CV keywords appear in the text as whole words or phrases. */
export function matchCvText(text: string, paths: CareerPath[], satisfiedActionIds: string[]): { found: CvMatch[]; alreadyRecorded: CvMatch[] } {
  const shown = tidy(text);
  const cv = shown.toLowerCase();
  // Snippets keep the CV's own capitals unless lowercasing changed the length (rare letters such as İ).
  const source = shown.length === cv.length ? shown : cv;
  const seen = new Set<string>();
  const found: CvMatch[] = [];
  const alreadyRecorded: CvMatch[] = [];
  for (const path of paths.filter((item) => item.schemaVersion === 2)) {
    for (const step of path.steps) {
      for (const action of step.actions ?? []) {
        if (seen.has(action.id)) continue;
        const hit = (action.cvKeywords ?? []).map((keyword) => wholeWordIndex(cv, normalise(keyword.trim())))
          .find((index) => index !== null);
        if (!hit) continue;
        seen.add(action.id);
        const snippet = (hit.start > 30 ? '…' : '') + source.slice(Math.max(0, hit.start - 30), hit.end + 30).trim()
          + (hit.end + 30 < cv.length ? '…' : '');
        const match = { actionId: action.id, actionTitle: action.title, milestoneTitle: step.title, snippet };
        (satisfiedActionIds.includes(action.id) ? alreadyRecorded : found).push(match);
      }
    }
  }
  return { found, alreadyRecorded };
}

function wholeWordIndex(cv: string, keyword: string): { start: number; end: number } | null {
  if (!keyword) return null;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').exec(cv);
  return match ? { start: match.index, end: match.index + keyword.length } : null;
}
