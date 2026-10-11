import { afterEach, describe, expect, it, vi } from 'vitest';
import * as config from './config.js';
import { createPasswordResetRepository, InMemoryPasswordResetRepository, MongoPasswordResetRepository,
  type PasswordResetDocument, type PasswordResetCollection } from './passwordResetRepository.js';

export function isolatedResetCollection() {
  const documents = new Map<string, PasswordResetDocument>();
  const collection: PasswordResetCollection = {
    async findOne(filter) { return structuredClone(filter._id ? documents.get(filter._id) ?? null
      : [...documents.values()].find(doc => doc.tokens.some(token => token.hash === filter['tokens.hash'])) ?? null); },
    async insertOne(document) {
      if (documents.has(document._id)) throw { code: 11000 };
      documents.set(document._id, structuredClone(document));
    },
    async replaceOne(filter, document) {
      const current = documents.get(filter._id);
      if (current?.version !== filter.version) return { matchedCount: 0 };
      documents.set(document._id, structuredClone(document)); return { matchedCount: 1 };
    },
  };
  return { collection, documents };
}
describe.each(['memory', 'mongo-cas'])('Reset token atomic storage (%s)', kind => {
  function create() { const store = isolatedResetCollection(); return { ...store,
    repository: kind === 'memory' ? new InMemoryPasswordResetRepository() : new MongoPasswordResetRepository(async () => store.collection) }; }
  it('reserves at most three concurrent slots across repository instances', async () => {
    const store = create(); const second = kind === 'memory' ? store.repository : new MongoPasswordResetRepository(async () => store.collection);
    const reservations = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      (index % 2 ? second : store.repository).reserve('user', `hash-${index}`, 1000)));
    expect(reservations.filter(Boolean)).toHaveLength(3);
    expect(await store.repository.reserve('another-user', 'different', 1000)).toBe(true);
  });
  it('pending and expired hashes cannot be used; activation, check and consumption are single use', async () => {
    const store = create(); const { repository } = store; await repository.reserve('user', 'hash', 1000);
    expect(await repository.findActive('hash', 1000)).toBeNull();
    expect(await repository.consume('hash', 1000)).toBeNull();
    expect(await repository.activate('user', 'hash')).toBe(true);
    expect(await repository.findActive('hash', 1000)).toEqual({ userId: 'user', hash: 'hash' });
    expect(await repository.findActive('hash', 1000)).not.toBeNull();
    const second = kind === 'memory' ? repository : new MongoPasswordResetRepository(async () => store.collection);
    const results = await Promise.all([repository.consume('hash', 1000), second.consume('hash', 1000)]);
    expect(results.filter(Boolean)).toEqual(['user']);
    expect(await repository.findActive('hash', 1000)).toBeNull();
  });
  it('keeps pending records unusable and frees capacity at exact expiry without reviving expired tokens', async () => {
    const { repository } = create();
    for (const hash of ['one', 'two', 'three']) { await repository.reserve('user', hash, 1000); await repository.activate('user', hash); }
    expect(await repository.findActive('one', 1000 + 3600000)).toBeNull();
    expect(await repository.reserve('user', 'new', 1000 + 3600000)).toBe(true);
    expect(await repository.findActive('new', 1000 + 3600000)).toBeNull();
    expect(await repository.activate('user', 'one')).toBe(false);
    expect(await repository.reserve('user', 'retry', 1000 + 3600000)).toBe(true);
  });
});
describe('Reset Mongo failure, hash storage and factory', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  it('stores hash-only records, bounded to the rolling hour, with acknowledged conditional replacements', async () => {
    const { collection, documents } = isolatedResetCollection(); const writes = vi.spyOn(collection, 'replaceOne');
    const repository = new MongoPasswordResetRepository(async () => collection);
    await repository.reserve('user', 'a'.repeat(64), 0); await repository.activate('user', 'a'.repeat(64));
    await repository.consume('a'.repeat(64), 0);
    expect(documents.get('user')).toMatchObject({ _id: 'user', tokens: [{ hash: 'a'.repeat(64), state: 'used', createdAt: 0, expiresAt: 3600000 }] });
    expect(writes).toHaveBeenLastCalledWith({ _id: 'user', version: 1 }, expect.objectContaining({ version: 2 }),
      { upsert: false, writeConcern: { w: 'majority' } });
    expect(await repository.activate('user', 'a'.repeat(64))).toBe(false);
    expect(await repository.findActive('a'.repeat(64), 0)).toBeNull();
  });
  it('does not hide arbitrary collection write failures as collision retries', async () => {
    const { collection } = isolatedResetCollection(); const writes = vi.spyOn(collection, 'insertOne').mockRejectedValue(new Error('Offline'));
    await expect(new MongoPasswordResetRepository(async () => collection).reserve('user', 'hash', 0)).rejects.toThrow('Offline');
    expect(writes).toHaveBeenCalledTimes(1);
  });
  it('keeps a pending record unusable if activation storage fails', async () => {
    const { collection } = isolatedResetCollection(); const repository = new MongoPasswordResetRepository(async () => collection);
    await repository.reserve('user', 'hash', 0);
    vi.spyOn(collection, 'replaceOne').mockRejectedValueOnce(new Error('Offline'));
    await expect(repository.activate('user', 'hash')).rejects.toThrow('Offline');
    expect(await repository.findActive('hash', 0)).toBeNull();
  });
  it('uses memory for tests and refuses missing Mongo in production', async () => {
    expect(createPasswordResetRepository()).toBeInstanceOf(InMemoryPasswordResetRepository);
    vi.stubEnv('NODE_ENV', 'production'); vi.spyOn(config, 'hasMongoConfig').mockReturnValue(false);
    await expect(createPasswordResetRepository().reserve('user', 'hash', 0)).rejects.toThrow();
    vi.spyOn(config, 'hasMongoConfig').mockReturnValue(true);
    expect(createPasswordResetRepository()).toBeInstanceOf(MongoPasswordResetRepository);
  });
  it.each(['test', 'development', ''])('never selects configured Mongo outside production (%s)', mode => {
    vi.stubEnv('NODE_ENV', mode); vi.spyOn(config, 'hasMongoConfig').mockReturnValue(true);
    expect(createPasswordResetRepository()).toBeInstanceOf(InMemoryPasswordResetRepository);
  });
});
