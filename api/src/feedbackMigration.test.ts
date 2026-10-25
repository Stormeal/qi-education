import { describe, expect, it } from 'vitest';
import { feedbackSheetHeaders, type FeedbackEntry } from './feedback.js';
import { migrateFeedbackRows, type FeedbackMigrationTarget } from './feedbackMigration.js';
import { runFeedbackMigrationCli } from './feedbackMigrationCli.js';

const row = ['stable-id', '2026-10-24T10:00:00.000Z', 'user', 'private@example.test', 'student', 'Lesson', 'needs-work', '', 'browser', 'work', 'high', '42', 'https://github.com/org/repo/issues/42', 'course', 'lesson', 'problem', 'video'];
function target() {
  const records = new Map<string, FeedbackEntry>(); let writes = 0;
  const store: FeedbackMigrationTarget = {
    async findFeedbackById(id) { return structuredClone(records.get(id) ?? null); },
    async importFeedback(entry) { writes++; records.set(entry.id, structuredClone(entry)); },
  };
  return { records, store, writes: () => writes };
}

describe('US-A006 AC06/AC08 feedback migration', () => {
  it('defaults to a dry run with no writes', async () => {
    const db = target();
    expect(await migrateFeedbackRows([[...feedbackSheetHeaders], row], db.store)).toMatchObject({ sourceCount: 1, imported: 0, pending: 1, verified: false });
    expect(db.writes()).toBe(0);
  });
  it('preserves stable IDs, empty legacy messages, lesson fields and triage, then skips identical reruns', async () => {
    const db = target(), rows = [[...feedbackSheetHeaders], row];
    expect(await migrateFeedbackRows(rows, db.store, { apply: true })).toMatchObject({ imported: 1, verified: true });
    expect(db.records.get('stable-id')).toMatchObject({ id: 'stable-id', message: '', courseId: 'course', componentId: 'lesson', lessonFeedbackKind: 'problem', problemCategory: 'video', githubIssueNumber: 42, priority: 'high' });
    expect(await migrateFeedbackRows(rows, db.store, { apply: true })).toMatchObject({ imported: 0, skipped: 1, verified: true });
    expect(db.writes()).toBe(1);
  });
  it('rejects every source duplicate before any target writes without leaking content', async () => {
    const db = target();
    const result = migrateFeedbackRows([[...feedbackSheetHeaders], row, row], db.store, { apply: true });
    await expect(result).rejects.toThrow(/rows 2 and 3/);
    await expect(result).rejects.not.toThrow('private@example.test');
    expect(db.writes()).toBe(0);
  });
  it.each([
    [1, 'bad-date'], [1, '2026-02-30T10:00:00.000Z'], [3, 'bad-email'], [4, 'bad-role'],
    [6, 'bad-rating'], [9, 'bad-status'], [10, 'bad-priority'],
    [11, '42garbage'], [12, 'javascript:bad'], [15, 'bad-kind'], [16, 'bad-category'],
  ])('rejects malformed source column %s instead of legacy parser fallback', async (column, value) => {
    const db = target(), broken = [...row]; broken[0] = 'second'; broken[column] = value;
    await expect(migrateFeedbackRows([[...feedbackSheetHeaders], row, broken], db.store, { apply: true })).rejects.toThrow(/row 3/);
    expect(db.writes()).toBe(0);
  });
  it('preflights target conflicts before inserting any otherwise missing records', async () => {
    const db = target();
    await migrateFeedbackRows([[...feedbackSheetHeaders], row], db.store, { apply: true });
    db.records.get('stable-id')!.message = 'changed after import';
    const next = [...row]; next[0] = 'second';
    await expect(migrateFeedbackRows([[...feedbackSheetHeaders], next, row], db.store, { apply: true })).rejects.toThrow(/target conflict at row 3/i);
    expect(db.writes()).toBe(1);
  });
  it('resumes after an interrupted insert and verifies document digests rather than counts', async () => {
    const db = target(), next = [...row]; next[0] = 'second';
    let fail = true;
    const interrupted: FeedbackMigrationTarget = { ...db.store, async importFeedback(entry) {
      if (entry.id === 'second' && fail) throw new Error('interrupted');
      await db.store.importFeedback(entry);
    } };
    const rows = [[...feedbackSheetHeaders], row, next];
    await expect(migrateFeedbackRows(rows, interrupted, { apply: true })).rejects.toThrow(/row 3/);
    fail = false;
    expect(await migrateFeedbackRows(rows, interrupted, { apply: true })).toMatchObject({ skipped: 1, imported: 1, verified: true });
    const corrupt: FeedbackMigrationTarget = { ...db.store, async importFeedback(entry) { await db.store.importFeedback({ ...entry, message: 'corrupt' }); } };
    const third = [...row]; third[0] = 'third';
    await expect(migrateFeedbackRows([[...feedbackSheetHeaders], third], corrupt, { apply: true })).rejects.toThrow(/verification failed at row 2/i);
  });
});

describe('US-A006 AC08/AC09 migration CLI guard', () => {
  it('refuses services unless explicitly shared and refuses apply without the writer freeze', async () => {
    const calls: unknown[] = [];
    const run = (args: string[], env: Record<string, string | undefined>) => runFeedbackMigrationCli(args, env, {
      async migrate(apply) { calls.push(apply); return { sourceCount: 0, imported: 0, skipped: 0, pending: 0, verified: apply }; },
      report() {},
    });
    await expect(run([], {})).rejects.toThrow(/USE_SHARED_SERVICES=1/);
    await expect(run(['--apply'], { USE_SHARED_SERVICES: '1' })).rejects.toThrow(/FEEDBACK_STORE_READ_ONLY=1/);
    await expect(run(['--unknown'], { USE_SHARED_SERVICES: '1' })).rejects.toThrow(/Unknown/);
    expect(calls).toEqual([]);
    await run([], { USE_SHARED_SERVICES: '1' });
    await run(['--apply'], { USE_SHARED_SERVICES: '1', FEEDBACK_STORE_READ_ONLY: '1' });
    expect(calls).toEqual([false, true]);
  });
});
