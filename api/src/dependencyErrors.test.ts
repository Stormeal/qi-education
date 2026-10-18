import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthUnavailableError, InMemoryAuthRepository } from './authRepository.js';
import { AuthReadOnlyError, DuplicateAccountError } from './authStore.js';
import { CareerPathConflictError, CareerPathSchemaError } from './careerPathRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { CourseReadOnlyError, CourseStoreUnavailableError } from './courseStore.js';
import { CourseReviewError } from './courseReview.js';
import { createServer } from './server.js';

const storageMessage = 'Storage is temporarily unavailable. Please try again.';
const mongoFailure = (name: string) => Object.assign(new Error('Connection to private-db.internal:27017 timed out'), { name });

describe.each(['', '/api'])('US-P002-AC02 dependency errors (%s)', prefix => {
  let server: Server, base: string, courses: InMemoryCourseRepository;
  beforeEach(() => {
    courses = new InMemoryCourseRepository();
    server = createServer({ authRepository: new InMemoryAuthRepository(), courseRepository: courses,
      muxVideoService: null, muxWebhookService: null }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${prefix}`;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  async function failureResponse(error: unknown) {
    vi.spyOn(courses, 'listCourses').mockRejectedValueOnce(error);
    return fetch(base + '/courses');
  }

  it.each([new AuthUnavailableError(), new CourseStoreUnavailableError()])(
    'US-P002-AC02 store outages are retryable and preserve the message: %s', async error => {
      const response = await failureResponse(error);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ message: error.message, code: 'STORE_UNAVAILABLE', retryable: true });
    });

  it.each([new AuthReadOnlyError(), new CourseReadOnlyError()])(
    'US-P002-AC02 maintenance freezes are not retryable: %s', async error => {
      const response = await failureResponse(error);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ message: error.message, code: 'READ_ONLY', retryable: false });
    });

  describe.each(['MongoServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoNotConnectedError'])(
    '%s', name => {
      it.each(['direct', 'wrapped', 'nested'])(
        'US-P002-AC02 returns a safe retryable 503 for a %s Mongo connection failure', async wrapping => {
          const mongo = mongoFailure(name);
          const error = wrapping === 'direct' ? mongo : wrapping === 'wrapped' ? new Error('private wrapper', { cause: mongo })
            : new Error('private outer', { cause: new Error('private inner', { cause: mongo }) });
          const response = await failureResponse(error);
          expect(response.status).toBe(503);
          expect(await response.json()).toEqual({ message: storageMessage, code: 'STORE_UNAVAILABLE', retryable: true });
        });
    });

  it.each(['MongoServerError', 'MongoParseError', 'MongoError', 'Error'])(
    'US-P002-AC02 other errors keep the generic 500: %s', async name => {
      const response = await failureResponse(mongoFailure(name));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ message: 'Unexpected server error' });
    });

  it('US-P002-AC02 unknown cyclic causes keep the generic 500', async () => {
    const error = new Error('private cyclic cause');
    error.cause = error;
    const response = await failureResponse(error);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'Unexpected server error' });
  });

  it.each([
    { error: new CareerPathConflictError(), status: 409, code: 'CAREER_PATH_CONFLICT' },
    { error: new CareerPathSchemaError(), status: 409, code: 'career-path-schema' },
    { error: new CourseReviewError(409, 'Review conflict', undefined, 'REVIEW_CONFLICT'), status: 409, code: 'REVIEW_CONFLICT' },
    { error: new DuplicateAccountError(), status: 409 },
  ])('US-P002-AC02 preserves existing domain responses: $error', async ({ error, status, code }) => {
    error.cause = mongoFailure('MongoNetworkError');
    const response = await failureResponse(error);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ message: error.message, ...(code ? { code } : {}) });
  });
});
