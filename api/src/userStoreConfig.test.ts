import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('dotenv', () => ({ config: () => {} }));
vi.mock('./mongo.js', () => ({ getMongoDatabase: () => { throw new Error('No real Mongo'); } }));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const complete = { AUTH_TOKEN_SECRET: 'synthetic-token-secret', GOOGLE_SHEETS_SPREADSHEET_ID: 'fake', GOOGLE_SERVICE_ACCOUNT_EMAIL: 'service@example.test', GOOGLE_PRIVATE_KEY: 'fake',
  MONGODB_URI: 'mongodb://fake.invalid', MONGODB_DB_NAME: 'fake', MONGODB_COURSE_CONTENT_COLLECTION: 'fake' };
async function load(input: Record<string, string | undefined>) {
  vi.resetModules();
  for (const key of ['NODE_ENV', 'VERCEL', 'USE_SHARED_SERVICES', 'USER_STORE_READ_ONLY', ...Object.keys(complete)]) vi.stubEnv(key, undefined);
  for (const [key, value] of Object.entries({ ...complete, NODE_ENV: 'production', ...input })) vi.stubEnv(key, value);
  return { config: await import('./config.js'), auth: await import('./authRepository.js') };
}
describe('US-P016-AC01 account store selection', () => {
  it.each([
    [{}, 'MongoAuthRepository', 'mongodb'],
    [{ NODE_ENV: 'development', USE_SHARED_SERVICES: '1' }, 'MongoAuthRepository', 'mongodb'],
    [{ NODE_ENV: 'development' }, 'InMemoryAuthRepository', 'memory'],
    [{ NODE_ENV: 'test', USE_SHARED_SERVICES: '1' }, 'InMemoryAuthRepository', 'memory'],
  ] as const)('selects %j without connecting to providers', async (input, name, storage) => {
    const { auth } = await load(input); const repo = auth.createAuthRepository();
    expect(repo.constructor.name).toBe(name); expect(repo.storageType).toBe(storage);
  });
  it.each(['MONGODB_URI', 'MONGODB_DB_NAME', 'MONGODB_COURSE_CONTENT_COLLECTION'])('missing %s never falls back to demo accounts or Sheets', async field => {
    const { auth } = await load({ [field]: undefined });
    const repo = auth.createAuthRepository();
    expect(repo.storageType).toBe('mongodb'); expect(repo.unavailableReason).toBe('Production user store is not configured. Authentication is unavailable.');
    expect(await repo.findByEmail('student@qi-education.local')).toBeNull();
    await expect(repo.collectForExport('id')).rejects.toThrow('Authentication is unavailable');
    await expect(repo.beginErasure('id', 'hash')).rejects.toThrow('Authentication is unavailable');
    await expect(repo.anonymizeForUser('id')).rejects.toThrow('Authentication is unavailable');
    await expect(repo.beginPrivacyMutation('id', 'ed5b3472-429f-4ba3-8062-2049cbeb2a01', 2000)).rejects.toThrow('Authentication is unavailable');
    await expect(repo.finishPrivacyMutation('id', 'ed5b3472-429f-4ba3-8062-2049cbeb2a01')).rejects.toThrow('Authentication is unavailable');
    await expect(repo.cancelErasure('id', 'hash')).rejects.toThrow('Authentication is unavailable');
    await expect(repo.markErasureCleaning('id')).rejects.toThrow('Authentication is unavailable');
  });
  it('keeps the maintenance freeze validation', async () => {
    const { config } = await load({ NODE_ENV: 'test' });
    expect(config.buildApiConfig({}).USER_STORE_READ_ONLY).toBe('0');
    expect(() => config.buildApiConfig({ USER_STORE_READ_ONLY: 'true' })).toThrow(/0.*1/);
  });
  it.each(['mongodb'])('freezes every repository method in %s before provider access', async store => {
    const { auth } = await load({ USER_STORE_READ_ONLY: '1' });
    const repo = auth.createAuthRepository(); expect(repo.readOnly).toBe(true); expect(repo.storageType).toBe(store);
    const calls = [() => repo.createUser({} as never), () => repo.enrollUserInCourse('id', 'course'), () => repo.updatePasswordHash('id', 'hash'),
      () => repo.updateRole('id', 'teacher'), () => repo.updateStatus('id', 'disabled'), () => repo.updateRoleWithChange('id', 'teacher'), () => repo.updateStatusWithChange('id', 'disabled'), () => repo.confirmEmail('id'),
      () => repo.beginErasure('id', 'hash'), () => repo.anonymizeForUser('id'),
      () => repo.beginPrivacyMutation('id', 'ed5b3472-429f-4ba3-8062-2049cbeb2a01', 2000),
      () => repo.finishPrivacyMutation('id', 'ed5b3472-429f-4ba3-8062-2049cbeb2a01'),
      () => repo.cancelErasure('id', 'hash'), () => repo.markErasureCleaning('id')];
    for (const call of calls) await expect(call()).rejects.toThrow('Accounts are briefly read-only for maintenance. Try again in a few minutes.');
  });
});
