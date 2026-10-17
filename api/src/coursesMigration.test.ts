import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Course, courseSheetHeaders } from './course.js';
import { runCoursesMigration, type CoursesMigrationPorts } from './coursesMigration.js';
import { createMigrationPorts, migrationMain, type MigrationMongoCollection, type MigrationSheetsClient } from './migrateCourses.js';

const cli = vi.hoisted(() => ({
  opened: 0, closed: 0, configFails: false, sheetsConfigured: true, mongoConfigured: true, closeFails: false,
  sheets: undefined as unknown as MigrationSheetsClient,
  collection: undefined as unknown as MigrationMongoCollection,
}));
vi.mock('./config.js', () => ({
  get apiConfig() {
    if (cli.configFails) throw new Error('private invalid config');
    return { mode: 'shared', GOOGLE_SHEETS_SPREADSHEET_ID: 'fake-sheet', GOOGLE_SHEETS_COURSES_RANGE: 'Courses!A:R', MONGODB_COURSE_CONTENT_COLLECTION: 'fake-content' };
  },
  hasGoogleSheetsConfig: () => cli.sheetsConfigured, hasMongoConfig: () => cli.mongoConfigured,
}));
vi.mock('./googleSheets.js', () => ({ createSheetsClient: () => cli.sheets }));
vi.mock('./mongo.js', () => ({
  getMongoDatabase: async () => {
    cli.opened++;
    return { collection: (name: string, options: unknown) => {
      expect(name).toBe('fake-content_courses');
      expect(options).toEqual({ writeConcern: { w: 'majority' } });
      return cli.collection;
    } };
  },
  closeMongoClient: async () => { cli.closed++; if (cli.closeFails) throw new Error('private cleanup failure'); },
}));
afterEach(() => { vi.unstubAllEnvs(); cli.configFails = false; cli.sheetsConfigured = true; cli.mongoConfigured = true; cli.closeFails = false; });

const headers = [...courseSheetHeaders];
const course: Course = {
  id: 'course-one', title: 'Private testing course', description: 'A private description', level: 'Beginner',
  teacher: 'Private teacher', careerGoals: ['Tester', 'Developer'], status: 'published', createdAt: '2026-09-01T00:00:00.000Z',
  requirements: ['First requirement', 'Second requirement'], audience: 'Private audience', priceDkk: 200,
  partOfCareer: 'Private career', whatYoullLearn: ['First outcome', 'Second outcome'], thumbnailAssetId: 'private-thumbnail',
  isPremium: true, isBestseller: false, rating: 4.2, ratingCount: 12, category: 'API Testing',
  languages: ['English', 'Danish'], ownerUserId: 'private-owner',
};
const row = ['course-one', 'Private testing course', 'A private description', 'Beginner', 'Private teacher',
  'Tester, Developer', 'published', '2026-09-01T00:00:00.000Z', 'First requirement\nSecond requirement', 'Private audience',
  '200', 'Private career', 'First outcome\nSecond outcome', 'private-thumbnail', 'TRUE', 'FALSE', '4.2', '12',
  'API Testing', 'English, Danish', 'private-owner'];
const frozen = { USE_SHARED_SERVICES: '1', COURSE_STORE: 'google-sheets', COURSE_STORE_READ_ONLY: '1' };

function fixture(sheetRows: unknown[][] = [headers, row], mongoCourses: Course[] = []) {
  const sheet = structuredClone(sheetRows);
  const mongo = new Map(mongoCourses.map(value => [value.id, structuredClone(value)]));
  const output: string[] = [], writes: string[] = [];
  let opened = 0;
  const ports: CoursesMigrationPorts = {
    readSheet: async () => structuredClone(sheet), readMongo: async () => structuredClone([...mongo.values()]),
    ensureMongoIndexes: async () => { writes.push('indexes'); },
    upsertMongo: async value => {
      if (!writes.includes('indexes')) throw new Error('Copy before index');
      const existing = mongo.get(value.id);
      const state = !existing ? 'inserted' : JSON.stringify(existing) === JSON.stringify(value) ? 'unchanged' : 'updated';
      mongo.set(value.id, structuredClone(value)); writes.push('mongo'); return state;
    },
    updateSheetRow: async (number, values) => {
      sheet[number - 1] = [...values, ...sheet[number - 1].slice(21)]; writes.push('update');
    },
    appendSheetRows: async values => { sheet.push(...structuredClone(values)); writes.push('append'); },
  };
  return { sheet, mongo, output, writes, ports, get opened() { return opened; },
    run: (args: string[], settings = frozen) => runCoursesMigration(args, settings,
      async () => { opened++; return ports; }, line => output.push(line)),
  };
}

describe('US-P015 course migration', () => {
  it('AC06 copies all 21 fields twice idempotently without deleting destination-only courses or touching the source', async () => {
    const extra = { ...course, id: 'extra' };
    const f = fixture(undefined, [extra]);
    expect(await f.run(['--apply'])).toBe(0);
    expect(f.mongo.get(course.id)).toEqual(course);
    expect(f.mongo.get(extra.id)).toEqual(extra);
    expect(f.writes[0]).toBe('indexes');
    expect(f.output).toContain('inserted: 1; updated: 0; unchanged: 0');
    expect(await f.run(['--apply'])).toBe(0);
    expect(f.output).toContain('inserted: 0; updated: 0; unchanged: 1');
    expect(f.sheet).toEqual([headers, row]);
  });

  it.each([[], ['--apply', '--verify'], ['--apply', '--apply'], ['--private-unknown']])('refuses ambiguous flags before opening providers: %j', async (...args) => {
    const f = fixture();
    expect(await f.run(args as string[])).toBe(1);
    expect(f.opened).toBe(0);
    expect(f.output.join('\n')).not.toContain('private-unknown');
  });
  it.each(['--dry-run', '--apply', '--verify', '--restore-sheet'])('AC07 requires explicit shared services for %s', async mode => {
    const f = fixture();
    expect(await f.run([mode], { ...frozen, USE_SHARED_SERVICES: '' })).toBe(1);
    expect(f.opened).toBe(0);
  });
  it.each([
    ['--apply', 'mongodb', '1'], ['--apply', 'google-sheets', '0'],
    ['--restore-sheet', 'google-sheets', '1'], ['--restore-sheet', 'mongodb', '0'],
    ['--dry-run', 'invalid', '1'], ['--verify', 'mongodb', 'invalid'],
  ])('AC07 refuses unsafe settings %s %s %s', async (mode, store, readOnly) => {
    const f = fixture();
    expect(await f.run([mode], { ...frozen, COURSE_STORE: store, COURSE_STORE_READ_ONLY: readOnly })).toBe(1);
    expect(f.opened).toBe(0); expect(f.writes).toEqual([]);
    expect(f.output[0]).toMatch(/^Refused:/);
  });
  it('dry run succeeds without opening MongoDB or writing data and accepts legacy optional defaults', async () => {
    const legacy = [...row.slice(0, 8)]; legacy[6] = '';
    const f = fixture([headers, legacy]);
    f.ports.readMongo = async () => { throw new Error('Unexpected MongoDB access'); };
    expect(await f.run(['--dry-run'], { ...frozen, COURSE_STORE_READ_ONLY: '0' })).toBe(0);
    expect(f.output).toContain('Sheet rows: 1; valid: 1; invalid: 0; duplicate ids: 0');
    expect(f.writes).toEqual([]);
    expect(await fixture([headers, legacy]).run(['--apply'])).toBe(0);
  });
  it.each(['--dry-run', '--apply'])('AC07 %s rejects missing and duplicate IDs with row diagnostics and no values', async mode => {
    const missing = [...row]; missing[0] = '';
    const f = fixture([headers, row, [...row], missing]);
    expect(await f.run([mode])).toBe(1);
    expect(f.output).toContain('Sheet rows: 3; valid: 0; invalid: 3; duplicate ids: 1');
    expect(f.output).toContain('Row 2: duplicate id (rows 2, 3).');
    expect(f.output).toContain('Row 4: invalid or missing id.');
    expect(f.output.join('\n')).not.toContain(course.title); expect(f.writes).toEqual([]);
  });
  it.each([
    { column: 6, value: 'private-invalid-status', field: 'status' },
    { column: 7, value: 'private-invalid-date', field: 'createdAt' },
    { column: 10, value: '200private', field: 'priceDkk' },
    { column: 10, value: '1.5', field: 'priceDkk' },
    { column: 14, value: 'private-flag', field: 'isPremium' },
    { column: 16, value: '6', field: 'rating' },
    { column: 17, value: '12private', field: 'ratingCount' },
    { column: 18, value: 'private-category', field: 'category' },
    { column: 19, value: 'English, private-language', field: 'languages' },
    { column: 8, value: 42, field: 'requirements' },
  ])('refuses malformed sheet $field before writing without silently defaulting it', async ({ column, value, field }) => {
    const malformed: unknown[] = [...row]; malformed[column] = value;
    const f = fixture([headers, malformed]);
    expect(await f.run(['--apply'])).toBe(1);
    expect(f.output).toContain(`Row 2: invalid or missing ${field}.`);
    expect(f.writes).toEqual([]); expect(f.output.join('\n')).not.toContain('private-invalid');
  });
  it('accepts Sheets unformatted numeric and boolean cells without changing their course meaning', async () => {
    const values: unknown[] = [...row]; values[10] = 200; values[14] = true; values[15] = false; values[16] = 4.2; values[17] = 12;
    const f = fixture([headers, values]);
    expect(await f.run(['--apply'])).toBe(0); expect(f.mongo.get(course.id)).toEqual(course);
  });
  it.each(courseSheetHeaders.filter(field => field !== 'id'))('AC08 compares %s without displaying its value', async field => {
    const changed = { ...course, [field]: undefined } as unknown as Course;
    const f = fixture(undefined, [changed]);
    expect(await f.run(['--verify'])).toBe(1);
    expect(f.output).toContain(`Difference: id="course-one"; field=${field}`);
    expect(f.output.join('\n')).not.toContain('Verified:');
    expect(f.output.join('\n')).not.toContain(course.description); expect(f.writes).toEqual([]);
  });
  it.each([
    ['title', 'Changed private title'], ['description', 'Changed private description'], ['level', 'Advanced'],
    ['teacher', 'Changed private teacher'], ['careerGoals', ['Administrator']], ['status', 'archived'],
    ['createdAt', '2026-10-17T00:00:00.000Z'], ['requirements', []], ['audience', 'Changed private audience'],
    ['priceDkk', null], ['partOfCareer', 'Changed private career'], ['whatYoullLearn', []],
    ['thumbnailAssetId', 'Changed private thumbnail'], ['isPremium', false], ['isBestseller', true],
    ['rating', 4.3], ['ratingCount', 13], ['category', 'Security Testing'], ['languages', ['Danish']],
    ['ownerUserId', 'Changed private owner'],
  ])('AC08 compares valid changed %s rather than merely validating each store', async (field, value) => {
    const f = fixture(undefined, [{ ...course, [field as string]: value } as Course]);
    expect(await f.run(['--verify'])).toBe(1);
    expect(f.output).toContain(`Difference: id="course-one"; field=${field}`);
    expect(f.output.join('\n')).not.toContain('Changed private');
    expect(f.output.join('\n')).not.toContain('Verified:'); expect(f.writes).toEqual([]);
  });
  it('AC08 reports malformed fields and missing courses in both directions without false success', async () => {
    const bad = [...row]; bad[6] = 'private-invalid-status';
    const second = [...row]; second[0] = 'sheet-only';
    const f = fixture([headers, bad, second], [{ ...course, title: 'private-changed' }, { ...course, id: 'mongo-only' }]);
    expect(await f.run(['--verify'])).toBe(1);
    expect(f.output).toContain('Difference: id="course-one"; field=status');
    expect(f.output).toContain('Difference: id="course-one"; field=title');
    expect(f.output).toContain('Difference: id="sheet-only"; field=missingInMongoDB');
    expect(f.output).toContain('Difference: id="mongo-only"; field=missingInSheet');
    expect(f.output.join('\n')).not.toContain('private-invalid-status');
    expect(f.output.join('\n')).not.toContain('private-changed');
  });
  it.each(['missing', 'duplicate', 'headers'])('AC08 never verifies malformed %s rows successfully', async kind => {
    const bad = [...row]; if (kind === 'missing') bad[0] = '';
    const f = fixture([kind === 'headers' ? ['wrong', ...headers.slice(1)] : headers, bad, ...(kind === 'duplicate' ? [[...bad]] : [])], [course]);
    expect(await f.run(['--verify'])).toBe(1); expect(f.output.join('\n')).not.toContain('Verified:');
  });
  it('preserves nonempty ID strings exactly, including surrounding whitespace', async () => {
    const values = [...row]; values[0] = ' course-one ';
    const f = fixture([headers, values]);
    expect(await f.run(['--apply'])).toBe(0);
    expect(f.mongo.get(' course-one ')).toEqual({ ...course, id: ' course-one ' });
    expect(await f.run(['--verify'])).toBe(0);
  });
  it.each(['--apply', '--restore-sheet'])('refuses wrong headers in %s before any writes', async mode => {
    const f = fixture([['wrong', ...headers.slice(1)], row], [course]);
    expect(await f.run([mode], { ...frozen, COURSE_STORE: mode === '--apply' ? 'google-sheets' : 'mongodb' })).toBe(1);
    expect(f.output).toContain('Row 1: expected Courses headers in columns A:U.'); expect(f.writes).toEqual([]);
  });
  it('reports duplicate and invalid MongoDB IDs without hiding other course differences', async () => {
    const f = fixture();
    f.ports.readMongo = async () => [{ ...course, title: 'private-change' }, { ...course, id: 'duplicate' }, { ...course, id: 'duplicate' },
      { ...course, id: 123 as unknown as string }];
    expect(await f.run(['--verify'])).toBe(1);
    expect(f.output).toContain('Difference: id="course-one"; field=title');
    expect(f.output).toContain('Difference: id="duplicate"; field=id');
    expect(f.output).toContain('Difference: id="(invalid MongoDB id)"; field=id');
    expect(f.output.join('\n')).not.toContain('Verified:');
  });
  it.each(['--apply', '--restore-sheet'])('rejects malformed destination/source MongoDB fields before %s writes', async mode => {
    const f = fixture(undefined, [{ ...course, requirements: 'private-malformed-array' as unknown as string[] }]);
    expect(await f.run([mode], { ...frozen, COURSE_STORE: mode === '--apply' ? 'google-sheets' : 'mongodb' })).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.output.join('\n')).toContain('requirements');
    expect(f.output.join('\n')).not.toContain('private-malformed-array');
  });
  it('does not copy any data when catalog index creation fails, and suppresses provider detail', async () => {
    const f = fixture();
    f.ports.ensureMongoIndexes = async () => { throw new Error('private index credentials'); };
    expect(await f.run(['--apply'])).toBe(1);
    expect(f.mongo.size).toBe(0); expect(f.sheet).toEqual([headers, row]);
    expect(f.output.join('\n')).not.toContain('private index credentials');
  });
  it('AC09 restores changes in place preserving extra cells and existing order, appends by createdAt and id, then verifies', async () => {
    const other = { ...course, id: 'other' }, newest = { ...course, id: 'newest', createdAt: '2026-10-17T00:00:00.000Z' };
    const a = { ...course, id: 'new-a' }, b = { ...course, id: 'new-b' }, changed = { ...course, ownerUserId: 'changed-owner', priceDkk: null };
    const otherRow = [...row]; otherRow[0] = 'other';
    const f = fixture([[...headers, 'notes'], [...row, 'keep-A'], [...otherRow, 'keep-B']], [newest, b, other, changed, a]);
    const settings = { ...frozen, COURSE_STORE: 'mongodb' };
    expect(await f.run(['--restore-sheet'], settings)).toBe(0);
    expect(f.sheet.map(value => value[0])).toEqual(['id', 'course-one', 'other', 'new-a', 'new-b', 'newest']);
    expect(f.sheet[1][10]).toBe(''); expect(f.sheet[1][20]).toBe('changed-owner');
    expect(f.sheet[1][21]).toBe('keep-A'); expect(f.sheet[2][21]).toBe('keep-B');
    expect(await f.run(['--verify'], settings)).toBe(0);
    expect(f.output).toContain('Verified: 5 courses identical');
    expect(f.writes).not.toContain('mongo');
  });
  it.each([
    { field: 'rating', value: 4.25 }, { field: 'careerGoals', value: ['Would, split'] },
    { field: 'requirements', value: ['Would\nsplit'] }, { field: 'whatYoullLearn', value: [' leading space'] },
    { field: 'languages', value: ['English', 'English'] }, { field: 'ownerUserId', value: ' padded ' },
  ])('AC09 restores formerly lossy MongoDB $field and verifies/reapplies it exactly', async ({ field, value }) => {
    const f = fixture(undefined, [{ ...course, [field]: value } as Course]);
    expect(await f.run(['--restore-sheet'], { ...frozen, COURSE_STORE: 'mongodb' })).toBe(0);
    expect(await f.run(['--verify'])).toBe(0);
    f.mongo.clear();
    expect(await f.run(['--apply'])).toBe(0);
    expect(f.mongo.get(course.id)).toEqual({ ...course, [field]: value });
  });
  it('does not delete sheet-only courses, leaving verify to block a switch', async () => {
    const f = fixture();
    expect(await f.run(['--restore-sheet'], { ...frozen, COURSE_STORE: 'mongodb' })).toBe(0);
    expect(f.sheet).toEqual([headers, row]); expect(await f.run(['--verify'])).toBe(1);
  });
  it.each(['--dry-run', '--apply', '--verify', '--restore-sheet'])('rejects malformed restored escapes in %s without writes or values', async mode => {
    const bad = [...row]; bad[16] = 'qi-course-cell:v1:private-invalid-payload';
    const f = fixture([headers, bad], [course]);
    expect(await f.run([mode], { ...frozen, COURSE_STORE: mode === '--restore-sheet' ? 'mongodb' : 'google-sheets' })).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.output.join('\n')).toContain('rating');
    expect(f.output.join('\n')).not.toContain('private-invalid-payload');
    expect(f.output.join('\n')).not.toContain('Verified:');
  });
  it.each(['mongo', 'update', 'append'])('recovers lost %s acknowledgement on rerun without duplicate IDs or source loss', async stage => {
    const changed = { ...course, title: 'Post-cutover title' }, added = { ...course, id: 'added' };
    const f = fixture(undefined, stage === 'mongo' ? [] : [changed, added]);
    let failed = false;
    if (stage === 'mongo') {
      const original = f.ports.upsertMongo;
      f.ports.upsertMongo = async value => { const result = await original(value); if (!failed) { failed = true; throw new Error('private failure'); } return result; };
    } else if (stage === 'update') {
      const original = f.ports.updateSheetRow;
      f.ports.updateSheetRow = async (...args) => { await original(...args); if (!failed) { failed = true; throw new Error('private failure'); } };
    } else {
      const original = f.ports.appendSheetRows;
      f.ports.appendSheetRows = async values => { await original(values); if (!failed) { failed = true; throw new Error('private failure'); } };
    }
    const mode = stage === 'mongo' ? '--apply' : '--restore-sheet';
    const settings = { ...frozen, COURSE_STORE: stage === 'mongo' ? 'google-sheets' : 'mongodb' };
    expect(await f.run([mode], settings)).toBe(1);
    if (stage === 'mongo') expect(f.sheet).toEqual([headers, row]);
    else expect([...f.mongo.values()]).toEqual([changed, added]);
    expect(await f.run([mode], settings)).toBe(0);
    expect(await f.run(['--verify'], settings)).toBe(0);
    expect(f.output.join('\n')).not.toContain('private failure');
  });
});

describe('course migration provider adapters and command (fakes only)', () => {
  it('copies raw MongoDB documents with majority upserts and creates the catalog index first', async () => {
    const documents = new Map<string, Record<string, unknown>>();
    const indexes: unknown[] = [];
    const collection: MigrationMongoCollection = {
      createIndex: async keys => { indexes.push(keys); },
      find: () => ({ toArray: async () => [...documents.values()] as never }),
      updateOne: async (filter, update, options) => {
        expect(options).toEqual({ upsert: true, writeConcern: { w: 'majority' } });
        expect(filter).toEqual({ _id: course.id }); expect(update.$set).not.toHaveProperty('id'); expect(update.$set).not.toHaveProperty('_id');
        const existing = documents.get(filter._id), next = { _id: filter._id, ...update.$set };
        documents.set(filter._id, next);
        return { upsertedCount: existing ? 0 : 1, modifiedCount: existing && JSON.stringify(existing) !== JSON.stringify(next) ? 1 : 0 };
      },
    };
    const ports = createMigrationPorts({ spreadsheetId: 'fake-sheet', range: 'Courses!A:R' }, {} as MigrationSheetsClient, collection);
    await ports.ensureMongoIndexes(); expect(indexes).toEqual([{ createdAt: 1, _id: 1 }]);
    expect(await ports.upsertMongo(course)).toBe('inserted'); expect(await ports.upsertMongo(course)).toBe('unchanged');
    expect(await ports.upsertMongo({ ...course, title: 'Changed' })).toBe('updated');
    expect(await ports.readMongo()).toEqual([{ ...course, title: 'Changed' }]);
  });
  it('keeps raw malformed Mongo fields visible to validation and treats _id as authoritative', async () => {
    const collection = { find: () => ({ toArray: async () => [{ ...course, _id: 'actual-id', id: 'stray-id', status: 'private-invalid-status' }] }) } as unknown as MigrationMongoCollection;
    const ports = createMigrationPorts({ spreadsheetId: 'fake-sheet', range: 'Courses!A:R' }, {} as MigrationSheetsClient, collection);
    const raw = await ports.readMongo();
    expect(raw[0].id).toBe('actual-id'); expect(raw[0].status).toBe('private-invalid-status');
    const f = fixture(); f.ports.readMongo = async () => raw;
    expect(await f.run(['--verify'])).toBe(1);
    expect(f.output).toContain('Difference: id="actual-id"; field=status');
    expect(f.output.join('\n')).not.toContain('private-invalid-status');
  });
  it.each(["'Course Details'!A1:R99", "'Course Details'!A:U", "'Course Details'!$A$1:$U$99"])(
    'reads the whole A:U table from %s and updates only A:U RAW cells', async range => {
      const calls: unknown[] = [];
      const sheets: MigrationSheetsClient = { spreadsheets: { values: {
        get: async request => { calls.push(request); return { data: { values: [headers, row] } }; },
        update: async request => { calls.push(request); }, append: async request => { calls.push(request); },
      } } };
      const ports = createMigrationPorts({ spreadsheetId: 'fake-sheet', range }, sheets, {} as MigrationMongoCollection);
      expect(await ports.readSheet()).toEqual([headers, row]); await ports.updateSheetRow(4, row); await ports.appendSheetRows([row]);
      expect(calls).toEqual([
        { spreadsheetId: 'fake-sheet', range: "'Course Details'!A:U", valueRenderOption: 'UNFORMATTED_VALUE' },
        { spreadsheetId: 'fake-sheet', range: "'Course Details'!A4:U4", valueInputOption: 'RAW', requestBody: { values: [row] } },
        { spreadsheetId: 'fake-sheet', range: "'Course Details'!A:U", valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [row] } },
      ]);
    });
  it.each(['Courses!B:V', 'Courses!A2:U99', 'Courses!A:Q'])('rejects unsafe source range %s before a provider request', range => {
    expect(() => createMigrationPorts({ spreadsheetId: 'fake-sheet', range }, {} as MigrationSheetsClient, {} as MigrationMongoCollection)).toThrow();
  });
  it('refuses unknown command flags safely under NODE_ENV=test', async () => {
    const output: string[] = []; expect(process.env.NODE_ENV).toBe('test');
    expect(await migrationMain(['--private-flag'], line => output.push(line))).toBe(1);
    expect(output[0]).toMatch(/^Refused:/); expect(output.join('\n')).not.toContain('private-flag');
  });
  it('dry-run entrypoint uses fake Sheets without opening MongoDB', async () => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('USE_SHARED_SERVICES', '1'); vi.stubEnv('COURSE_STORE', 'google-sheets'); vi.stubEnv('COURSE_STORE_READ_ONLY', '0');
    cli.opened = 0; cli.closed = 0;
    cli.sheets = { spreadsheets: { values: { get: async () => ({ data: { values: [headers, row] } }) } } } as MigrationSheetsClient;
    const output: string[] = [];
    expect(await migrationMain(['--dry-run'], line => output.push(line))).toBe(0);
    expect(output).toContain('Sheet rows: 1; valid: 1; invalid: 0; duplicate ids: 0'); expect(cli.opened).toBe(0); expect(cli.closed).toBe(0);
  });
  it('closes MongoDB on a failed apply and sanitizes provider credentials', async () => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('USE_SHARED_SERVICES', '1'); vi.stubEnv('COURSE_STORE', 'google-sheets'); vi.stubEnv('COURSE_STORE_READ_ONLY', '1');
    cli.opened = 0; cli.closed = 0;
    cli.sheets = { spreadsheets: { values: { get: async () => ({ data: { values: [headers, row] } }) } } } as MigrationSheetsClient;
    cli.collection = { find: () => ({ toArray: async () => [] }), createIndex: async () => undefined,
      updateOne: async () => { throw new Error('private MongoDB credentials'); } };
    const output: string[] = [];
    expect(await migrationMain(['--apply'], line => output.push(line))).toBe(1);
    expect(cli.opened).toBe(1); expect(cli.closed).toBe(1); expect(output.join('\n')).not.toContain('private MongoDB');
  });
  it('uses the exact sanitized configuration failure message', async () => {
    cli.configFails = true;
    const output: string[] = [];
    expect(await migrationMain(['--dry-run'], line => output.push(line))).toBe(1);
    expect(output).toEqual(['Migration failed: configuration could not be loaded. Check the allowed settings and required credentials.']);
  });
  it.each(['sheets', 'mongo'])('reports missing %s credentials as the specified configuration failure', async provider => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('USE_SHARED_SERVICES', '1'); vi.stubEnv('COURSE_STORE', 'google-sheets'); vi.stubEnv('COURSE_STORE_READ_ONLY', '1');
    cli.sheetsConfigured = provider !== 'sheets'; cli.mongoConfigured = provider !== 'mongo';
    cli.sheets = { spreadsheets: { values: { get: async () => ({ data: { values: [headers, row] } }) } } } as MigrationSheetsClient;
    const output: string[] = [];
    expect(await migrationMain(['--apply'], line => output.push(line))).toBe(1);
    expect(output).toContain('Migration failed: configuration could not be loaded. Check the allowed settings and required credentials.');
  });
  it('returns failure and sanitizes a cleanup error after otherwise successful apply', async () => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('USE_SHARED_SERVICES', '1'); vi.stubEnv('COURSE_STORE', 'google-sheets'); vi.stubEnv('COURSE_STORE_READ_ONLY', '1');
    cli.closeFails = true;
    cli.sheets = { spreadsheets: { values: { get: async () => ({ data: { values: [headers, row] } }) } } } as MigrationSheetsClient;
    cli.collection = { find: () => ({ toArray: async () => [] }), createIndex: async () => undefined,
      updateOne: async () => ({ upsertedCount: 1, modifiedCount: 0 }) };
    const output: string[] = [];
    expect(await migrationMain(['--apply'], line => output.push(line))).toBe(1);
    expect(output).toContain('Migration failed: database connection cleanup failed.');
    expect(output.join('\n')).not.toContain('private cleanup');
  });
});
