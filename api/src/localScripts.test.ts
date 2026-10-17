import { afterEach, describe, expect, it, vi } from 'vitest';
const fixtures = vi.hoisted(() => ({ exists: true, dotenv: '', concurrently: vi.fn(() => ({ result: Promise.resolve() })) }));
vi.mock('node:fs', () => ({ existsSync: () => fixtures.exists, readFileSync: () => fixtures.dotenv }));
vi.mock('concurrently', () => ({ default: fixtures.concurrently }));
const argv = [...process.argv], exitCode = process.exitCode;
afterEach(() => { process.argv = [...argv]; process.exitCode = exitCode; vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.doUnmock('./config.js'); vi.doUnmock('./server.js'); });
const complete = `AUTH_TOKEN_SECRET=synthetic-session-secret\nGOOGLE_SHEETS_SPREADSHEET_ID=synthetic-sheet\nGOOGLE_SERVICE_ACCOUNT_EMAIL=service@example.invalid\nGOOGLE_PRIVATE_KEY=synthetic-key\nMONGODB_URI=mongodb://synthetic.invalid\nMONGODB_DB_NAME=synthetic-db\nMONGODB_COURSE_CONTENT_COLLECTION=synthetic-content\nMONGODB_COURSE_ASSET_COLLECTION=synthetic-assets\n`;
async function doctor(input: Record<string, string | undefined>, file: string, exists = true, health?: unknown) {
  vi.resetModules(); fixtures.exists = exists; fixtures.dotenv = file; process.argv = ['node', 'doctor.mjs', ...(health ? [] : ['--skip-server'])]; process.exitCode = undefined;
  for (const key of ['NODE_ENV', 'VERCEL', 'USE_SHARED_SERVICES', 'USER_STORE', 'USER_STORE_READ_ONLY', 'AUTH_TOKEN_SECRET', 'SESSION_SECRET', 'CORS_ORIGIN', 'GOOGLE_SHEETS_SPREADSHEET_ID', 'GOOGLE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'MONGODB_URI', 'MONGODB_DB_NAME', 'MONGODB_COURSE_CONTENT_COLLECTION', 'MONGODB_COURSE_ASSET_COLLECTION']) vi.stubEnv(key, input[key]);
  const logs = vi.spyOn(console, 'log').mockImplementation(() => {}); const fetcher = vi.fn(async (url: string) => ({ status: 200, json: async () => url.endsWith('/health/config') ? health : { status: 'ok', store: (health as { auth?: { storage?: string } })?.auth?.storage, readOnly: input.USER_STORE_READ_ONLY === '1' } })); vi.stubGlobal('fetch', fetcher);
  await import('../../scripts/doctor.mjs');
  return { text: logs.mock.calls.map(args => args.join(' ')).join('\n'), code: process.exitCode, fetcher };
}
describe('US-P011 local script behavior over FS/child/health doubles', () => {
  it('US-P014 AC08 names MongoDB and passes with complete Mongo settings even without Sheets auth', async () => {
    const file = complete.split('\n').filter(line => !line.startsWith('GOOGLE_') && !line.startsWith('MONGODB_COURSE_ASSET_COLLECTION=')).join('\n');
    const result = await doctor({ NODE_ENV: 'development', USE_SHARED_SERVICES: '1', USER_STORE: 'mongodb', USER_STORE_READ_ONLY: '1' }, file);
    expect(result.code).toBeUndefined(); expect(result.text).toContain('User store: mongodb'); expect(result.text).toContain('Account writes: read-only');
    expect(result.text).not.toContain('Google Sheets auth storage is incomplete');
  });
  it.each(['MONGODB_URI', 'MONGODB_DB_NAME', 'MONGODB_COURSE_CONTENT_COLLECTION'])('US-P014 AC08 refuses missing Mongo user setting %s', async key => {
    const file = complete.split('\n').filter(line => !line.startsWith(key + '=')).join('\n');
    const result = await doctor({ NODE_ENV: 'development', USE_SHARED_SERVICES: '1', USER_STORE: 'mongodb' }, file);
    expect(result.code).toBe(1); expect(result.text).toContain('MongoDB user storage is incomplete');
  });
  it.each([{ USER_STORE: 'mongo' }, { USER_STORE_READ_ONLY: 'true' }])('US-P014 AC08 rejects invalid operator setting %j', async input => {
    const result = await doctor({ NODE_ENV: 'development', ...input }, complete);
    expect(result.code).toBe(1); expect(result.text).toMatch(/USER_STORE/);
  });
  it('US-P014 AC08 accepts a running MongoDB API with the exact health store', async () => {
    const result = await doctor({ NODE_ENV: 'development', USE_SHARED_SERVICES: '1', USER_STORE: 'mongodb' }, complete, true,
      { status: 'ok', mode: 'shared', auth: { storage: 'mongodb', configured: true }, content: { configured: true }, assets: { configured: true }, corsOrigins: ['http://localhost:4200'] });
    expect(result.code).toBeUndefined(); expect(result.text).toContain('Local API is using MongoDB users.'); expect(result.fetcher).toHaveBeenCalledTimes(2);
  });
  it('US-P014 AC08 accepts Mongo user-only settings and health without requiring asset storage', async () => {
    const file = complete.split('\n').filter(line => !line.startsWith('GOOGLE_') && !line.startsWith('MONGODB_COURSE_ASSET_COLLECTION=')).join('\n');
    const result = await doctor({ NODE_ENV: 'development', USE_SHARED_SERVICES: '1', USER_STORE: 'mongodb' }, file, true,
      { status: 'ok', mode: 'shared', auth: { storage: 'mongodb', configured: true }, content: { configured: true }, assets: { configured: false }, corsOrigins: ['http://localhost:4200'] });
    expect(result.code).toBeUndefined(); expect(result.text).toContain('Result: passed');
  });
  it.each([
    [{ NODE_ENV: 'development' }, '', false, 'isolated'],
    [{ NODE_ENV: 'development' }, 'MONGODB_URI=bad\nGOOGLE_PRIVATE_KEY=synthetic-key', true, 'isolated'],
    [{ NODE_ENV: 'development', USE_SHARED_SERVICES: '0' }, complete + 'USE_SHARED_SERVICES=1', true, 'isolated'],
    [{ NODE_ENV: 'development', USE_SHARED_SERVICES: '1' }, complete, true, 'shared'],
    [{ NODE_ENV: 'development' }, complete + 'USE_SHARED_SERVICES=1', true, 'shared'],
    [{ NODE_ENV: 'development' }, complete + 'USE_SHARED_SERVICES=1 # explicit opt-in', true, 'shared'],
    [{ NODE_ENV: 'development' }, complete + 'export USE_SHARED_SERVICES="1"', true, 'shared'],
    [{ NODE_ENV: 'development' }, complete + 'USE_SHARED_SERVICES=" 1 "', true, 'isolated'],
    [{ NODE_ENV: 'development' }, complete + 'VERCEL=""', true, 'hosted'],
    [{ NODE_ENV: 'development', USE_SHARED_SERVICES: 'true' }, complete, true, 'isolated'],
    [{ NODE_ENV: 'development', USE_SHARED_SERVICES: ' 1 ' }, complete, true, 'isolated'],
    [{ NODE_ENV: 'production', USE_SHARED_SERVICES: '0' }, complete, true, 'hosted'],
    [{ NODE_ENV: 'development', VERCEL: '', USE_SHARED_SERVICES: '0' }, complete, true, 'hosted'],
    [{ NODE_ENV: 'test', VERCEL: '1', USE_SHARED_SERVICES: '1' }, complete, true, 'isolated'],
  ] as const)('AC05 doctor reports %s with shell/file precedence', async (input, file, exists, mode) => {
    const result = await doctor(input, file, exists); expect(result.text).toContain('Stores: ' + mode); expect(result.code).toBeUndefined(); expect(result.text).toContain('Result: passed');
    for (const value of ['synthetic-session-secret', 'synthetic-key', 'service@example.invalid', 'mongodb://synthetic.invalid']) expect(result.text).not.toContain(value);
    expect(result.fetcher).not.toHaveBeenCalled();
  });
  it('AC05 shared mode still refuses missing shared settings', async () => {
    const result = await doctor({ NODE_ENV: 'development', USE_SHARED_SERVICES: '1' }, 'AUTH_TOKEN_SECRET=synthetic-session-secret');
    expect(result.text).toContain('Stores: shared'); expect(result.code).toBe(1); expect(result.text).toContain('Google Sheets auth storage is incomplete');
  });
  it('AC05 isolated runtime memory storage passes despite complete ignored shared settings', async () => {
    const result = await doctor({ NODE_ENV: 'development' }, complete, true, { status: 'ok', mode: 'isolated', auth: { storage: 'memory', configured: true }, content: { configured: false }, assets: { configured: false }, corsOrigins: ['http://localhost:4200'] });
    expect(result.code).toBeUndefined(); expect(result.text).toContain('Result: passed'); expect(result.fetcher).toHaveBeenCalledTimes(2);
  });
  it('AC05 detects a running API in a different mode', async () => {
    const result = await doctor({ NODE_ENV: 'development' }, complete, true, { status: 'ok', mode: 'shared', auth: { storage: 'google-sheets', configured: true }, content: { configured: true }, assets: { configured: true }, corsOrigins: ['http://localhost:4200'] });
    expect(result.code).toBe(1); expect(result.text).toContain('mode');
  });
  it.each([undefined, '0', '1', 'true', ' 1 '])('AC05 app-dev forwards opt-in unchanged: %j', async value => {
    vi.resetModules(); fixtures.concurrently.mockClear(); vi.stubEnv('USE_SHARED_SERVICES', value); process.argv = ['node', 'run-app-dev.mjs', '--host', '127.0.0.1'];
    await import('../../scripts/run-app-dev.mjs'); const [commands] = fixtures.concurrently.mock.calls[0] as unknown as [Array<{ command: string; env?: Record<string, string> }>];
    expect(commands[0].command).toBe('npm run api:dev'); expect(commands[1].command).toBe('npm run app:dev:frontend -- --host 127.0.0.1');
    if (value === undefined) expect(commands[0].env?.USE_SHARED_SERVICES).toBeUndefined(); else expect(commands[0].env?.USE_SHARED_SERVICES).toBe(value);
  });
  it.each(['isolated', 'shared', 'hosted'])('AC04 startup names only %s mode without setting values', async mode => {
    vi.resetModules(); const logs = vi.spyOn(console, 'log').mockImplementation(() => {}); const listen = vi.fn((_port: number, ready: () => void) => ready());
    vi.doMock('./config.js', () => ({ apiConfig: { PORT: 43210, mode, GOOGLE_PRIVATE_KEY: 'synthetic-key', MONGODB_URI: 'mongodb://synthetic.invalid' } }));
    vi.doMock('./server.js', () => ({ createServer: () => ({ listen }) })); await import('./index.js');
    expect(listen).toHaveBeenCalledOnce(); const lines = logs.mock.calls.map(args => args.join(' ')); expect(lines.filter(line => line.startsWith('Stores:'))).toEqual(['Stores: ' + mode]);
    expect(lines).toContain('QI Academy API listening on http://localhost:43210'); expect(lines.join('\n')).not.toContain('synthetic-key'); expect(lines.join('\n')).not.toContain('mongodb://synthetic.invalid');
  });
});
