import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AuthUser } from './auth.js';
import { runUsersMigration, type UsersMigrationPorts } from './usersMigration.js';

type MongoUserDocument = Omit<AuthUser, 'id'> & { _id: string };
export interface MigrationMongoCollection {
  createIndex(keys: Record<string, 1>, options?: { unique: true }): Promise<unknown>;
  find(filter: Record<string, never>): { toArray(): Promise<MongoUserDocument[]> };
  updateOne(filter: { _id: string }, update: { $set: Omit<AuthUser, 'id'> },
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
): UsersMigrationPorts {
  // Always read the full account columns, even if the configured range has a row
  // limit. A partial source cannot prove a complete migration or rollback.
  const match = /^(.*)!\$?A(?:\$?1)?:\$?H(?:\$?\d+)?$/.exec(settings.range);
  if (!match?.[1]) throw new Error('Users range must start at A1 and include account columns A:H.');
  const title = match[1];
  const range = `${title}!A:H`;
  const spreadsheetId = settings.spreadsheetId;
  const getCollection = async () => typeof collection === 'function' ? collection() : collection;
  return {
    readSheet: async () => {
      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range, valueRenderOption: 'UNFORMATTED_VALUE' });
      return response.data.values ?? [];
    },
    readMongo: async () => (await (await getCollection()).find({}).toArray()).map(document => {
      const { _id, ...fields } = document;
      return { id: _id, ...fields };
    }),
    ensureMongoIndexes: async () => {
      const target = await getCollection();
      await target.createIndex({ email: 1 }, { unique: true });
      await target.createIndex({ enrolledCourseIds: 1 });
    },
    upsertMongo: async user => {
      const { id, ...fields } = user;
      const result = await (await getCollection()).updateOne({ _id: id }, { $set: fields },
        { upsert: true, writeConcern: { w: 'majority' } });
      return result.upsertedCount ? 'inserted' : result.modifiedCount ? 'updated' : 'unchanged';
    },
    updateSheetRow: async (rowNumber, values) => {
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: `${title}!A${rowNumber}:H${rowNumber}`, valueInputOption: 'RAW',
        requestBody: { values: [values] },
      });
    },
    appendSheetRows: async values => {
      await sheets.spreadsheets.values.append({
        spreadsheetId, range, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values },
      });
    },
  };
}

export async function migrationMain(args: string[], write: (line: string) => void = console.log): Promise<0 | 1> {
  let close: (() => Promise<void>) | undefined;
  let result: 0 | 1 = 1;
  try {
    // Loading config uses the same api/.env precedence as the API. Service clients
    // and network connections remain lazy, behind the operator guards.
    const { apiConfig, hasGoogleSheetsConfig, hasMongoConfig } = await import('./config.js');
    result = await runUsersMigration(args, {
      USE_SHARED_SERVICES: process.env.USE_SHARED_SERVICES,
      USER_STORE: process.env.USER_STORE,
      USER_STORE_READ_ONLY: process.env.USER_STORE_READ_ONLY,
    }, async () => {
      if (process.env.NODE_ENV === 'test' || apiConfig.mode === 'isolated' || !hasGoogleSheetsConfig()) {
        throw new Error('Shared Sheets settings are required.');
      }
      const { createSheetsClient } = await import('./googleSheets.js');
      let collection: MigrationMongoCollection | undefined;
      return createMigrationPorts({ spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID!, range: apiConfig.GOOGLE_SHEETS_USERS_RANGE },
        createSheetsClient(), async () => {
          if (collection) return collection;
          if (!hasMongoConfig()) throw new Error('Shared MongoDB settings are required.');
          const { getMongoDatabase, closeMongoClient } = await import('./mongo.js');
          close = closeMongoClient;
          const database = await getMongoDatabase();
          collection = database.collection<MongoUserDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_users`,
            { writeConcern: { w: 'majority' } });
          return collection;
        });
    }, write);
  } catch {
    write('Migration failed: configuration could not be loaded. Check the allowed settings and required credentials.');
  } finally {
    try { await close?.(); }
    catch {
      write('Migration failed: database connection cleanup failed.');
      result = 1;
    }
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await migrationMain(process.argv.slice(2));
}
