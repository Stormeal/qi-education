import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountProfileDocument } from './accountProfile.js';
import * as config from './config.js';
import {
  createAccountProfileRepository, InMemoryAccountProfileRepository,
  AccountProfileUnavailableError, MongoAccountProfileRepository, type AccountProfileCollection,
} from './accountProfileRepository.js';

const notificationPrefs = { reviewActivity: true, organization: true, adminInbox: true };
const input = { bio: 'Bio', jobTitle: 'Title', company: 'Company', learningGoals: 'Goals', avatarColor: '#2f4f43', notificationPrefs };

// Isolated document semantics at the driver's boundary; never connects to MongoDB.
function memoryCollection() {
  const rows = new Map<string, AccountProfileDocument>();
  const collection: AccountProfileCollection = {
    async findOne(filter) { return structuredClone(rows.get(filter._id) ?? null); },
    async updateOne(filter, update, options) {
      const existing = rows.has(filter._id);
      if (existing || options.upsert) rows.set(filter._id, structuredClone({ _id: filter._id, ...update.$set }));
      return { matchedCount: existing ? 1 : 0 };
    },
  };
  return collection;
}

describe.each(['memory', 'mongo-adapter'])('US-L003 profile storage (%s)', kind => {
  function fixture() {
    let now = new Date('2026-10-13T10:00:00.000Z');
    const options = { now: () => now };
    const collection = memoryCollection();
    return {
      profiles: kind === 'memory' ? new InMemoryAccountProfileRepository(options)
        : new MongoAccountProfileRepository(async () => collection, options),
      advance() { now = new Date('2026-10-13T11:00:00.000Z'); },
    };
  }

  it('AC01/03/06 replaces only the selected account and leaves never-saved accounts absent', async () => {
    const { profiles, advance } = fixture();
    expect(await profiles.get('one')).toBeNull();
    expect(await profiles.get('two')).toBeNull();
    const first = await profiles.save('one', input);
    expect(first).toEqual({ _id: 'one', ...input, updatedAt: '2026-10-13T10:00:00.000Z' });
    await profiles.save('two', { ...input, bio: 'Second' });
    advance();
    const replacement = { bio: '', jobTitle: 'New', company: '', learningGoals: 'New goal', avatarColor: '#FFFFFF', notificationPrefs };
    const saved = await profiles.save('one', replacement);
    expect(saved).toEqual({ _id: 'one', ...replacement, updatedAt: '2026-10-13T11:00:00.000Z' });
    expect(await profiles.get('one')).toEqual(saved);
    expect(await profiles.get('two')).toEqual({ _id: 'two', ...input, bio: 'Second', updatedAt: '2026-10-13T10:00:00.000Z' });
    expect(await profiles.get('missing')).toBeNull();
  });

  it('AC09 retains a saved all-empty profile with its timestamp', async () => {
    const { profiles } = fixture();
    const empty = { bio: '', jobTitle: '', company: '', learningGoals: '', avatarColor: '#2f4f43', notificationPrefs };
    await profiles.save('one', empty);
    expect(await profiles.get('one')).toEqual({ _id: 'one', ...empty, updatedAt: '2026-10-13T10:00:00.000Z' });
  });

  it('AC04 protects stored snapshots from caller mutations and strips input extras', async () => {
    const { profiles } = fixture();
    const body = { ...input, userId: 'two', _id: 'two', updatedAt: 'forged', passwordHash: 'private' };
    const result = await profiles.save('one', body);
    body.bio = 'Mutated input';
    result.bio = 'Mutated result';
    (await profiles.get('one'))!.company = 'Mutated read';
    expect(await profiles.get('one')).toEqual({ _id: 'one', ...input, updatedAt: '2026-10-13T10:00:00.000Z' });
    expect(await profiles.get('two')).toBeNull();
  });
});

describe('US-L003 Mongo boundary and store selection', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('AC04 stores all fields and ISO time in one acknowledged per-user upsert', async () => {
    const collection = memoryCollection();
    const write = vi.spyOn(collection, 'updateOne');
    const profiles = new MongoAccountProfileRepository(async () => collection, { now: () => new Date('2026-10-13T10:00:00Z') });
    await profiles.save('one', input);
    expect(write).toHaveBeenCalledExactlyOnceWith({ _id: 'one' },
      { $set: { ...input, updatedAt: '2026-10-13T10:00:00.000Z' } }, { upsert: true, writeConcern: { w: 'majority' } });
    expect(await profiles.get('one')).toEqual({ _id: 'one', ...input, updatedAt: '2026-10-13T10:00:00.000Z' });
  });

  it('AC04 retries a concurrent first-save duplicate without inserting a second record', async () => {
    const collection = memoryCollection();
    await collection.updateOne({ _id: 'one' }, { $set: { ...input, bio: 'Winner', updatedAt: '2026-10-13T09:00:00.000Z' } }, { upsert: true, writeConcern: { w: 'majority' } });
    const write = vi.spyOn(collection, 'updateOne').mockRejectedValueOnce({ code: 11000 });
    const profiles = new MongoAccountProfileRepository(async () => collection, { now: () => new Date('2026-10-13T10:00:00Z') });
    await profiles.save('one', input);
    expect(await profiles.get('one')).toEqual({ _id: 'one', ...input, updatedAt: '2026-10-13T10:00:00.000Z' });
    expect(write).toHaveBeenLastCalledWith({ _id: 'one' }, { $set: { ...input, updatedAt: '2026-10-13T10:00:00.000Z' } },
      { upsert: false, writeConcern: { w: 'majority' } });
  });

  it('AC08 reports failure when the duplicate retry target vanished', async () => {
    const collection = memoryCollection();
    const error = { code: 11000 };
    vi.spyOn(collection, 'updateOne').mockRejectedValueOnce(error);
    await expect(new MongoAccountProfileRepository(async () => collection).save('one', input)).rejects.toBe(error);
    expect(await collection.findOne({ _id: 'one' })).toBeNull();
  });

  it.each(['get', 'save'] as const)('AC08 propagates %s connection errors without memory fallback', async operation => {
    const failure = new Error('Offline');
    const profiles = new MongoAccountProfileRepository(async () => { throw failure; });
    await expect(operation === 'get' ? profiles.get('one') : profiles.save('one', input)).rejects.toBe(failure);
  });

  it('AC08 preserves an existing row on an unacknowledged write error and does not retry arbitrary failures', async () => {
    const collection = memoryCollection();
    const profiles = new MongoAccountProfileRepository(async () => collection);
    await profiles.save('one', input);
    const before = await profiles.get('one');
    const write = vi.spyOn(collection, 'updateOne').mockRejectedValue(new Error('Offline'));
    await expect(profiles.save('one', { ...input, bio: 'Rejected' })).rejects.toThrow('Offline');
    expect(write).toHaveBeenCalledTimes(1);
    expect(await profiles.get('one')).toEqual(before);
  });

  it.each(['test', 'development'])('AC06 uses isolated memory in %s even with configured Mongo or local opt-in', async mode => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('USE_SHARED_SERVICES', '1');
    vi.stubEnv('VERCEL', undefined);
    vi.spyOn(config, 'hasMongoConfig').mockReturnValue(true);
    const first = createAccountProfileRepository();
    const second = createAccountProfileRepository();
    expect(first).toBeInstanceOf(InMemoryAccountProfileRepository);
    await first.save('one', input);
    expect(await second.get('one')).toBeNull();
  });

  it.each(['production', 'vercel'])('AC04 selects configured hosted Mongo in %s without connecting', mode => {
    vi.stubEnv('NODE_ENV', mode === 'production' ? 'production' : 'development');
    vi.stubEnv('VERCEL', mode === 'vercel' ? '1' : undefined);
    vi.spyOn(config, 'hasMongoConfig').mockReturnValue(true);
    expect(createAccountProfileRepository()).toBeInstanceOf(MongoAccountProfileRepository);
  });

  it.each(['production', 'vercel'])('AC08 refuses temporary storage in %s without Mongo', async mode => {
    vi.stubEnv('NODE_ENV', mode === 'production' ? 'production' : 'development');
    vi.stubEnv('VERCEL', mode === 'vercel' ? '1' : undefined);
    vi.spyOn(config, 'hasMongoConfig').mockReturnValue(false);
    const profiles = createAccountProfileRepository();
    await expect(profiles.get('one')).rejects.toBeInstanceOf(AccountProfileUnavailableError);
    await expect(profiles.save('one', input)).rejects.toBeInstanceOf(AccountProfileUnavailableError);
  });
});
