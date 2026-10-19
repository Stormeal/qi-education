import { afterEach, describe, expect, it, vi } from 'vitest';
import * as config from './config.js';
import { createClientLimitRepository, InMemoryClientLimitRepository, MongoClientLimitRepository } from './clientLimitRepository.js';
import { fakeClientLimitCollection } from '../test/fakeClientLimitCollection.js';
import { getMongoDatabase } from './mongo.js';

vi.mock('./mongo.js', () => ({ getMongoDatabase: vi.fn(async () => { throw new Error('No real MongoDB allowed'); }) }));
afterEach(() => vi.restoreAllMocks());
const hour = 3600000;
const key = 'a'.repeat(64);

describe.each(['memory', 'mongodb'])('US-P008-AC05/AC06 atomic client counts (%s)', kind => {
  function setup() {
    const fake = fakeClientLimitCollection();
    const memory = new InMemoryClientLimitRepository();
    const one = kind === 'memory' ? memory : new MongoClientLimitRepository(async () => fake.collection);
    const two = kind === 'memory' ? memory : new MongoClientLimitRepository(async () => fake.collection);
    return { one, two, fake };
  }
  it('parallel callers sharing storage each receive a distinct atomic count', async () => {
    const { one, two } = setup();
    const counts = await Promise.all(Array.from({ length: 50 }, (_, i) => (i % 2 ? one : two).increment(key, 0, hour)));
    expect(counts.sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(counts.filter(count => count <= 10)).toHaveLength(10);
    expect(counts.filter(count => count <= 20)).toHaveLength(20);
  });
  it('a new window starts afresh even before TTL cleanup, and an old request cannot reset it', async () => {
    const { one, two } = setup();
    expect(await one.increment(key, 0, hour)).toBe(1);
    expect(await two.increment(key, hour, 2 * hour)).toBe(1);
    await one.increment(key, 0, hour);
    expect(await two.increment(key, hour, 2 * hour)).toBe(2);
    expect(await two.increment('b'.repeat(64), hour, 2 * hour)).toBe(1);
  });
});

describe('US-P008 Mongo client-limit operations', () => {
  it('uses the dedicated client_limits collection through an isolated database double', async () => {
    const fake = fakeClientLimitCollection(), collection = vi.fn(() => fake.collection);
    const previous = config.apiConfig.MONGODB_COURSE_CONTENT_COLLECTION;
    config.apiConfig.MONGODB_COURSE_CONTENT_COLLECTION = 'synthetic_content';
    vi.mocked(getMongoDatabase).mockResolvedValueOnce({ collection } as never);
    try {
      expect(await new MongoClientLimitRepository().increment(key, 0, hour)).toBe(1);
      expect(collection).toHaveBeenCalledWith('synthetic_content_client_limits');
    } finally { config.apiConfig.MONGODB_COURSE_CONTENT_COLLECTION = previous; }
  });
  it('uses $inc upsert, returns the updated count, and creates a TTL index once per repository', async () => {
    const fake = fakeClientLimitCollection();
    const repo = new MongoClientLimitRepository(async () => fake.collection);
    expect(await repo.increment(key, 0, hour)).toBe(1);
    expect(await repo.increment(key, 0, hour)).toBe(2);
    expect(fake.indexes).toEqual([{ keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0, timeoutMS: 5000 } }]);
    expect(fake.updates).toEqual(Array(2).fill({ filter: { _id: `${key}:0` },
      update: { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(hour) } },
      options: { upsert: true, returnDocument: 'after', includeResultMetadata: false, writeConcern: { w: 'majority' }, timeoutMS: 5000 } }));
    expect([...fake.documents.values()]).toEqual([{ _id: `${key}:0`, count: 2, expiresAt: new Date(hour) }]);
  });
  it('retries a simultaneous first-upsert duplicate rather than allowing an uncounted request', async () => {
    const fake = fakeClientLimitCollection();
    const one = new MongoClientLimitRepository(async () => fake.collection);
    const two = new MongoClientLimitRepository(async () => fake.collection);
    await one.increment(key, 0, hour);
    vi.spyOn(fake.collection, 'findOneAndUpdate').mockRejectedValueOnce(Object.assign(new Error('Duplicate'), { code: 11000 }));
    expect(await two.increment(key, 0, hour)).toBe(2);
  });
  it('retries TTL index setup after failure instead of retaining a rejected promise', async () => {
    const fake = fakeClientLimitCollection();
    vi.spyOn(fake.collection, 'createIndex').mockRejectedValueOnce(new Error('Unavailable'));
    const repo = new MongoClientLimitRepository(async () => fake.collection);
    await expect(repo.increment(key, 0, hour)).rejects.toThrow('Unavailable');
    expect(await repo.increment(key, 0, hour)).toBe(1);
  });
  it('requires a confirmed counter result and propagates non-duplicate storage errors', async () => {
    const fake = fakeClientLimitCollection();
    const update = vi.spyOn(fake.collection, 'findOneAndUpdate').mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('Offline'));
    const repo = new MongoClientLimitRepository(async () => fake.collection);
    await expect(repo.increment(key, 0, hour)).rejects.toThrow('not confirmed');
    await expect(repo.increment(key, 0, hour)).rejects.toThrow('Offline');
    expect(update).toHaveBeenCalledTimes(2);
  });
  it.each(['isolated', 'shared', 'hosted'] as const)('selects safe storage in %s mode without contacting providers', async mode => {
    vi.spyOn(config, 'getServicesMode').mockReturnValue(mode);
    const mongoConfig = vi.spyOn(config, 'hasMongoConfig').mockReturnValue(true);
    expect(createClientLimitRepository()).toBeInstanceOf(mode === 'isolated' ? InMemoryClientLimitRepository : MongoClientLimitRepository);
    mongoConfig.mockReturnValue(false);
    const missing = createClientLimitRepository();
    if (mode === 'isolated') expect(missing).toBeInstanceOf(InMemoryClientLimitRepository);
    else await expect(missing.increment(key, 0, hour)).rejects.toThrow('unavailable');
  });
});
