import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('dotenv', () => ({ config: () => {} }));
vi.mock('./mongo.js', () => ({ getMongoDatabase: () => { throw new Error('No real Mongo'); } }));
const complete = { AUTH_TOKEN_SECRET: 'synthetic-token-secret', GOOGLE_SHEETS_SPREADSHEET_ID: 'fake', GOOGLE_SERVICE_ACCOUNT_EMAIL: 'service@example.test', GOOGLE_PRIVATE_KEY: 'fake',
  MONGODB_URI: 'mongodb://fake.invalid', MONGODB_DB_NAME: 'fake', MONGODB_COURSE_CONTENT_COLLECTION: 'fake' };
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
async function load(input: Record<string, string | undefined>) {
  vi.resetModules();
  for (const key of ['NODE_ENV', 'VERCEL', 'USE_SHARED_SERVICES', 'COURSE_STORE_READ_ONLY', ...Object.keys(complete)]) vi.stubEnv(key, undefined);
  for (const [key, value] of Object.entries({ ...complete, NODE_ENV: 'production', ...input })) vi.stubEnv(key, value);
  return { config: await import('./config.js'), courses: await import('./courseRepository.js') };
}
describe('US-P016-AC01 course store selection', () => {
  it.each([
    [{}, 'MongoCourseRepository', 'mongodb'],
    [{ NODE_ENV: 'development', USE_SHARED_SERVICES: '1' }, 'MongoCourseRepository', 'mongodb'],
    [{ NODE_ENV: 'development' }, 'InMemoryCourseRepository', 'memory'],
    [{ NODE_ENV: 'test', USE_SHARED_SERVICES: '1' }, 'InMemoryCourseRepository', 'memory'],
  ] as const)('selects %j without contacting providers', async (input, name, storage) => {
    const { courses } = await load(input); const repo = courses.createCourseRepository();
    expect(repo.constructor.name).toBe(name); expect(repo.storageType).toBe(storage);
  });
  it.each(['MONGODB_URI', 'MONGODB_DB_NAME', 'MONGODB_COURSE_CONTENT_COLLECTION'])('missing selected Mongo setting %s fails closed', async field => {
    const { courses } = await load({ [field]: undefined });
    const repo = courses.createCourseRepository(); expect(repo.storageType).toBe('mongodb');
    await expect(repo.listCourses()).rejects.toThrow('Course details storage is unavailable.');
  });
  it('keeps the maintenance freeze validation', async () => {
    const { config } = await load({ NODE_ENV: 'test' });
    expect(config.buildApiConfig({}).COURSE_STORE_READ_ONLY).toBe('0');
    expect(() => config.buildApiConfig({ COURSE_STORE_READ_ONLY: 'true' })).toThrow(/0.*1/);
  });
  it.each(['mongodb'])('repository wrapper refuses all %s mutations before provider access', async store => {
    const { courses } = await load({ COURSE_STORE_READ_ONLY: '1' });
    const repo = courses.createCourseRepository(); expect(repo.readOnly).toBe(true); expect(repo.storageType).toBe(store);
    for (const call of [() => repo.createCourse({} as never), () => repo.updateCourse('id', {} as never), () => repo.updateCoursePrice('id', { priceDkk: null }),
      () => repo.updateCourseCatalogMetadata('id', {} as never), () => repo.updateCourseThumbnail('id', { thumbnailAssetId: '' })]) {
      await expect(call()).rejects.toThrow('Course details are briefly read-only for maintenance. Try again in a few minutes.');
    }
  });
});
