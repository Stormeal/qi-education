import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Course } from './course.js';
import { CoursesMigrationConfigurationError, runCoursesMigration, type CoursesMigrationPorts } from './coursesMigration.js';

type MongoCourseDocument = Omit<Course, 'id'> & { _id: string };
export interface MigrationMongoCollection {
  createIndex(keys: Record<string, 1>): Promise<unknown>;
  find(filter: Record<string, never>): { toArray(): Promise<MongoCourseDocument[]> };
  updateOne(filter: { _id: string }, update: { $set: Omit<Course, 'id'> },
    options: { upsert: true; writeConcern: { w: 'majority' } }): Promise<{ upsertedCount: number; modifiedCount: number }>;
}
type SheetRead = { spreadsheetId: string; range: string; valueRenderOption: 'UNFORMATTED_VALUE' };
type SheetWrite = { spreadsheetId: string; range: string; valueInputOption: 'RAW'; requestBody: { values: string[][] } };
export interface MigrationSheetsClient {
  spreadsheets: { values: {
    get(request: SheetRead): Promise<{ data: { values?: unknown[][] | null } }>;
    update(request: SheetWrite): Promise<unknown>;
    append(request: SheetWrite & { insertDataOption: 'INSERT_ROWS' }): Promise<unknown>;
  } };
}

export function createMigrationPorts(
  settings: { spreadsheetId: string; range: string }, sheets: MigrationSheetsClient,
  collection: MigrationMongoCollection | (() => Promise<MigrationMongoCollection>),
): CoursesMigrationPorts {
  // Legacy configuration ends at R; course details now occupy all 21 columns.
  // Remove row limits and always include S:U to avoid an incomplete copy/verify.
  const match = /^(.*)!\$?A(?:\$?1)?:\$?(?:R|U)(?:\$?\d+)?$/.exec(settings.range);
  if (!match?.[1]) throw new CoursesMigrationConfigurationError('Courses range must start at A1 and include course columns A:R or A:U.');
  const title = match[1], range = `${title}!A:U`, spreadsheetId = settings.spreadsheetId;
  const getCollection = async () => typeof collection === 'function' ? collection() : collection;
  return {
    readSheet: async () => {
      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range, valueRenderOption: 'UNFORMATTED_VALUE' });
      return response.data.values ?? [];
    },
    readMongo: async () => (await (await getCollection()).find({}).toArray()).map(document => {
      // Keep raw field values for validation, and make _id authoritative even if
      // a malformed document also contains an id property.
      const { _id, ...fields } = document;
      return { ...fields, id: _id };
    }),
    ensureMongoIndexes: async () => { await (await getCollection()).createIndex({ createdAt: 1, _id: 1 }); },
    upsertMongo: async course => {
      const { id, ...fields } = course;
      const result = await (await getCollection()).updateOne({ _id: id }, { $set: fields },
        { upsert: true, writeConcern: { w: 'majority' } });
      return result.upsertedCount ? 'inserted' : result.modifiedCount ? 'updated' : 'unchanged';
    },
    updateSheetRow: async (number, values) => {
      await sheets.spreadsheets.values.update({ spreadsheetId, range: `${title}!A${number}:U${number}`,
        valueInputOption: 'RAW', requestBody: { values: [values] } });
    },
    appendSheetRows: async values => {
      await sheets.spreadsheets.values.append({ spreadsheetId, range, valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS', requestBody: { values } });
    },
  };
}

export async function migrationMain(args: string[], write: (line: string) => void = console.log): Promise<0 | 1> {
  let close: (() => Promise<void>) | undefined;
  let result: 0 | 1 = 1;
  try {
    const { apiConfig, hasGoogleSheetsConfig, hasMongoConfig } = await import('./config.js');
    // Access config inside this outer catch so a failed config parse always uses
    // the exact operator-facing configuration message, without credential data.
    const config = apiConfig;
    result = await runCoursesMigration(args, {
      USE_SHARED_SERVICES: process.env.USE_SHARED_SERVICES,
      COURSE_STORE: process.env.COURSE_STORE,
      COURSE_STORE_READ_ONLY: process.env.COURSE_STORE_READ_ONLY,
    }, async () => {
      if (process.env.NODE_ENV === 'test' || config.mode === 'isolated' || !hasGoogleSheetsConfig()) {
        throw new CoursesMigrationConfigurationError('Shared Sheets settings are required.');
      }
      const { createSheetsClient } = await import('./googleSheets.js');
      let collection: MigrationMongoCollection | undefined;
      return createMigrationPorts({ spreadsheetId: config.GOOGLE_SHEETS_SPREADSHEET_ID!, range: config.GOOGLE_SHEETS_COURSES_RANGE },
        createSheetsClient(), async () => {
          if (collection) return collection;
          if (!hasMongoConfig()) throw new CoursesMigrationConfigurationError('Shared MongoDB settings are required.');
          const { getMongoDatabase, closeMongoClient } = await import('./mongo.js');
          close = closeMongoClient;
          const database = await getMongoDatabase();
          collection = database.collection<MongoCourseDocument>(`${config.MONGODB_COURSE_CONTENT_COLLECTION}_courses`,
            { writeConcern: { w: 'majority' } });
          return collection;
        });
    }, write);
  } catch {
    write('Migration failed: configuration could not be loaded. Check the allowed settings and required credentials.');
  } finally {
    try { await close?.(); }
    catch { write('Migration failed: database connection cleanup failed.'); result = 1; }
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await migrationMain(process.argv.slice(2));
}
