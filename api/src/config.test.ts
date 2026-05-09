import { describe, expect, it } from 'vitest';
import { apiConfig, resolveAuthTokenSecret } from './config.js';

describe('API config', () => {
  it('uses a course sheet range that includes all course columns by default', () => {
    expect(apiConfig.GOOGLE_SHEETS_COURSES_RANGE).toBe('Courses!A:J');
  });

  it('allows the local auth token fallback outside production', () => {
    expect(resolveAuthTokenSecret(undefined, 'development')).toBe('local-dev-auth-secret');
    expect(resolveAuthTokenSecret(undefined, 'test')).toBe('local-dev-auth-secret');
  });

  it('leaves production auth unavailable when the secret is missing', () => {
    expect(resolveAuthTokenSecret(undefined, 'production')).toBe('');
  });

  it('uses an explicit auth token secret when provided', () => {
    expect(resolveAuthTokenSecret('a-production-grade-secret', 'production')).toBe(
      'a-production-grade-secret',
    );
  });
});
