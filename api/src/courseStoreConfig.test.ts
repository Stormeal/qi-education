import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('dotenv', () => ({ config: () => {} }));
vi.mock('./mongo.js', () => ({ getMongoDatabase: () => { throw new Error('No real Mongo'); } }));
vi.mock('./googleSheets.js', () => ({ createSheetsClient: () => { throw new Error('No real Sheets'); }, ensureWorksheetHeaders: () => { throw new Error('No real Sheets'); } }));
const complete = { AUTH_TOKEN_SECRET: 'synthetic-token-secret', GOOGLE_SHEETS_SPREADSHEET_ID: 'fake', GOOGLE_SERVICE_ACCOUNT_EMAIL: 'service@example.test', GOOGLE_PRIVATE_KEY: 'fake',
  MONGODB_URI: 'mongodb://fake.invalid', MONGODB_DB_NAME: 'fake', MONGODB_COURSE_CONTENT_COLLECTION: 'fake' };
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
async function load(input: Record<string, string | undefined>) {
  vi.resetModules();
  for (const key of ['NODE_ENV', 'VERCEL', 'USE_SHARED_SERVICES', 'COURSE_STORE', 'COURSE_STORE_READ_ONLY', ...Object.keys(complete)]) vi.stubEnv(key, undefined);
  for (const [key, value] of Object.entries({ ...complete, NODE_ENV: 'production', ...input })) vi.stubEnv(key, value);
  return { config: await import('./config.js'), courses: await import('./courseRepository.js') };
}
describe('US-P015 AC03/04/05 course store selection', () => {
  it.each([
    [{}, 'GoogleSheetsCourseRepository', 'google-sheets'],
    [{ COURSE_STORE: 'google-sheets' }, 'GoogleSheetsCourseRepository', 'google-sheets'],
    [{ COURSE_STORE: 'mongodb' }, 'MongoCourseRepository', 'mongodb'],
    [{ NODE_ENV: 'development', USE_SHARED_SERVICES: '1', COURSE_STORE: 'mongodb' }, 'MongoCourseRepository', 'mongodb'],
    [{ NODE_ENV: 'development', COURSE_STORE: 'mongodb' }, 'InMemoryCourseRepository', 'memory'],
    [{ NODE_ENV: 'test', COURSE_STORE: 'mongodb', USE_SHARED_SERVICES: '1' }, 'InMemoryCourseRepository', 'memory'],
  ] as const)('selects %j without contacting providers', async (input, name, storage) => {
    const { courses } = await load(input); const repo = courses.createCourseRepository();
    expect(repo.constructor.name).toBe(name); expect(repo.storageType).toBe(storage);
  });
  it.each(['MONGODB_URI', 'MONGODB_DB_NAME', 'MONGODB_COURSE_CONTENT_COLLECTION'])('missing selected Mongo setting %s fails closed', async field => {
    const { courses } = await load({ COURSE_STORE: 'mongodb', [field]: undefined });
    const repo = courses.createCourseRepository(); expect(repo.storageType).toBe('mongodb');
    await expect(repo.listCourses()).rejects.toThrow('Course details storage is unavailable.');
  });
  it('validates both enums and keeps accounts settings independent', async () => {
    const { config } = await load({ NODE_ENV: 'test' });
    const built = config.buildApiConfig({ USER_STORE: 'mongodb', USER_STORE_READ_ONLY: '1' });
    expect([built.COURSE_STORE, built.COURSE_STORE_READ_ONLY, built.USER_STORE, built.USER_STORE_READ_ONLY]).toEqual(['google-sheets', '0', 'mongodb', '1']);
    expect(() => config.buildApiConfig({ COURSE_STORE: 'mongo' })).toThrow(/google-sheets.*mongodb/);
    expect(() => config.buildApiConfig({ COURSE_STORE_READ_ONLY: 'true' })).toThrow(/0.*1/);
  });
  it.each(['mongodb', 'google-sheets'])('repository wrapper refuses all %s mutations before provider access', async store => {
    const { courses } = await load({ COURSE_STORE: store, COURSE_STORE_READ_ONLY: '1' });
    const repo = courses.createCourseRepository(); expect(repo.readOnly).toBe(true); expect(repo.storageType).toBe(store);
    for (const call of [() => repo.createCourse({} as never), () => repo.updateCourse('id', {} as never), () => repo.updateCoursePrice('id', { priceDkk: null }),
      () => repo.updateCourseCatalogMetadata('id', {} as never), () => repo.updateCourseThumbnail('id', { thumbnailAssetId: '' })]) {
      await expect(call()).rejects.toThrow('Course details are briefly read-only for maintenance. Try again in a few minutes.');
    }
  });
});
