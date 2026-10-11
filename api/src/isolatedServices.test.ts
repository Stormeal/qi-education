import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
const providers = vi.hoisted(() => ({ sheets: vi.fn(() => { throw new Error('No shared Sheets call allowed'); }), mongo: vi.fn(() => { throw new Error('No shared Mongo call allowed'); }), mux: vi.fn(), dotenv: vi.fn() }));
vi.mock('dotenv', () => ({ config: providers.dotenv }));
vi.mock('./googleSheets.js', () => ({ createSheetsClient: providers.sheets, ensureWorksheetHeaders: providers.sheets }));
vi.mock('./mongo.js', () => ({ getMongoDatabase: providers.mongo }));
vi.mock('@mux/mux-node', () => ({ default: class { constructor() { providers.mux(); } } }));

const shared = {
  GOOGLE_SHEETS_SPREADSHEET_ID: 'synthetic-sheet-id', GOOGLE_SERVICE_ACCOUNT_EMAIL: 'service@example.invalid', GOOGLE_PRIVATE_KEY: 'synthetic-google-key',
  GOOGLE_SHEETS_COURSES_RANGE: 'SyntheticCourses!A:U', GOOGLE_SHEETS_USERS_RANGE: 'SyntheticUsers!A:H', GOOGLE_SHEETS_FEEDBACK_RANGE: 'SyntheticFeedback!A:M',
  GOOGLE_SHEET_ID: 'synthetic-legacy-id', GOOGLE_SHEETS_COURSES: 'SyntheticCourses!A:U', GOOGLE_SHEETS_USERS: 'SyntheticUsers!A:H',
  MONGODB_URI: 'mongodb://synthetic.invalid', MONGODB_DB_NAME: 'synthetic-db', MONGODB_COURSE_CONTENT_COLLECTION: 'synthetic-content', MONGODB_COURSE_ASSET_COLLECTION: 'synthetic-assets',
  MUX_TOKEN_ID: 'synthetic-mux-id', MUX_TOKEN_SECRET: 'synthetic-mux-secret', MUX_WEBHOOK_SECRET: 'synthetic-webhook', MUX_SIGNING_KEY_ID: 'synthetic-signing-id', MUX_SIGNING_PRIVATE_KEY: 'synthetic-signing-key', MUX_DEFAULT_PLAYBACK_POLICY: 'public',
  GITHUB_FEEDBACK_TOKEN: 'synthetic-github-token', GITHUB_FEEDBACK_REPOSITORY: 'synthetic/repository', GITHUB_FEEDBACK_PROJECT_ID: 'synthetic-project',
};
const matrix = [
  { NODE_ENV: undefined, USE_SHARED_SERVICES: undefined, want: 'isolated' },
  { NODE_ENV: 'development', USE_SHARED_SERVICES: '0', want: 'isolated' },
  { NODE_ENV: 'development', USE_SHARED_SERVICES: 'true', want: 'isolated' },
  { NODE_ENV: 'development', USE_SHARED_SERVICES: '01', want: 'isolated' },
  { NODE_ENV: 'development', USE_SHARED_SERVICES: ' 1 ', want: 'isolated' },
  { NODE_ENV: 'development', USE_SHARED_SERVICES: '1', want: 'shared' },
  { NODE_ENV: 'production', USE_SHARED_SERVICES: undefined, want: 'hosted' },
  { NODE_ENV: 'production', USE_SHARED_SERVICES: '0', want: 'hosted' },
  { NODE_ENV: 'production', USE_SHARED_SERVICES: '1', want: 'hosted' },
  { NODE_ENV: 'development', VERCEL: '1', USE_SHARED_SERVICES: '0', want: 'hosted' },
  { NODE_ENV: undefined, VERCEL: '', USE_SHARED_SERVICES: undefined, want: 'hosted' },
  { NODE_ENV: 'development', VERCEL: '0', USE_SHARED_SERVICES: '1', want: 'hosted' },
  { NODE_ENV: 'test', VERCEL: '1', USE_SHARED_SERVICES: '1', want: 'isolated' },
];
let servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function load(input: Record<string, string | undefined>, credentials = true) {
  vi.resetModules(); vi.clearAllMocks();
  for (const key of ['NODE_ENV', 'VERCEL', 'USE_SHARED_SERVICES', ...Object.keys(shared), 'BREVO_API_KEY', 'MAIL_FROM_ADDRESS', 'MAIL_FROM_NAME', 'APP_PUBLIC_URL']) vi.stubEnv(key, undefined);
  for (const [key, value] of Object.entries({ ...(credentials ? shared : {}), AUTH_TOKEN_SECRET: 'synthetic-auth-session-secret', PORT: '43210', CORS_ORIGIN: 'http://example.test', ...input })) vi.stubEnv(key, value);
  return import('./config.js');
}
async function factories() {
  const [auth, courses, content, assets, feedback, paths, progress, profiles, resets, mux, mail, config] = await Promise.all([
    import('./authRepository.js'), import('./courseRepository.js'), import('./courseContentRepository.js'), import('./courseAssetRepository.js'), import('./feedbackRepository.js'), import('./careerPathRepository.js'),
    import('./learningProgressRepository.js'), import('./instructorProfileRepository.js'), import('./passwordResetRepository.js'), import('./muxService.js'), import('./mailSender.js'), import('./config.js'),
  ]);
  return { auth: auth.createAuthRepository(), courses: courses.createCourseRepository(), content: content.createCourseContentRepository(), assets: assets.createCourseAssetRepository(), feedback: feedback.createFeedbackRepository(),
    paths: paths.createCareerPathRepository(), progress: progress.createLearningProgressRepository(), profiles: profiles.createInstructorProfileRepository(), resets: resets.createPasswordResetRepository(),
    video: mux.createMuxVideoService(), webhook: mux.createMuxWebhookService(), github: config.hasGitHubFeedbackConfig(), mail: mail.createMailSender() };
}
describe('US-P011 centralized service selection', () => {
  it.each([
    [{ NODE_ENV: 'production' }, {}],
    [{ NODE_ENV: 'development', VERCEL: '' }, { NODE_ENV: 'development' }],
    [{ NODE_ENV: 'production', VERCEL: '1' }, { NODE_ENV: 'test' }],
    [{ NODE_ENV: 'test' }, { VERCEL: '' }],
  ])('AC03 injected config uses only supplied markers despite ambient %j', async (ambient, source) => {
    const config = await load(ambient);
    const built = config.buildApiConfig(source);
    const hosted = source.VERCEL !== undefined;
    expect(built.mode).toBe(hosted ? 'hosted' : 'isolated');
    expect(built.AUTH_TOKEN_SECRET).toBe(hosted ? '' : 'local-dev-auth-secret');
  });

  it('DEF-030 ambient credentials cannot select assets, webhook or GitHub in tests', async () => {
    await load({ NODE_ENV: 'test', USE_SHARED_SERVICES: '1', VERCEL: '1' }); const selected = await factories();
    expect({ assets: selected.assets.constructor.name, webhook: selected.webhook?.constructor.name ?? null, github: selected.github }).toEqual({ assets: 'InMemoryCourseAssetRepository', webhook: null, github: false });
    expect(providers.mux).not.toHaveBeenCalled();
  });
  it.each(matrix)('AC01/02/03 mode and every factory for $NODE_ENV / $VERCEL / $USE_SHARED_SERVICES', async row => {
    const { want, ...input } = row; const config = await load(input); const selected = await factories();
    expect(config.apiConfig.mode).toBe(want);
    expect(Object.fromEntries(['auth', 'courses', 'content', 'assets', 'feedback', 'paths', 'progress', 'profiles', 'resets'].map(key => [key, selected[key as 'auth'].constructor.name]))).toEqual(want === 'isolated' ? {
      auth: 'InMemoryAuthRepository', courses: 'InMemoryCourseRepository', content: 'InMemoryCourseContentRepository', assets: 'InMemoryCourseAssetRepository', feedback: 'InMemoryFeedbackRepository',
      paths: 'InMemoryCareerPathRepository', progress: 'InMemoryLearningProgressRepository', profiles: 'InMemoryInstructorProfileRepository', resets: 'InMemoryPasswordResetRepository',
    } : { auth: 'GoogleSheetsAuthRepository', courses: 'GoogleSheetsCourseRepository', content: 'MongoCourseContentRepository', assets: 'MongoCourseAssetRepository', feedback: 'GoogleSheetsFeedbackRepository',
      paths: 'MongoCareerPathRepository', progress: 'MongoLearningProgressRepository', profiles: 'MongoInstructorProfileRepository', resets: 'MongoPasswordResetRepository' });
    expect(selected.video?.constructor.name ?? null).toBe(want === 'isolated' ? null : 'ConfiguredMuxVideoService');
    expect(selected.webhook?.constructor.name ?? null).toBe(want === 'isolated' ? null : 'ConfiguredMuxWebhookService'); expect(selected.github).toBe(want !== 'isolated');
    expect(selected.mail.provider).toBe(input.NODE_ENV === 'production' ? 'brevo' : 'local');
    expect(providers.sheets).not.toHaveBeenCalled(); expect(providers.mongo).not.toHaveBeenCalled(); expect(providers.mux).toHaveBeenCalledTimes(want === 'isolated' ? 0 : 2);
    if (want === 'isolated') {
      for (const role of ['student', 'teacher', 'admin']) expect((await selected.auth.findByEmail(`${role}@qi-education.local`))!.role).toBe(role);
      expect((await selected.courses.listCourses()).map(course => [course.id, course.title])).toEqual([['demo-course-1', 'Career Discovery Workshop']]);
      const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); const { ConfiguredGitHubFeedbackService } = await import('./githubFeedback.js');
      await expect(new ConfiguredGitHubFeedbackService().createIssueFromFeedback({} as never)).rejects.toThrow(/not configured/); expect(fetcher).not.toHaveBeenCalled();
    }
  });
  it.each(['development', 'test'])('AC01 hides aliases/invalid shared settings, keeping auth/HTTP/mail in %s', async nodeEnv => {
    const config = await load({ NODE_ENV: nodeEnv, MUX_DEFAULT_PLAYBACK_POLICY: 'signed' });
    const built = config.buildApiConfig({ NODE_ENV: nodeEnv, ...shared, GOOGLE_SERVICE_ACCOUNT_EMAIL: 'bad', GOOGLE_PRIVATE_KEY: '', MONGODB_URI: '', MUX_DEFAULT_PLAYBACK_POLICY: 'bad',
      PORT: '43210', CORS_ORIGIN: 'http://example.test', AUTH_TOKEN_SECRET: 'synthetic-auth-session-secret', BREVO_API_KEY: 'synthetic-mail-key', MAIL_FROM_ADDRESS: 'sender@example.invalid', APP_PUBLIC_URL: 'https://example.test' });
    expect(built.mode).toBe('isolated'); expect(built.PORT).toBe(43210); expect(built.AUTH_TOKEN_SECRET).toBe('synthetic-auth-session-secret'); expect(built.CORS_ORIGIN).toBe('http://example.test');
    for (const key of Object.keys(shared).filter(key => !key.endsWith('_RANGE') && key !== 'MUX_DEFAULT_PLAYBACK_POLICY')) expect(built[key as 'GOOGLE_PRIVATE_KEY']).toBeUndefined();
    expect(built.MUX_DEFAULT_PLAYBACK_POLICY).toBe('public'); expect(built.GOOGLE_SHEETS_COURSES_RANGE).toBe('Courses!A:R'); expect(built.GOOGLE_SHEETS_USERS_RANGE).toBe('Users!A:H');
    expect(built.BREVO_API_KEY).toBe(nodeEnv === 'test' ? undefined : 'synthetic-mail-key'); expect(built.MAIL_FROM_ADDRESS).toBe('sender@example.invalid');
    const selected = await factories(); expect(selected.video).toBeNull();
  });
  it.each([{ NODE_ENV: 'production' }, { NODE_ENV: 'development', VERCEL: '' }])('AC03 hosted missing settings never seed users or use a local reset/profile store: %j', async input => {
    const config = await load(input, false); const selected = await factories(); expect(config.apiConfig.mode).toBe('hosted');
    expect(await selected.auth.findByEmail('admin@qi-education.local')).toBeNull(); expect(selected.auth.unavailableReason).toMatch(/not configured/);
    await expect(selected.profiles.save('user', 'description')).rejects.toThrow(/unavailable/); await expect(selected.resets.reserve('user', 'hash', 1000)).rejects.toThrow(/unavailable/);
    const built = config.buildApiConfig({ ...input, USE_SHARED_SERVICES: '0' }); expect(built.AUTH_TOKEN_SECRET).toBe('');
    expect(selected.content.storageType).toBe('memory'); expect(selected.assets.storageType).toBe('memory'); expect(selected.video).toBeNull(); expect(selected.webhook).toBeNull();
  });
  it('AC03 hosted shared values and aliases remain unchanged and signed Mux remains rejected', async () => {
    const config = await load({ NODE_ENV: 'production' }); const built = config.buildApiConfig({ NODE_ENV: 'production', USE_SHARED_SERVICES: '0', ...shared, AUTH_TOKEN_SECRET: 'synthetic-auth-session-secret' });
    for (const [key, value] of Object.entries(shared)) expect(built[key as 'GOOGLE_PRIVATE_KEY']).toBe(value);
    const { createMuxVideoService } = await import('./muxService.js'); config.apiConfig.MUX_DEFAULT_PLAYBACK_POLICY = 'signed'; expect(createMuxVideoService).toThrow(/public/);
  });
  it.each(['', '/api'])('AC04 adds only health mode, preserves failed-demo-login memory header (%s)', async prefix => {
    await load({ NODE_ENV: 'development' }); const { createServer } = await import('./server.js'); const server = createServer().listen(0, '127.0.0.1'); servers.push(server);
    await new Promise<void>(resolve => server.once('listening', resolve)); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const health = await (await fetch(base + prefix + '/health/config')).json(); expect(health).toEqual({ status: 'ok', mode: 'isolated', auth: { configured: true, storage: 'memory' }, mail: { configured: false, provider: 'local' },
      content: { storage: 'memory', configured: false }, assets: { storage: 'memory', configured: false }, mux: { configured: false, playbackPolicy: 'public' }, corsOrigins: ['http://example.test'], ranges: { courses: 'Courses!A:R', users: 'Users!A:H', feedback: 'Feedback!A:M' } });
    const response = await fetch(base + prefix + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'student@qi-education.local', password: 'wrong' }) });
    expect(response.status).toBe(401); expect(response.headers.get('x-qi-education-auth-storage')).toBe('memory'); expect(await response.json()).toEqual({ message: 'Invalid email or password' });
    expect(providers.sheets).not.toHaveBeenCalled(); expect(providers.mongo).not.toHaveBeenCalled(); expect(providers.mux).not.toHaveBeenCalled();
  });
});
