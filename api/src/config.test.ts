import { describe, expect, it } from 'vitest';
import {
  apiConfig,
  getCorsOrigins,
  hasMongoConfigValues,
  resolveAuthTokenSecret,
} from './config.js';

describe('API config', () => {
  it('uses the feedback sheet range by default', () => {
    expect(apiConfig.GOOGLE_SHEETS_FEEDBACK_RANGE).toBe('Feedback!A:M');
  });

  it('allows the local auth token fallback outside production', () => {
    expect(resolveAuthTokenSecret(undefined, undefined, 'development')).toBe('local-dev-auth-secret');
    expect(resolveAuthTokenSecret(undefined, undefined, 'test')).toBe('local-dev-auth-secret');
  });

  it('leaves production auth unavailable when the secret is missing', () => {
    expect(resolveAuthTokenSecret(undefined, undefined, 'production')).toBe('');
  });

  it('uses the legacy session secret when auth token secret is missing', () => {
    expect(resolveAuthTokenSecret(undefined, 'a-legacy-session-secret', 'production')).toBe(
      'a-legacy-session-secret',
    );
  });

  it('uses an explicit auth token secret when provided', () => {
    expect(resolveAuthTokenSecret('a-production-grade-secret', 'a-legacy-session-secret', 'production')).toBe(
      'a-production-grade-secret',
    );
  });

  it('includes GitHub Pages in the default CORS origins', () => {
    expect(getCorsOrigins()).toContain('https://stormeal.github.io');
  });

  it('recognizes a complete MongoDB config set', () => {
    expect(
      hasMongoConfigValues(
        'mongodb+srv://user:secret@example.mongodb.net/?retryWrites=true&w=majority',
        'QIEducation',
        'courseContent',
      ),
    ).toBe(true);
  });

  it('rejects incomplete MongoDB config values', () => {
    expect(hasMongoConfigValues(undefined, 'QIEducation', 'courseContent')).toBe(false);
    expect(hasMongoConfigValues('mongodb+srv://example', undefined, 'courseContent')).toBe(false);
    expect(hasMongoConfigValues('mongodb+srv://example', 'QIEducation', undefined)).toBe(false);
  });
});

describe('tests never see real service settings', () => {
  it('runs without the credentials in api/.env, whatever NODE_ENV the shell had', async () => {
    const { apiConfig } = await import('./config.js');
    expect(process.env.NODE_ENV).toBe('test');
    for (const name of ['MONGODB_URI', 'GOOGLE_PRIVATE_KEY', 'MUX_TOKEN_ID', 'GITHUB_FEEDBACK_TOKEN', 'BREVO_API_KEY'] as const) {
      expect(apiConfig[name], name).toBeUndefined();
    }
  });
});
