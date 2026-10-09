// Targeted data correction. Dry-run by default; --apply requires user approval.
// Reads shared data, but writes only the seven reviewed category cells (column S).
import { mkdir, writeFile } from 'node:fs/promises';
import { apiConfig, hasGoogleSheetsConfig } from '../api/dist/config.js';
import { createSheetsClient } from '../api/dist/googleSheets.js';

const plan = [
  { id: '57b5596a-84ad-4a88-8758-65064af370a4', title: 'ISTQB Foundation 4.0', category: 'Software Testing' },
  { id: 'e96e9ab7-d5aa-4c64-b065-104557be83af', title: 'ISTQB Test Automation Engineer', category: 'Automation Testing' },
  { id: '0a1aae45-aab2-4194-9e28-e85b1f9e891e', title: 'Automation with Playwright', category: 'Automation Testing' },
  { id: 'd5e08fde-ab8a-476d-85de-7234471e93b1', title: 'Fundamental Postman', category: 'API Testing' },
  { id: 'b0e7c6ef-e1a9-48cf-bf9a-a50cba1c4b3e', title: 'Advanced Playwright and AI', category: 'Automation Testing' },
  { id: '92c00a67-0d0b-4b8a-a50b-93d5006d44de', title: 'ISTQB Advanced Test Analyst', category: 'Software Testing' },
  { id: '467b3cb7-b81f-4e0c-8daa-f5a30602458d', title: 'Automation with Leapwork', category: 'Automation Testing' },
];

if (!hasGoogleSheetsConfig()) throw new Error('Sheets configuration is required.');
if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Supported option: --apply');
const apply = process.argv.includes('--apply');
const sheets = createSheetsClient();
const spreadsheetId = apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID;
const tab = apiConfig.GOOGLE_SHEETS_COURSES_RANGE.split('!')[0];
const read = async () => (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A:U` })).data.values ?? [];
const rows = await read();
if (rows[0]?.[18] !== 'category') throw new Error('Column S must be the category column.');
const changes = plan.map(item => {
  const matches = rows.map((row, index) => ({ row, index })).filter(({ row }) => row[0] === item.id);
  if (matches.length !== 1) throw new Error(`Expected one row for ${item.title}`);
  const { row, index } = matches[0];
  const before = row[18] ?? '';
  if (row[1] !== item.title || row[6] !== 'published') throw new Error(`Record changed: ${item.title}`);
  if (!['', 'Uncategorized', item.category].includes(before)) throw new Error(`Category already changed: ${item.title}`);
  return { ...item, row: index + 1, before, range: `${tab}!S${index + 1}`, needsChange: before !== item.category };
});

if (apply && changes.some(change => change.needsChange)) {
  const current = await read();
  if (JSON.stringify(current) !== JSON.stringify(rows)) throw new Error('Sheet changed during preflight; rerun the dry-run.');
  await mkdir('.playwright-mcp', { recursive: true });
  await writeFile(`.playwright-mcp/DEF-012-category-backup-${Date.now()}.json`, JSON.stringify(changes, null, 2), 'utf8');
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: {
    valueInputOption: 'RAW', data: changes.filter(change => change.needsChange)
      .map(change => ({ range: change.range, values: [[change.category]] })),
  } });
  const after = await read();
  for (const change of changes) {
    if (after[change.row - 1]?.[0] !== change.id || after[change.row - 1]?.[18] !== change.category) {
      throw new Error(`Verification failed: ${change.title}`);
    }
  }
  // Verify the correction did not replace any other field or worksheet header.
  const expected = structuredClone(rows);
  for (const change of changes) expected[change.row - 1][18] = change.category;
  if (JSON.stringify(after) !== JSON.stringify(expected)) throw new Error('Other data changed; inspect the saved backup.');
}
console.log(JSON.stringify({ mode: apply ? 'applied-and-verified' : 'dry-run', changes }, null, 2));
