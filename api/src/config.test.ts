import { describe, expect, it } from 'vitest';
import { apiConfig, getCorsOrigins, resolveAuthTokenSecret } from './config.js';

describe('API config', () => {
  it('uses a course sheet range that includes all course columns by default', () => {
    expect(apiConfig.GOOGLE_SHEETS_COURSES_RANGE).toBe('Courses!A:J');
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
});
