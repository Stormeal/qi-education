import { createHash } from 'node:crypto';
import { z } from 'zod';
import { userRoleSchema } from './auth.js';
import {
  feedbackFromSheetRow, feedbackSheetHeaders, type FeedbackEntry,
  feedbackRatingSchema, feedbackWorkStatusSchema, feedbackPrioritySchema,
  lessonFeedbackKindSchema, problemCategorySchema,
} from './feedback.js';

export class FeedbackMigrationError extends Error {
  constructor(message: string) { super(message); this.name = 'FeedbackMigrationError'; }
}
export interface FeedbackMigrationTarget {
  findFeedbackById(id: string): Promise<FeedbackEntry | null>;
  importFeedback(entry: FeedbackEntry): Promise<void>;
}
export type FeedbackMigrationResult = { sourceCount: number; imported: number; skipped: number; pending: number; verified: boolean };

/** Rows include the header. The source is never modified; diagnostics contain row numbers only. */
export async function migrateFeedbackRows(
  rows: readonly (readonly unknown[])[], target: FeedbackMigrationTarget, options: { apply?: boolean } = {},
): Promise<FeedbackMigrationResult> {
  if (!rows[0] || feedbackSheetHeaders.some((header, index) => rows[0][index] !== header) || rows[0].length !== 17) {
    throw new FeedbackMigrationError('Source row 1 must contain the 17 legacy feedback headers.');
  }
  const entries: { row: number; entry: FeedbackEntry; digest: string }[] = [];
  const seen = new Map<string, number>();
  for (let index = 1; index < rows.length; index++) {
    if (rows[index].every(cell => cell === '' || cell === null || cell === undefined)) continue;
    const row = index + 1, entry = parseSourceRow(rows[index], row);
    const previous = seen.get(entry.id);
    if (previous !== undefined) throw new FeedbackMigrationError(`Duplicate source identity at rows ${previous} and ${row}.`);
    seen.set(entry.id, row);
    entries.push({ row, entry, digest: feedbackDigest(entry) });
  }
  // Complete validation and target conflict checks before the first insertion.
  const pending: typeof entries = [];
  for (const item of entries) {
    let existing: FeedbackEntry | null;
    try { existing = await target.findFeedbackById(item.entry.id); }
    catch { throw new FeedbackMigrationError(`Target lookup failed at row ${item.row}.`); }
    if (existing && feedbackDigest(existing) !== item.digest) throw new FeedbackMigrationError(`Target conflict at row ${item.row}; nothing is overwritten.`);
    if (!existing) pending.push(item);
  }
  const result: FeedbackMigrationResult = {
    sourceCount: entries.length, imported: 0, skipped: entries.length - pending.length, pending: pending.length, verified: false,
  };
  if (!options.apply) return result;
  for (const item of pending) {
    try { await target.importFeedback(item.entry); result.imported++; }
    catch {
      // A lost insert acknowledgement or another migrator may have inserted it.
      let existing: FeedbackEntry | null = null;
      try { existing = await target.findFeedbackById(item.entry.id); } catch { /* report only a safe source row */ }
      if (!existing || feedbackDigest(existing) !== item.digest) throw new FeedbackMigrationError(`Import failed at row ${item.row}; rerun safely after investigation.`);
      result.skipped++;
    }
  }
  for (const item of entries) {
    let existing: FeedbackEntry | null;
    try { existing = await target.findFeedbackById(item.entry.id); }
    catch { throw new FeedbackMigrationError(`Verification failed at row ${item.row}.`); }
    if (!existing || feedbackDigest(existing) !== item.digest) throw new FeedbackMigrationError(`Verification failed at row ${item.row}.`);
  }
  result.pending = 0; result.verified = true;
  return result;
}

function parseSourceRow(cells: readonly unknown[], row: number): FeedbackEntry {
  const fail = () => { throw new FeedbackMigrationError(`Malformed source row ${row}.`); };
  if (cells.length > 17 || cells.some(cell => cell != null && typeof cell !== 'string' && typeof cell !== 'number')) return fail();
  const values = Array.from({ length: 17 }, (_, index) => cells[index] == null ? '' : String(cells[index]));
  if ([0, 1, 2, 3, 4, 5, 6].some(index => !values[index].trim())) return fail();
  if (!/^\d{4}-\d\d-\d\dT/.test(values[1]) || !Number.isFinite(Date.parse(values[1])) || new Date(values[1]).toISOString() !== values[1]) return fail();
  if (!z.email().safeParse(values[3]).success || !userRoleSchema.safeParse(values[4]).success) return fail();
  if (!feedbackRatingSchema.safeParse(values[6]).success) return fail();
  if (values[9] && !feedbackWorkStatusSchema.safeParse(values[9]).success) return fail();
  if (values[10] && !feedbackPrioritySchema.safeParse(values[10]).success) return fail();
  if (values[11] && (!/^[1-9]\d*$/.test(values[11]) || !Number.isSafeInteger(Number(values[11])))) return fail();
  if (values[12]) {
    try { const url = new URL(values[12]); if (url.protocol !== 'https:' || url.username || url.password) return fail(); }
    catch { return fail(); }
  }
  if (Boolean(values[11]) !== Boolean(values[12])) return fail();
  if (values[15] && !lessonFeedbackKindSchema.safeParse(values[15]).success) return fail();
  if (values[16] && !problemCategorySchema.safeParse(values[16]).success) return fail();
  if (values[15] && (!values[13] || !values[14])) return fail();
  if (values[15] === 'problem' ? !values[16] : Boolean(values[16])) return fail();
  return feedbackFromSheetRow(values);
}

// Sort all stored field names, omit undefined (Mongo serializes them as null), and include identity.
function feedbackDigest(entry: FeedbackEntry): string {
  const fields = Object.entries(entry).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}
