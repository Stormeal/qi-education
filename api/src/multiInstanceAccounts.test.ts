import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createSessionToken, hashPassword, toAuthenticatedUser, type AuthUser } from './auth.js';
import { apiConfig } from './config.js';
import { createCourseSchema } from './course.js';
import { MongoCourseRepository } from './mongoCourseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { LocalMailSender } from './mailSender.js';
import { createServer } from './server.js';
import { authStoreDouble } from '../test/authStoreDouble.js';
import { fakeAuthCollection } from '../test/fakeAuthCollection.js';
import { fakeCourseCollection } from '../test/fakeCourseCollection.js';
import type { MongoAuthDocument } from './mongoAuthRepository.js';

const document: MongoAuthDocument = { _id: 'x2-user', email: 'x2@example.test', displayName: 'X2 Learner',
  passwordHash: 'unused-fixture-hash', role: 'student', status: 'active',
  createdAt: '2026-10-20T00:00:00.000Z', enrolledCourseIds: [], emailConfirmed: true };
const majority = { writeConcern: { w: 'majority' } };

describe('X2 Mongo account fake index fidelity', () => {
  it('does not enforce email uniqueness until the unique email index exists', async () => {
    const { operations, documents } = fakeAuthCollection();
    await operations.insertOne(document, majority);
    await operations.insertOne({ ...document, _id: 'duplicate-without-index' }, majority);
    expect(documents.size).toBe(2);
    await expect(operations.createIndex({ email: 1 }, { unique: true })).rejects.toMatchObject({ code: 11000 });
    // A failed index build must not suddenly enforce an index Mongo never created.
    await operations.insertOne({ ...document, _id: 'after-failed-index' }, majority);
    await expect(operations.insertOne(document, majority)).rejects.toMatchObject({ code: 11000 });
    expect(documents.size).toBe(3);
  });

  it('enforces an active unique email index on inserts and updates without normalizing for Mongo', async () => {
    const { operations, documents } = fakeAuthCollection();
    await operations.createIndex({ email: 1 }, { unique: true });
    await operations.insertOne(document, majority);
    await expect(operations.insertOne({ ...document, _id: 'same-email' }, majority)).rejects.toMatchObject({ code: 11000 });
    // Default Mongo string comparison is case sensitive; the repository normalizes.
    await operations.insertOne({ ...document, _id: 'uppercase', email: 'X2@EXAMPLE.TEST' }, majority);
    const other = { ...document, _id: 'other-email', email: 'other@example.test' };
    await operations.insertOne(other, majority);
    await expect(operations.findOneAndUpdate({ _id: other._id }, { $set: { email: document.email } },
      { returnDocument: 'after' })).rejects.toMatchObject({ code: 11000 });
    expect(documents.get(other._id)).toEqual(other);
    expect(documents.size).toBe(3);
  });
});

// Neither request can proceed past this boundary until both instances arrive.
// No sleeps or scheduling assumptions: signup reads both snapshot "not found",
// while independent-course enrollments both reach the Mongo write boundary.
function rendezvous() {
  let arrivals = 0, release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  return {
    get arrivals() { return arrivals; },
    async wait() { if (arrivals < 2 && ++arrivals === 2) release(); await ready; },
  };
}

describe.each(['', '/api'])('X2 INV-003 US-P003-AC04 two API instances (%s)', prefix => {
  const servers: Server[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  });

  async function setup() {
    expect(apiConfig.mode).toBe('isolated');
    const accounts = authStoreDouble(), catalog = fakeCourseCollection();
    const repositories = [accounts.repository(), accounts.repository()];
    const courses = [new MongoCourseRepository(async () => catalog.collection), new MongoCourseRepository(async () => catalog.collection)];
    const content = new InMemoryCourseContentRepository();
    // As in journey.test.ts: no real Mongo content/lock access. A shared memory
    // coordinator stands in for the unrelated course lock; account/catalog
    // operations still use the real Mongo adapters and shared fake collections.
    Object.defineProperty(content, 'storageType', { value: 'mongodb' });
    for (const id of ['x2-course-a', 'x2-course-b']) {
      await courses[0].createCourse(createCourseSchema.parse({ title: id, description: 'Isolated concurrency evidence.',
        teacher: 'X2 Teacher', level: 'Beginner', status: 'published', priceDkk: null }),
      { id, createdAt: '2026-10-20T00:00:00.000Z', ownerUserId: 'x2-teacher' });
      await content.createEmptyCourseContent(id);
    }
    const bases: string[] = [];
    for (const [index, auth] of repositories.entries()) {
      const app = createServer({ authRepository: auth, courseRepository: courses[index], courseContentRepository: content,
        courseAssetRepository: new InMemoryCourseAssetRepository(), feedbackRepository: new InMemoryFeedbackRepository(),
        mailSender: new LocalMailSender(() => {}), muxVideoService: null, muxWebhookService: null,
        gitHubFeedbackService: { createIssueFromFeedback: async () => { throw new Error('X2 must never call GitHub.'); } },
      });
      const server = app.listen(0, '127.0.0.1'); servers.push(server);
      await new Promise<void>(resolve => server.once('listening', resolve));
      bases.push(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    }
    const request = (instance: number, path: string, method = 'GET', body?: unknown, token?: string) => fetch(bases[instance] + prefix + path, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const seedLearner = async () => {
      const { _id, ...fields } = document;
      const user: AuthUser = { ...fields, id: _id, passwordHash: hashPassword('X2Password123!') };
      await repositories[0].createUser(user);
      return createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET);
    };
    const restoredEnrollments = async (token: string, expectedCourseIds: string[]) => {
      for (const instance of [0, 1]) {
        const response = await request(instance, '/auth/me', 'GET', undefined, token);
        expect(response.status).toBe(200);
        expect(response.headers.get('x-qi-education-auth-storage')).toBe('mongodb');
        expect((await response.json()).user.enrolledCourseIds.sort()).toEqual(expectedCourseIds);
      }
    };
    return { accounts, request, seedLearner, restoredEnrollments };
  }

  it('concurrent differently cased signups store one normalized account and clearly refuse the other', async () => {
    const { accounts, request } = await setup(), barrier = rendezvous();
    // Hold both preflight lookups after they read the empty shared collection.
    // A process-local signup queue cannot protect this deliberately forced race.
    accounts.beforeRead = () => barrier.wait();
    const input = { displayName: 'X2 Learner', password: 'X2Password123!' };
    const responses = await Promise.all([
      request(0, '/auth/signup', 'POST', { ...input, email: 'X2@EXAMPLE.TEST' }),
      request(1, '/auth/signup', 'POST', { ...input, email: 'x2@example.test' }),
    ]);
    expect(barrier.arrivals).toBe(2);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    const winner = await responses.find(response => response.status === 201)!.json();
    expect(winner.user).toMatchObject({ email: 'x2@example.test', role: 'student', enrolledCourseIds: [] });
    expect(await responses.find(response => response.status === 409)!.json()).toEqual({ message: 'An account with this email already exists' });
    expect(accounts.fake.documents.size).toBe(1);
    expect([...accounts.fake.documents.values()][0]).toMatchObject({ _id: winner.user.id, email: 'x2@example.test' });
    // Re-read through both app instances rather than trusting either signup DTO.
    for (const instance of [0, 1]) {
      const response = await request(instance, '/auth/me', 'GET', undefined, winner.token);
      expect(response.status).toBe(200);
      expect((await response.json()).user).toEqual(winner.user);
    }
  });

  it('concurrent enrollments in different courses both persist and are visible on both instances', async () => {
    const { accounts, request, seedLearner, restoredEnrollments } = await setup();
    const token = await seedLearner(), barrier = rendezvous();
    accounts.beforeWrite = field => field === 'enrolledCourseIds' ? barrier.wait() : Promise.resolve();
    const responses = await Promise.all([
      request(0, '/users/me/courses/x2-course-a', 'POST', undefined, token),
      request(1, '/users/me/courses/x2-course-b', 'POST', undefined, token),
    ]);
    expect(barrier.arrivals).toBe(2);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect([...accounts.fake.documents.get(document._id)!.enrolledCourseIds].sort()).toEqual(['x2-course-a', 'x2-course-b']);
    await restoredEnrollments(token, ['x2-course-a', 'x2-course-b']);
  });

  it('concurrent enrollment in the same course is stored once across instances', async () => {
    const { accounts, request, seedLearner, restoredEnrollments } = await setup();
    const token = await seedLearner();
    const responses = await Promise.all([
      request(0, '/users/me/courses/x2-course-a', 'POST', undefined, token),
      request(1, '/users/me/courses/x2-course-a', 'POST', undefined, token),
    ]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(accounts.fake.documents.get(document._id)!.enrolledCourseIds).toEqual(['x2-course-a']);
    await restoredEnrollments(token, ['x2-course-a']);
  });
});
