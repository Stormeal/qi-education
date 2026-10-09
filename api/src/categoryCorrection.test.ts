import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rows: [] as string[][], reads: 0, writes: [] as { range: string; values: string[][] }[],
  changeOnSecondRead: false, backupFails: false }));
vi.mock('../../api/dist/config.js', () => ({ apiConfig: { GOOGLE_SHEETS_SPREADSHEET_ID: 'isolated-sheet',
  GOOGLE_SHEETS_COURSES_RANGE: 'Courses!A:R' }, hasGoogleSheetsConfig: () => true }));
vi.mock('../../api/dist/googleSheets.js', () => ({ createSheetsClient: () => ({ spreadsheets: { values: {
  get: async () => {
    state.reads++;
    if (state.changeOnSecondRead && state.reads === 2) state.rows[1][1] = 'Another edit';
    return { data: { values: structuredClone(state.rows) } };
  },
  batchUpdate: async ({ requestBody }: { requestBody: { data: { range: string; values: string[][] }[] } }) => {
    state.writes = structuredClone(requestBody.data);
    for (const change of requestBody.data) {
      const row = Number(/^Courses!S(\d+)$/.exec(change.range)?.[1]);
      if (!row) throw new Error('Unexpected write outside category cells');
      state.rows[row - 1][18] = change.values[0][0];
    }
    return { data: {} };
  },
} } }) }));
vi.mock('node:fs/promises', () => ({ mkdir: async () => {}, writeFile: async () => {
  if (state.backupFails) throw new Error('Backup failed');
} }));

const targets = [
  ['57b5596a-84ad-4a88-8758-65064af370a4', 'ISTQB Foundation 4.0'],
  ['e96e9ab7-d5aa-4c64-b065-104557be83af', 'ISTQB Test Automation Engineer'],
  ['0a1aae45-aab2-4194-9e28-e85b1f9e891e', 'Automation with Playwright'],
  ['d5e08fde-ab8a-476d-85de-7234471e93b1', 'Fundamental Postman'],
  ['b0e7c6ef-e1a9-48cf-bf9a-a50cba1c4b3e', 'Advanced Playwright and AI'],
  ['92c00a67-0d0b-4b8a-a50b-93d5006d44de', 'ISTQB Advanced Test Analyst'],
  ['467b3cb7-b81f-4e0c-8daa-f5a30602458d', 'Automation with Leapwork'],
];
const originalArgv = [...process.argv];
async function run(apply = false) {
  process.argv = [process.execPath, 'script', ...(apply ? ['--apply'] : [])];
  vi.resetModules();
  await import('../../scripts/correct-def-012-categories.mjs');
}

describe('reviewed category correction safety (DEF-012)', () => {
  beforeEach(() => {
    state.rows = [Array.from({ length: 21 }, (_, i) => i === 18 ? 'category' : `header-${i}`),
      ...targets.map(([id, title]) => Array.from({ length: 21 }, (_, i) =>
        i === 0 ? id : i === 1 ? title : i === 6 ? 'published' : i === 18 ? 'Uncategorized' : `preserved-${i}`)),
      ['unrelated-draft', 'Draft', '', '', '', '', 'draft'],
    ];
    state.reads = 0; state.writes = []; state.changeOnSecondRead = false; state.backupFails = false;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { process.argv = originalArgv; vi.restoreAllMocks(); });

  it('dry-run leaves every stored value unchanged', async () => {
    const before = structuredClone(state.rows);
    await run();
    expect(state.rows).toEqual(before); expect(state.writes).toEqual([]);
  });

  it('applies only the reviewed cells and reruns without any additional write', async () => {
    const before = structuredClone(state.rows);
    await run(true);
    expect(state.rows.slice(1, 8).map(row => row[18])).toEqual([
      'Software Testing', 'Automation Testing', 'Automation Testing', 'API Testing',
      'Automation Testing', 'Software Testing', 'Automation Testing',
    ]);
    expect(state.writes.map(change => change.range)).toEqual([
      'Courses!S2', 'Courses!S3', 'Courses!S4', 'Courses!S5', 'Courses!S6', 'Courses!S7', 'Courses!S8',
    ]);
    for (let row = 0; row < state.rows.length; row++) {
      expect(state.rows[row].filter((_, col) => col !== 18)).toEqual(before[row].filter((_, col) => col !== 18));
    }
    state.writes = [];
    await run(true); expect(state.writes).toEqual([]);
  });

  it.each(['category', 'title', 'status', 'duplicate', 'header', 'concurrent', 'backup'])('aborts before writes on %s conflicts', async kind => {
    if (kind === 'category') state.rows[1][18] = 'Security Testing';
    if (kind === 'title') state.rows[1][1] = 'Renamed';
    if (kind === 'status') state.rows[1][6] = 'archived';
    if (kind === 'duplicate') state.rows.push([...state.rows[1]]);
    if (kind === 'header') state.rows[0][18] = 'other';
    if (kind === 'concurrent') state.changeOnSecondRead = true;
    if (kind === 'backup') state.backupFails = true;
    await expect(run(true)).rejects.toThrow();
    expect(state.writes).toEqual([]);
  });
});
