import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AuthUser } from './auth.js';
import { runUsersMigration, type UsersMigrationPorts } from './usersMigration.js';
import { createMigrationPorts, migrationMain, type MigrationMongoCollection, type MigrationSheetsClient } from './migrateUsers.js';

const cli = vi.hoisted(() => ({
  opened: 0, closed: 0,
  sheets: undefined as unknown as MigrationSheetsClient,
  collection: undefined as unknown as MigrationMongoCollection,
}));
vi.mock('./config.js', () => ({
  apiConfig: { mode: 'shared', GOOGLE_SHEETS_SPREADSHEET_ID: 'fake-sheet', GOOGLE_SHEETS_USERS_RANGE: 'Users!A:H', MONGODB_COURSE_CONTENT_COLLECTION: 'fake-content' },
  hasGoogleSheetsConfig: () => true, hasMongoConfig: () => true,
}));
vi.mock('./googleSheets.js', () => ({ createSheetsClient: () => cli.sheets }));
vi.mock('./mongo.js', () => ({
  getMongoDatabase: async () => {
    cli.opened++;
    return { collection: (name: string, options: unknown) => {
      expect(name).toBe('fake-content_users');
      expect(options).toEqual({ writeConcern: { w: 'majority' } });
      return cli.collection;
    } };
  },
  closeMongoClient: async () => { cli.closed++; },
}));
afterEach(() => vi.unstubAllEnvs());

const headers = ['id', 'email', 'displayName', 'passwordHash', 'role', 'status', 'createdAt', 'enrolledCourseIds'];
const ada: AuthUser = {
  id: 'user-ada', email: 'ada@example.test', displayName: 'Ada Lovelace',
  passwordHash: 'scrypt$private-salt$private-hash', role: 'teacher', status: 'disabled',
  createdAt: '2026-09-01T12:00:00.000Z', enrolledCourseIds: ['course-a', 'course-b'],
};
const row = [ada.id, ' Ada@Example.test ', ada.displayName, ada.passwordHash,
  ada.role, ada.status, ada.createdAt, 'course-a, course-b'];
const frozen = { USE_SHARED_SERVICES: '1', USER_STORE: 'google-sheets', USER_STORE_READ_ONLY: '1' };

function fixture(sheetRows: unknown[][] = [headers, row], mongoUsers: AuthUser[] = []) {
  const sheet = structuredClone(sheetRows);
  const mongo = new Map(mongoUsers.map(user => [user.id, structuredClone(user)]));
  const output: string[] = [];
  const writes: string[] = [];
  let opened = 0;
  const ports: UsersMigrationPorts = {
    readSheet: async () => structuredClone(sheet),
    readMongo: async () => structuredClone([...mongo.values()]),
    ensureMongoIndexes: async () => { writes.push('indexes'); },
    upsertMongo: async user => {
      if (!writes.includes('indexes')) throw new Error('Indexes required before copying');
      const existing = mongo.get(user.id);
      const state = !existing ? 'inserted' : JSON.stringify(existing) === JSON.stringify(user) ? 'unchanged' : 'updated';
      mongo.set(user.id, structuredClone(user));
      writes.push('mongo');
      return state;
    },
    updateSheetRow: async (number, values) => {
      sheet[number - 1] = [...values, ...sheet[number - 1].slice(8)];
      writes.push(`sheet:${number}`);
    },
    appendSheetRows: async rows => { sheet.push(...structuredClone(rows)); writes.push('append'); },
  };
  return {
    sheet, mongo, output, writes, ports,
    get opened() { return opened; },
    run: (args: string[], settings = frozen) => runUsersMigration(args, settings,
      async () => { opened++; return ports; }, line => output.push(line)),
  };
}

describe('US-P014 account migration', () => {
  it('AC05 copies every field unchanged, never deletes destination-only accounts, and a second apply is unchanged', async () => {
    const extra = { ...ada, id: 'extra', email: 'extra@example.test' };
    const f = fixture(undefined, [extra]);
    expect(await f.run(['--apply'])).toBe(0);
    expect(f.mongo.get(ada.id)).toEqual(ada);
    expect(f.mongo.get(extra.id)).toEqual(extra);
    expect(f.output).toContain('Sheet rows: 1; valid: 1; invalid: 0; duplicate emails: 0');
    expect(f.output.indexOf('Sheet rows: 1; valid: 1; invalid: 0; duplicate emails: 0'))
      .toBeGreaterThan(f.output.indexOf('Created or confirmed MongoDB email and enrollment indexes.'));
    expect(f.output).toContain('inserted: 1; updated: 0; unchanged: 0');
    expect(await f.run(['--apply'])).toBe(0);
    expect(f.output).toContain('inserted: 0; updated: 0; unchanged: 1');
    expect(f.sheet).toEqual([headers, row]);
    expect(f.output.join('\n')).not.toContain(ada.passwordHash);
  });

  it.each(['--dry-run', '--apply'])('AC06 %s validates the entire source before any writes and identifies duplicate rows without field values', async mode => {
    const missingId = [...row]; missingId[0] = '';
    const badRole = [...row]; badRole[0] = 'bad-role'; badRole[1] = 'role@example.test'; badRole[4] = 'super-secret-invalid-role';
    const f = fixture([headers, row, [...row.slice(0, 1), 'ADA@example.test', ...row.slice(2)], missingId, badRole]);
    expect(await f.run([mode])).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.mongo.size).toBe(0);
    expect(f.output.join('\n')).toMatch(/Row 2:.*duplicate email/);
    expect(f.output.join('\n')).toMatch(/Row 3:.*duplicate email/);
    expect(f.output.join('\n')).toMatch(/Row 4:.*id/);
    expect(f.output.join('\n')).toMatch(/Row 5:.*role/);
    expect(f.output.join('\n')).not.toContain('super-secret-invalid-role');
    expect(f.output.join('\n')).not.toContain(ada.passwordHash);
  });

  it.each([
    [], ['--apply', '--verify'], ['--apply', '--apply'], ['--unknown'], ['--apply=1'],
  ].map(args => ({ args })))('rejects ambiguous or unknown arguments before opening providers: $args', async ({ args }) => {
    const f = fixture();
    expect(await f.run(args)).toBe(1);
    expect(f.opened).toBe(0);
    expect(f.writes).toEqual([]);
  });

  it.each(['--dry-run', '--apply', '--verify', '--restore-sheet'])('requires explicit shared services for %s even on hosted settings', async mode => {
    const f = fixture();
    expect(await f.run([mode], { ...frozen, USE_SHARED_SERVICES: '' })).toBe(1);
    expect(f.opened).toBe(0);
  });

  it.each([
    ['--apply', 'mongodb', '1'], ['--apply', 'google-sheets', '0'],
    ['--restore-sheet', 'google-sheets', '1'], ['--restore-sheet', 'mongodb', '0'],
  ])('AC10 refuses %s for store %s and read-only %s before opening providers', async (mode, store, readOnly) => {
    const f = fixture();
    expect(await f.run([mode], { ...frozen, USER_STORE: store, USER_STORE_READ_ONLY: readOnly })).toBe(1);
    expect(f.opened).toBe(0);
    expect(f.writes).toEqual([]);
  });

  it('dry run succeeds with valid source and never writes indexes or data', async () => {
    const f = fixture();
    expect(await f.run(['--dry-run'], { ...frozen, USER_STORE_READ_ONLY: '0' })).toBe(0);
    expect(f.writes).toEqual([]);
    expect(f.output).toContain('Sheet rows: 1; valid: 1; invalid: 0; duplicate emails: 0');
  });

  it.each(['email', 'displayName', 'passwordHash', 'role', 'status', 'createdAt', 'enrolledCourseIds'] as const)(
    'AC11 verifies %s without displaying either value', async field => {
      const changed: AuthUser = { ...structuredClone(ada), [field]: {
        email: 'different@example.test', displayName: 'Other Private Name', passwordHash: 'secret-new-hash',
        role: 'admin', status: 'active', createdAt: '2026-10-01T00:00:00.000Z', enrolledCourseIds: ['new-private-course'],
      }[field] };
      const f = fixture(undefined, [changed]);
      expect(await f.run(['--verify'])).toBe(1);
      expect(f.output).toContain(`Difference: id="user-ada"; field=${field}`);
      const output = f.output.join('\n');
      for (const secret of [ada.passwordHash, changed.passwordHash, ada.displayName, 'Other Private Name', 'different@example.test', 'new-private-course']) {
        expect(output).not.toContain(secret);
      }
      expect(f.writes).toEqual([]);
    },
  );

  it('AC11 detects accounts absent from either store', async () => {
    const mongoOnly = { ...ada, id: 'mongo-only', email: 'mongo@example.test' };
    const f = fixture(undefined, [mongoOnly]);
    expect(await f.run(['--verify'])).toBe(1);
    expect(f.output).toContain('Difference: id="user-ada"; field=missingInMongoDB');
    expect(f.output).toContain('Difference: id="mongo-only"; field=missingInSheet');
    expect(f.writes).toEqual([]);
  });

  it('AC11 reports malformed Mongo fields by id and field and still compares the other fields', async () => {
    const f = fixture(undefined, [{ ...ada, role: 'invalid-private-role', passwordHash: 'different-private-hash' } as unknown as AuthUser]);
    expect(await f.run(['--verify'])).toBe(1);
    expect(f.output).toContain('Difference: id="user-ada"; field=role');
    expect(f.output).toContain('Difference: id="user-ada"; field=passwordHash');
    expect(f.output.join('\n')).not.toContain('invalid-private-role');
    expect(f.output.join('\n')).not.toContain('different-private-hash');
    expect(f.writes).toEqual([]);
  });

  it('AC11 reports malformed sheet fields by id and field and continues comparing both directions', async () => {
    const malformed = [...row]; malformed[3] = ''; malformed[4] = 'private-invalid-role';
    const secondRow = [...row]; secondRow[0] = 'second'; secondRow[1] = 'second@example.test';
    const mongoOnly = { ...ada, id: 'mongo-only', email: 'mongo-only@example.test' };
    const f = fixture([headers, malformed, secondRow], [{ ...ada, role: 'student' }, mongoOnly]);
    expect(await f.run(['--verify'])).toBe(1);
    expect(f.output).toContain('Row 2: invalid or missing passwordHash.');
    expect(f.output).toContain('Row 2: invalid or missing role.');
    expect(f.output).toContain('Difference: id="user-ada"; field=passwordHash');
    expect(f.output).toContain('Difference: id="user-ada"; field=role');
    expect(f.output).toContain('Difference: id="second"; field=missingInMongoDB');
    expect(f.output).toContain('Difference: id="mongo-only"; field=missingInSheet');
    expect(f.output.join('\n')).not.toContain('private-invalid-role');
    expect(f.writes).toEqual([]);
  });

  it.each(['missing', 'duplicate'])('verify refuses %s sheet IDs and still compares unrelated accounts', async kind => {
    const malformed = [...row]; malformed[0] = kind === 'missing' ? ' ' : 'duplicate-id';
    const duplicate = [...malformed]; duplicate[1] = 'another@example.test';
    const f = fixture([headers, malformed, ...(kind === 'duplicate' ? [duplicate] : [])], [ada]);
    expect(await f.run(['--verify'])).toBe(1);
    expect(f.output).toContain('Difference: id="user-ada"; field=missingInSheet');
    expect(f.output.join('\n')).not.toContain('Verified:');
    expect(f.writes).toEqual([]);
  });

  it('preserves nonempty ID strings exactly as the existing row mapper does', async () => {
    const spaced = [...row]; spaced[0] = ' user-ada ';
    const f = fixture([headers, spaced]);
    expect(await f.run(['--apply'])).toBe(0);
    expect(f.mongo.get(' user-ada ')).toEqual({ ...ada, id: ' user-ada ' });
    expect(await f.run(['--verify'])).toBe(0);
    expect(f.output).toContain('Verified: 1 accounts identical');
  });

  it('AC12 restores every Mongo field in place, keeps extra cells and row order, appends new accounts, then verifies', async () => {
    const other = { ...ada, id: 'other', email: 'other@example.test', enrolledCourseIds: [] };
    const added = { ...ada, id: 'new-user', email: 'new@example.test', role: 'student' as const };
    const changed = { ...ada, enrolledCourseIds: [...ada.enrolledCourseIds, 'post-cutover'] };
    const otherRow = [other.id, other.email, other.displayName, other.passwordHash, other.role, other.status, other.createdAt, ''];
    const f = fixture([[...headers, 'private-notes'], [...row, 'keep-A'], [...otherRow, 'keep-B']], [other, added, changed]);
    expect(await f.run(['--restore-sheet'], { ...frozen, USER_STORE: 'mongodb' })).toBe(0);
    expect(f.sheet.map(values => values[0])).toEqual(['id', 'user-ada', 'other', 'new-user']);
    expect(f.sheet[1]).toEqual([ada.id, ada.email, ada.displayName, ada.passwordHash, ada.role, ada.status, ada.createdAt, 'course-a, course-b, post-cutover', 'keep-A']);
    expect(f.sheet[2][8]).toBe('keep-B');
    expect(await f.run(['--verify'])).toBe(0);
    expect(f.output).toContain('Verified: 3 accounts identical');
    expect(f.writes).not.toContain('mongo');
  });

  it('restore never removes sheet-only accounts and verify blocks a switch while they differ', async () => {
    const f = fixture(undefined, []);
    expect(await f.run(['--restore-sheet'], { ...frozen, USER_STORE: 'mongodb' })).toBe(0);
    expect(f.sheet).toEqual([headers, row]);
    expect(await f.run(['--verify'])).toBe(1);
  });

  it('AC05 recovers an applied account whose acknowledgement was lost without changing the source', async () => {
    const f = fixture();
    const upsert = f.ports.upsertMongo;
    let fail = true;
    f.ports.upsertMongo = async user => {
      const result = await upsert(user);
      if (fail) { fail = false; throw new Error('Lost write acknowledgement'); }
      return result;
    };
    expect(await f.run(['--apply'])).toBe(1);
    expect(f.sheet).toEqual([headers, row]);
    expect(f.mongo.get(ada.id)).toEqual(ada);
    expect(await f.run(['--apply'])).toBe(0);
    expect(f.output).toContain('inserted: 0; updated: 0; unchanged: 1');
    expect(await f.run(['--verify'])).toBe(0);
  });

  it.each(['update', 'append'])('AC12 recovers a lost restore %s acknowledgement without duplicate accounts or source loss', async stage => {
    const changed = { ...ada, passwordHash: 'post-cutover-hash', enrolledCourseIds: [...ada.enrolledCourseIds, 'post-cutover'] };
    const added = { ...ada, id: 'new-account', email: 'new@example.test' };
    const f = fixture(undefined, [changed, added]);
    let fail = true;
    if (stage === 'update') {
      const update = f.ports.updateSheetRow;
      f.ports.updateSheetRow = async (...args) => {
        await update(...args);
        if (fail) { fail = false; throw new Error('Lost update acknowledgement'); }
      };
    } else {
      const append = f.ports.appendSheetRows;
      f.ports.appendSheetRows = async (...args) => {
        await append(...args);
        if (fail) { fail = false; throw new Error('Lost append acknowledgement'); }
      };
    }
    const settings = { ...frozen, USER_STORE: 'mongodb' };
    expect(await f.run(['--restore-sheet'], settings)).toBe(1);
    expect([...f.mongo.values()]).toEqual([changed, added]);
    expect(await f.run(['--restore-sheet'], settings)).toBe(0);
    expect(f.sheet.slice(1).map(row => row[0])).toEqual([ada.id, added.id]);
    expect(await f.run(['--verify'], settings)).toBe(0);
    expect(f.output.join('\n')).not.toContain('post-cutover-hash');
  });

  it('sanitizes provider failure details and returns failure', async () => {
    const f = fixture();
    f.ports.readSheet = async () => { throw new Error(`request includes ${ada.passwordHash} ${ada.email}`); };
    expect(await f.run(['--apply'])).toBe(1);
    expect(f.output.join('\n')).toContain('Migration failed');
    expect(f.output.join('\n')).not.toContain(ada.passwordHash);
    expect(f.output.join('\n')).not.toContain(ada.email);
    expect(f.writes).toEqual([]);
  });

  it.each([
    { column: 0, value: '', field: 'id' }, { column: 1, value: '', field: 'email' },
    { column: 1, value: 'not-an-email', field: 'email' }, { column: 2, value: '', field: 'displayName' },
    { column: 3, value: '', field: 'passwordHash' }, { column: 4, value: '', field: 'role' },
    { column: 5, value: 'unknown-status', field: 'status' }, { column: 6, value: '', field: 'createdAt' },
    { column: 6, value: 'invalid-date', field: 'createdAt' }, { column: 7, value: 123, field: 'enrolledCourseIds' },
    { column: 7, value: 'course-a,,course-b', field: 'enrolledCourseIds' },
  ])('rejects invalid $field before apply without silently defaulting', async ({ column, value, field }) => {
    const bad: unknown[] = [...row]; bad[column] = value;
    const f = fixture([headers, bad]);
    expect(await f.run(['--apply'])).toBe(1);
    expect(f.output).toContain(`Row 2: invalid or missing ${field}.`);
    expect(f.writes).toEqual([]);
  });

  it('rejects duplicate IDs with distinct emails before apply', async () => {
    const duplicate = [...row]; duplicate[1] = 'different@example.test';
    const f = fixture([headers, row, duplicate]);
    expect(await f.run(['--apply'])).toBe(1);
    expect(f.output.join('\n')).toMatch(/Row 2: duplicate id/);
    expect(f.output.join('\n')).toMatch(/Row 3: duplicate id/);
    expect(f.writes).toEqual([]);
  });

  it('refuses wrong headers without changing either store', async () => {
    const f = fixture([['email', 'id', ...headers.slice(2)], row]);
    expect(await f.run(['--apply'])).toBe(1);
    expect(f.output).toContain('Row 1: expected Users account headers in columns A:H.');
    expect(f.writes).toEqual([]);
  });

  it('refuses a destination email owned by another id before creating indexes or copying any rows', async () => {
    const f = fixture(undefined, [{ ...ada, id: 'another-id' }]);
    expect(await f.run(['--apply'])).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.mongo.size).toBe(1);
  });

  it('refuses a rollback that would create duplicate emails with a retained sheet-only row before any writes', async () => {
    const changed = { ...ada, id: 'new-id', enrolledCourseIds: ['after-cutover'] };
    const f = fixture(undefined, [changed]);
    expect(await f.run(['--restore-sheet'], { ...frozen, USER_STORE: 'mongodb' })).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.sheet).toEqual([headers, row]);
  });

  it('refuses malformed Mongo enrollment data before restoring any rows', async () => {
    const changed = { ...ada, enrolledCourseIds: ['would,split-into-two'] };
    const f = fixture(undefined, [changed]);
    expect(await f.run(['--restore-sheet'], { ...frozen, USER_STORE: 'mongodb' })).toBe(1);
    expect(f.output).toContain('MongoDB account 1: invalid or missing enrolledCourseIds.');
    expect(f.writes).toEqual([]);
  });
});

describe('migration provider adapters (fakes only)', () => {
  it('uses the string id and majority upserts, creates the required indexes, and maps all Mongo fields', async () => {
    const documents = new Map<string, Record<string, unknown>>();
    const indexes: Array<{ keys: Record<string, 1>; options?: { unique: true } }> = [];
    const collection: MigrationMongoCollection = {
      createIndex: async (keys, options) => { indexes.push({ keys, options }); },
      find: () => ({ toArray: async () => [...documents.values()] as never }),
      updateOne: async (filter, update, options) => {
        expect(options).toEqual({ upsert: true, writeConcern: { w: 'majority' } });
        expect(filter).toEqual({ _id: 'user-ada' });
        expect(update.$set).not.toHaveProperty('id');
        expect(update.$set).not.toHaveProperty('_id');
        const existing = documents.get(filter._id);
        const document = { _id: filter._id, ...update.$set };
        documents.set(filter._id, document);
        return { upsertedCount: existing ? 0 : 1, modifiedCount: existing && JSON.stringify(existing) !== JSON.stringify(document) ? 1 : 0 };
      },
    };
    const unusedSheets = { spreadsheets: { values: {} } } as MigrationSheetsClient;
    const ports = createMigrationPorts({ spreadsheetId: 'fake-sheet', range: 'Users!A:H' }, unusedSheets, collection);
    await ports.ensureMongoIndexes();
    expect(indexes).toEqual([
      { keys: { email: 1 }, options: { unique: true } },
      { keys: { enrolledCourseIds: 1 }, options: undefined },
    ]);
    expect(await ports.upsertMongo(ada)).toBe('inserted');
    expect(await ports.upsertMongo(ada)).toBe('unchanged');
    expect(await ports.upsertMongo({ ...ada, status: 'active' })).toBe('updated');
    expect(await ports.readMongo()).toEqual([{ ...ada, status: 'active' }]);
    expect(documents.get(ada.id)).toEqual({ _id: ada.id, email: ada.email, displayName: ada.displayName,
      passwordHash: ada.passwordHash, role: ada.role, status: 'active', createdAt: ada.createdAt, enrolledCourseIds: ada.enrolledCourseIds });
  });

  it('reads the complete Users table and restricts restore writes to account columns with RAW values', async () => {
    const calls: unknown[] = [];
    const sheets: MigrationSheetsClient = {
      spreadsheets: { values: {
        get: async request => { calls.push(request); return { data: { values: [headers, row] } }; },
        update: async request => { calls.push(request); return {}; },
        append: async request => { calls.push(request); return {}; },
      } },
    };
    const ports = createMigrationPorts({ spreadsheetId: 'fake-sheet', range: "'Account Users'!A1:H99" }, sheets, {} as MigrationMongoCollection);
    expect(await ports.readSheet()).toEqual([headers, row]);
    await ports.updateSheetRow(4, row);
    await ports.appendSheetRows([row]);
    expect(calls).toEqual([
      { spreadsheetId: 'fake-sheet', range: "'Account Users'!A:H", valueRenderOption: 'UNFORMATTED_VALUE' },
      { spreadsheetId: 'fake-sheet', range: "'Account Users'!A4:H4", valueInputOption: 'RAW', requestBody: { values: [row] } },
      { spreadsheetId: 'fake-sheet', range: "'Account Users'!A:H", valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [row] } },
    ]);
  });

  it('rejects a configured column offset before sending any request', () => {
    expect(() => createMigrationPorts({ spreadsheetId: 'fake-sheet', range: 'Users!B:I' },
      {} as MigrationSheetsClient, {} as MigrationMongoCollection)).toThrow('Users range must start at A1 and include account columns A:H.');
  });

  it('runs the command entrypoint safely under NODE_ENV=test and reports invalid flags without echoing them', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    const output: string[] = [];
    expect(await migrationMain(['--unknown-secret-value'], line => output.push(line))).toBe(1);
    expect(output.join('\n')).toContain('Refused: choose exactly one');
    expect(output.join('\n')).not.toContain('unknown-secret-value');
  });

  it('runs dry-run through the entrypoint with synthetic settings and fake Sheets, without opening MongoDB', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('USE_SHARED_SERVICES', '1');
    vi.stubEnv('USER_STORE', 'google-sheets');
    vi.stubEnv('USER_STORE_READ_ONLY', '0');
    cli.opened = 0; cli.closed = 0;
    cli.sheets = { spreadsheets: { values: {
      get: async () => ({ data: { values: [headers, row] } }),
      update: async () => { throw new Error('Unexpected Sheet write'); },
      append: async () => { throw new Error('Unexpected Sheet write'); },
    } } };
    const output: string[] = [];
    expect(await migrationMain(['--dry-run'], line => output.push(line))).toBe(0);
    expect(output).toContain('Sheet rows: 1; valid: 1; invalid: 0; duplicate emails: 0');
    expect(cli.opened).toBe(0);
    expect(cli.closed).toBe(0);
  });

  it('closes its fake MongoDB connection and suppresses driver credentials on a failed apply', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('USE_SHARED_SERVICES', '1');
    vi.stubEnv('USER_STORE', 'google-sheets');
    vi.stubEnv('USER_STORE_READ_ONLY', '1');
    cli.opened = 0; cli.closed = 0;
    cli.sheets = { spreadsheets: { values: {
      get: async () => ({ data: { values: [headers, row] } }),
      update: async () => { throw new Error('Unexpected Sheet write'); },
      append: async () => { throw new Error('Unexpected Sheet write'); },
    } } };
    cli.collection = {
      find: () => ({ toArray: async () => [] }),
      createIndex: async () => undefined,
      updateOne: async () => { throw new Error(`MongoDB request leaked ${ada.passwordHash}`); },
    };
    const output: string[] = [];
    expect(await migrationMain(['--apply'], line => output.push(line))).toBe(1);
    expect(output.join('\n')).toContain('Migration failed');
    expect(output.join('\n')).not.toContain(ada.passwordHash);
    expect(cli.opened).toBe(1);
    expect(cli.closed).toBe(1);
  });
});
