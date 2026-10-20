import { afterEach, describe, expect, it, vi } from 'vitest';
import { logError } from './errorLogger.js';

describe('DEF-049 diagnostic boundary', () => {
  afterEach(() => vi.restoreAllMocks());
  it('drops arbitrary names, codes, getters, messages and nested provider data', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const canary = 'PRIVATE_LOG_CANARY';
    const error = Object.assign(new Error(canary), { name: canary, code: canary,
      cause: { headers: { authorization: canary } }, toJSON: () => { throw new Error(canary); } });
    logError('Provider failed', error, { courseId: 'course-1', body: canary, uploadId: 'https://example.test/#token=' + canary });
    logError('Provider failed', Object.defineProperty({}, 'name', { get() { throw new Error(canary); } }));
    expect(log.mock.calls).toEqual([
      ['Provider failed', { errorClass: 'Error', courseId: 'course-1' }],
      ['Provider failed', { errorClass: 'Error' }],
    ]);
  });
  it('retains known diagnostic codes without logging wrapped causes', () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logError('Provider failed', Object.assign(new Error('private'), { name: 'TimeoutError', code: 'ETIMEDOUT', cause: new Error('secret') }), { status: 503 }, 'warn');
    expect(log.mock.calls).toEqual([['Provider failed', { errorClass: 'TimeoutError', errorCode: 'ETIMEDOUT', status: 503 }]]);
  });
});
