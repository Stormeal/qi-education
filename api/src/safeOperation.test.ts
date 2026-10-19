import { InMemorySignInAttemptRepository } from './signInAttemptRepository.js';
vi.mock('./mongo.js', () => ({ getMongoDatabase: () => { throw new Error('No real Mongo'); } }));
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiConfig } from './config.js';
import { createAuthRepository, MongoAuthRepository, type AuthRepository } from './authRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { createServer } from './server.js';

// Imported in NODE_ENV=test: never loads api/.env. Production simulation uses
// synthetic settings and explicit memory dependencies, never shared providers.
describe('US-P008-AC01 safe production authentication (INV-013 / DEF-017)', () => {
  const originalConfig = { ...apiConfig };
  let server: Server | undefined;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    Object.assign(apiConfig, {
      AUTH_TOKEN_SECRET: 'isolated-production-session-secret',
      GOOGLE_SHEETS_SPREADSHEET_ID: undefined,
      GOOGLE_SERVICE_ACCOUNT_EMAIL: undefined,
      GOOGLE_PRIVATE_KEY: undefined,
      MONGODB_URI: undefined,
      MONGODB_DB_NAME: undefined,
      MONGODB_COURSE_CONTENT_COLLECTION: undefined,
    });
  });
  afterEach(async () => {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    server = undefined;
    Object.assign(apiConfig, originalConfig);
    vi.unstubAllEnvs();
  });

  function start(authRepository = createAuthRepository()) {
    server = createServer({
      authRepository,
      signInAttemptRepository: new InMemorySignInAttemptRepository(),
      courseRepository: new InMemoryCourseRepository(),
      courseContentRepository: new InMemoryCourseContentRepository(),
      courseAssetRepository: new InMemoryCourseAssetRepository(),
      feedbackRepository: new InMemoryFeedbackRepository(),
      careerPathRepository: new InMemoryCareerPathRepository(),
      learningProgressRepository: new InMemoryLearningProgressRepository(),
      gitHubFeedbackService: { async createIssueFromFeedback() { throw new Error('Shared services forbidden'); } },
      muxVideoService: null, muxWebhookService: null,
    }).listen(0);
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  const credentials = (role: string) => ({ email: `${role}@qi-education.local`, password: 'Password123!' });
  const post = (base: string, path: string, body: unknown) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  it.each(['student', 'teacher', 'admin'])('contains no default demo %s account without production user settings', async (role) => {
    const auth = createAuthRepository();
    expect(await auth.findByEmail(credentials(role).email)).toBeNull();
  });

  it.each(['/auth/login', '/login', '/api/auth/login', '/api/login'])('refuses demo sessions on %s with a clear 503', async (path) => {
    const response = await post(start(), path, credentials('admin'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: expect.stringMatching(/user store.*not configured/i) });
  });

  it.each(['/auth/signup', '/signup', '/api/auth/signup', '/api/signup'])('refuses signup on %s without adding a user', async (path) => {
    const auth = createAuthRepository();
    const response = await post(start(auth), path, { ...credentials('new'), displayName: 'Isolated student' });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: expect.stringMatching(/user store.*not configured/i) });
    expect(await auth.findByEmail(credentials('new').email)).toBeNull();
  });

  it('reports missing user configuration in existing health shapes without exposing settings', async () => {
    const base = start();
    const health = await fetch(base + '/api/health/auth');
    expect(health.status).toBe(503);
    expect(await health.json()).toEqual({ status: 'unavailable', message: expect.stringMatching(/user store.*not configured/i) });
    const config = await (await fetch(base + '/api/health/config')).json();
    expect(config.auth).toEqual({ configured: false, storage: 'mongodb' });
    expect(JSON.stringify(config)).not.toContain(apiConfig.AUTH_TOKEN_SECRET);
  });

  it.each(['/auth/me', '/me', '/api/me', '/api/users/me/career-path'])('reports unavailable authentication on protected %s', async (path) => {
    const response = await fetch(start() + path, { headers: { authorization: 'Bearer invalid-session' } });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: expect.stringMatching(/user store.*not configured/i) });
  });

  it('still reports a missing session secret through the existing health response', async () => {
    apiConfig.AUTH_TOKEN_SECRET = '';
    const response = await fetch(start() + '/health/auth');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', message: 'AUTH_TOKEN_SECRET is required for authentication.' });
  });

  it('continues to use demo accounts in test mode even with provider settings present', async () => {
    Object.assign(apiConfig, { MONGODB_URI: 'mongodb://synthetic.invalid', MONGODB_DB_NAME: 'synthetic', MONGODB_COURSE_CONTENT_COLLECTION: 'synthetic' });
    vi.stubEnv('NODE_ENV', 'test');
    expect((await createAuthRepository().findByEmail(credentials('admin').email))?.role).toBe('admin');
  });

  it.each(['MONGODB_URI', 'MONGODB_DB_NAME', 'MONGODB_COURSE_CONTENT_COLLECTION'] as const)(
    'does not create demo accounts when only %s is missing', async (missing) => {
      Object.assign(apiConfig, { MONGODB_URI: 'mongodb://synthetic.invalid', MONGODB_DB_NAME: 'synthetic', MONGODB_COURSE_CONTENT_COLLECTION: 'synthetic' });
      apiConfig[missing] = undefined;
      expect(await createAuthRepository().findByEmail(credentials('admin').email)).toBeNull();
    },
  );

  it('selects configured production storage without accessing a provider', () => {
    Object.assign(apiConfig, { MONGODB_URI: 'mongodb://synthetic.invalid', MONGODB_DB_NAME: 'synthetic', MONGODB_COURSE_CONTENT_COLLECTION: 'synthetic' });
    expect(createAuthRepository()).toBeInstanceOf(MongoAuthRepository);
  });

  it('keeps a configured production repository usable with the existing response shape', async () => {
    // Inject a pre-existing isolated account instead of contacting MongoDB.
    vi.stubEnv('NODE_ENV', 'test');
    const memory = createAuthRepository();
    const account = (await memory.findByEmail(credentials('teacher').email))!;
    vi.stubEnv('NODE_ENV', 'production');
    const configured: AuthRepository = {
      findByEmail: async (email) => email === account.email ? account : null,
      findById: async (id) => id === account.id ? account : null,
      createUser: async (user) => user,
      enrollUserInCourse: async () => account,
    };
    const base = start(configured);
    const login = await post(base, '/login', credentials('teacher'));
    expect(login.status).toBe(200);
    const session = await login.json();
    expect(Object.keys(session).sort()).toEqual(['permissions', 'token', 'user']);
    const me = await fetch(base + '/me', { headers: { authorization: `Bearer ${session.token}` } });
    expect(me.status).toBe(200);
    expect((await me.json()).user.id).toBe(account.id);
  });

  it.each(['development', 'test', undefined])('retains demo login and signup when NODE_ENV is %s', async (mode) => {
    vi.stubEnv('NODE_ENV', mode);
    const base = start();
    for (const role of ['student', 'teacher', 'admin']) {
      const login = await post(base, '/login', credentials(role));
      expect(login.status).toBe(200);
      expect((await login.json()).user.role).toBe(role);
    }
    expect((await post(base, '/signup', { ...credentials('new'), displayName: 'Local student' })).status).toBe(201);
  });
});
