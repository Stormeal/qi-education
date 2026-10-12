import { afterEach, describe, expect, it, vi } from 'vitest';
import * as config from './config.js';
import { createSignInAttemptRepository, InMemorySignInAttemptRepository, MongoSignInAttemptRepository,
  type SignInAttemptCollection, type SignInAttemptDocument, type SignInAttemptRepository } from './signInAttemptRepository.js';
import { signInAddressKey, SignInLimit } from './signInLimit.js';
import { setTimeout as delay } from 'node:timers/promises';

const policy = { limit: 10, windowMs: 900000, lockMs: 900000 };
export function isolatedSignInCollection() {
  const documents = new Map<string, SignInAttemptDocument>();
  const collection: SignInAttemptCollection = {
    async createIndex() {},
    async findOne(filter) { return structuredClone(documents.get(filter._id) ?? null); },
    async insertOne(document) {
      if (documents.has(document._id)) throw { code: 11000 };
      documents.set(document._id, structuredClone(document));
    },
    async replaceOne(filter, document) {
      if (documents.get(filter._id)?.revision !== filter.revision) return { matchedCount: 0 };
      documents.set(document._id, structuredClone(document)); return { matchedCount: 1 };
    },
  };
  return { collection, documents };
}
async function ticket(store: SignInAttemptRepository, now = 1000, key = 'key') {
  const reserved = await store.reserve(key, now, policy);
  expect(reserved).toHaveProperty('ticket');
  if (!('ticket' in reserved)) throw new Error('Expected admission');
  return reserved.ticket;
}
describe.each(['memory', 'mongo-cas'])('AC02 atomic attempt transitions (%s)', kind => {
  function stores() {
    const data = isolatedSignInCollection();
    const first = kind === 'memory' ? new InMemorySignInAttemptRepository() : new MongoSignInAttemptRepository(async () => data.collection);
    const second = kind === 'memory' ? first : new MongoSignInAttemptRepository(async () => data.collection);
    return { ...data, first, second };
  }
  it('08 reserves no more than ten overlapping checks across instances and locks after their failures', async () => {
    const { first, second } = stores();
    const results = await Promise.all(Array.from({ length: 30 }, (_, index) => (index % 2 ? first : second).reserve('key', 1000, policy)));
    const admitted = results.filter(result => 'ticket' in result);
    expect(admitted).toHaveLength(10); expect(results.filter(result => 'busy' in result)).toHaveLength(20);
    await Promise.all(admitted.map(result => first.complete('key', result.ticket, 'failure', 2000, policy)));
    expect(await second.reserve('key', 2000, policy)).toEqual({ lockedUntil: 902000 });
    expect(await second.reserve('key', 901999, policy)).toEqual({ lockedUntil: 902000 });
    expect(await second.reserve('key', 902000, policy)).toHaveProperty('ticket');
  });
  it('08 releases operational failures without counting them and reclaims crashed reservations', async () => {
    const { first } = stores();
    const pending = await Promise.all(Array.from({ length: 10 }, () => ticket(first)));
    await first.complete('key', pending[0], 'cancel', 1000, policy);
    expect(await first.reserve('key', 1000, policy)).toHaveProperty('ticket');
    expect(await first.reserve('key', 900999, policy)).toEqual({ busy: true, retryAt: 901000 });
    const reclaimed = await ticket(first, 901000);
    await first.complete('key', reclaimed, 'cancel', 901000, policy);
    await first.complete('key', pending[1], 'failure', 901000, policy);
    // Expired worker completions must not count after capacity has been reclaimed.
    for (let index = 0; index < 9; index++) await first.complete('key', await ticket(first, 901000), 'failure', 901000, policy);
    expect(await first.reserve('key', 901000, policy)).toHaveProperty('ticket');
  });
  it('05/06 ignores stale outcomes and duplicate completion after clearing attempts', async () => {
    const { first, second } = stores(); const old = await ticket(first);
    await second.clear('key', 1000);
    await first.complete('key', old, 'failure', 1000, policy);
    for (let index = 0; index < 9; index++) {
      const next = await ticket(second);
      await second.complete('key', next, 'failure', 1000, policy);
      await second.complete('key', next, 'failure', 1000, policy);
    }
    expect(await first.reserve('key', 1000, policy)).toHaveProperty('ticket');
  });
  it('07 ages failures independently in a rolling window', async () => {
    const { first } = stores();
    await first.complete('key', await ticket(first, 0), 'failure', 0, policy);
    for (let index = 0; index < 8; index++) await first.complete('key', await ticket(first, 100), 'failure', 100, policy);
    await first.complete('key', await ticket(first, 900000), 'failure', 900000, policy);
    expect(await first.reserve('key', 900000, policy)).toHaveProperty('ticket');
  });
  it.each(['failure', 'pending'])('11 reports the earliest capacity expiry from a counted %s', async earliest => {
    const { first } = stores();
    if (earliest === 'failure') {
      await first.complete('key', await ticket(first, 0), 'failure', 0, policy);
      for (let index = 0; index < 9; index++) await ticket(first, 100);
    } else {
      await ticket(first, 0);
      await first.complete('key', await ticket(first, 100), 'failure', 100, policy);
      for (let index = 0; index < 8; index++) await ticket(first, 200);
    }
    expect(await first.reserve('key', 800000, policy)).toEqual({ busy: true, retryAt: 900000 });
    expect(await first.reserve('key', 900000, policy)).toHaveProperty('ticket');
  });
});
describe('AC02 Mongo expiry, privacy and failure handling', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  it('11 the default capacity budget returns within a few seconds with a frozen account clock', async () => {
    const store = new InMemorySignInAttemptRepository(); const key = signInAddressKey('key');
    for (let index = 0; index < 10; index++) await ticket(store, 1000, key);
    const controller = new AbortController();
    const result = new SignInLimit(store, { now: () => 1000 }).reserve('key', controller.signal);
    try { expect(await Promise.race([result, delay(3500).then(() => 'still waiting')])).toEqual({ retryAfter: 900 }); }
    finally { controller.abort(); await result; }
  });
  it('11 includes slow subsequent store polls in one capacity wait budget', async () => {
    const store = new InMemorySignInAttemptRepository(); const key = signInAddressKey('key');
    for (let index = 0; index < 10; index++) await ticket(store, 1000, key);
    const reserve = store.reserve.bind(store); const busy = await reserve(key, 1000, policy);
    let release!: () => void;
    vi.spyOn(store, 'reserve').mockImplementationOnce((...args) => reserve(...args))
      .mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(busy); }));
    const controller = new AbortController(); const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = new SignInLimit(store, { now: () => 1000, capacityWaitMs: 150 }).reserve('key', controller.signal);
    try {
      expect(await Promise.race([result, delay(300).then(() => 'still waiting')])).toEqual({ retryAfter: 900 });
      expect(warning).not.toHaveBeenCalled();
    } finally { controller.abort(); release?.(); await result; }
  });
  it.each(['cancel', 'failure'] as const)('11 preserves a genuine pending %s completing within the budget', async outcome => {
    const store = new InMemorySignInAttemptRepository(); const policy = { limit: 1, windowMs: 900000, lockMs: 900000 };
    const reserved = await store.reserve(signInAddressKey('key'), 1000, policy);
    if (!('ticket' in reserved)) throw new Error('Expected reservation');
    const limit = new SignInLimit(store, { now: () => 1000, limit: 1, capacityWaitMs: 500 });
    const result = limit.reserve('key'); await delay(30);
    await store.complete(signInAddressKey('key'), reserved.ticket, outcome, 1000, policy);
    if (outcome === 'cancel') expect(await result).toHaveProperty('ticket');
    else expect(await result).toEqual({ retryAfter: 900 });
  });
  it.each(['cancel', 'failure', 'expiry'] as const)('11 observes a pending %s during the final polling sleep', async outcome => {
    let now = 1000;
    const store = new InMemorySignInAttemptRepository(); const key = signInAddressKey('key');
    const policy = { limit: 1, windowMs: 900000, lockMs: 900000 };
    const reserved = await store.reserve(key, now, policy);
    if (!('ticket' in reserved)) throw new Error('Expected reservation');
    const limit = new SignInLimit(store, { now: () => now, limit: 1, capacityWaitMs: 25 });
    const result = limit.reserve('key'); await delay(10); now = outcome === 'expiry' ? 901000 : 101000;
    if (outcome !== 'expiry') await store.complete(key, reserved.ticket, outcome, now, policy);
    if (outcome !== 'failure') expect(await result).toHaveProperty('ticket');
    else expect(await result).toEqual({ retryAfter: 900 });
  });
  it('11 a final state probe that hangs cannot restart the wait', async () => {
    const store = new InMemorySignInAttemptRepository(); const key = signInAddressKey('key');
    for (let index = 0; index < 10; index++) await ticket(store, 1000, key);
    const reserve = store.reserve.bind(store);
    vi.spyOn(store, 'reserve').mockImplementationOnce((...args) => reserve(...args))
      .mockImplementationOnce(() => new Promise<never>(() => {}));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = new SignInLimit(store, { now: () => 1000, capacityWaitMs: 25 }).reserve('key');
    expect(await Promise.race([result, delay(200).then(() => 'still waiting')])).toEqual({ retryAfter: 900 });
    expect(warning).not.toHaveBeenCalled();
  });
  it('11 cancels a final state probe on client disconnect', async () => {
    const store = new InMemorySignInAttemptRepository(); const key = signInAddressKey('key');
    for (let index = 0; index < 10; index++) await ticket(store, 1000, key);
    const reserve = store.reserve.bind(store); let entered!: () => void;
    const probing = new Promise<void>(resolve => { entered = resolve; });
    vi.spyOn(store, 'reserve').mockImplementationOnce((...args) => reserve(...args))
      .mockImplementationOnce(() => { entered(); return new Promise<never>(() => {}); });
    const controller = new AbortController();
    const result = new SignInLimit(store, { now: () => 1000, capacityWaitMs: 25 }).reserve('key', controller.signal);
    await probing; controller.abort(); expect(await result).toEqual({ aborted: true });
  });
  it('11 releases a late successful final probe from a store that ignores cancellation', async () => {
    const store = new InMemorySignInAttemptRepository(); const key = signInAddressKey('key');
    const one = { ...policy, limit: 1 }; await store.reserve(key, 1000, one);
    const reserve = store.reserve.bind(store);
    vi.spyOn(store, 'reserve').mockImplementationOnce((...args) => reserve(...args))
      .mockImplementationOnce(async (key, now, policy) => {
        await delay(80); await store.clear(key, now); return reserve(key, now, policy);
      });
    const result = await new SignInLimit(store, { now: () => 1000, limit: 1, capacityWaitMs: 25 }).reserve('key');
    expect(result).toEqual({ retryAfter: 900 }); await delay(100);
    expect(await reserve(key, 1000, one)).toHaveProperty('ticket');
  });
  it('08 stops an abandoned request instead of admitting it after pending capacity is released', async () => {
    const store = new InMemorySignInAttemptRepository(); const key = signInAddressKey('key');
    const pending = await Promise.all(Array.from({ length: 10 }, () => ticket(store, 1000, key)));
    const controller = new AbortController();
    const result = new SignInLimit(store, { now: () => 1000 }).reserve('key', controller.signal);
    controller.abort();
    // Release later so the pre-fix waiter terminates and visibly admits the abandoned request.
    const release = setTimeout(() => { void store.complete(key, pending[0], 'cancel', 1000, policy); }, 100);
    try { expect(await result).toEqual({ aborted: true }); } finally { clearTimeout(release); }
  });
  it('02 computes remaining lock time after a slow storage read and admits after expiry during that read', async () => {
    let now = 1000;
    const store = new InMemorySignInAttemptRepository(); const key = signInAddressKey('key');
    for (let index = 0; index < 10; index++) await store.complete(key, await ticket(store, now, key), 'failure', now, policy);
    const reserve = store.reserve.bind(store);
    vi.spyOn(store, 'reserve').mockImplementation(async (...args) => { const value = await reserve(...args); now += 60001; return value; });
    const limit = new SignInLimit(store, { now: () => now });
    expect(await limit.reserve('key')).toEqual({ retryAfter: 840 });
    now = 900999;
    expect(await limit.reserve('key')).toHaveProperty('ticket');
  });
  it.each(['reserve', 'complete', 'clear'] as const)('09 fails open when %s hangs instead of rejecting', async method => {
    const store = new InMemorySignInAttemptRepository();
    const limit = new SignInLimit(store, { storageTimeoutMs: 20 });
    const admitted = method === 'complete' ? await limit.reserve('key') : {};
    vi.spyOn(store, method).mockImplementation(() => new Promise<never>(() => {}));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const operation = method === 'reserve' ? limit.reserve('key') : method === 'clear' ? limit.clear('key') : limit.complete('key', admitted.ticket, 'failure');
    const timeout = Symbol('still waiting'); let timer: ReturnType<typeof setTimeout>;
    const result = await Promise.race([operation, new Promise(resolve => { timer = setTimeout(() => resolve(timeout), 100); })]);
    clearTimeout(timer!); expect(result).not.toBe(timeout);
    expect(warning.mock.calls).toEqual([['Sign-in attempt storage unavailable; protection may be bypassed.']]);
  });
  it.each([true, false])('09 a late reservation after timeout does not occupy capacity (signal honored: %s)', async honorSignal => {
    const store = new InMemorySignInAttemptRepository(); const reserve = store.reserve.bind(store);
    vi.spyOn(store, 'reserve').mockImplementationOnce(async (key, now, policy, signal) => { await delay(50); return reserve(key, now, policy, honorSignal ? signal : undefined); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const limit = new SignInLimit(store, { limit: 1, storageTimeoutMs: 10 });
    expect(await limit.reserve('key')).toEqual({}); await delay(70);
    const result = await Promise.race([limit.reserve('key'), delay(100).then(() => ({ busy: true }))]);
    try { expect(result).toHaveProperty('ticket'); }
    finally { await store.clear(signInAddressKey('key'), Date.now()); }
  });
  it('09 a timed-out clear cannot erase a subsequently established lock', async () => {
    const store = new InMemorySignInAttemptRepository(); const clear = store.clear.bind(store);
    vi.spyOn(store, 'clear').mockImplementationOnce(async (...args) => { await delay(50); return clear(...args); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const limit = new SignInLimit(store, { limit: 1, storageTimeoutMs: 10 });
    await limit.clear('key'); const admitted = await limit.reserve('key');
    await limit.complete('key', admitted.ticket, 'failure'); await delay(70);
    expect(await limit.reserve('key')).toHaveProperty('retryAfter');
  });
  it('10 stores hash-only timing state with acknowledged CAS and absolute TTL', async () => {
    const { collection, documents } = isolatedSignInCollection();
    const index = vi.spyOn(collection, 'createIndex'); const write = vi.spyOn(collection, 'replaceOne');
    const repository = new MongoSignInAttemptRepository(async () => collection);
    const limit = new SignInLimit(repository, { now: () => 1000 });
    const admitted = await limit.reserve(' STUDENT@example.test ');
    await limit.complete('student@example.test', admitted.ticket, 'failure');
    const document = [...documents.values()][0];
    expect(document).toMatchObject({ _id: expect.stringMatching(/^[a-f0-9]{64}$/), failures: [1000], pending: [], lockedUntil: 0, expiresAt: new Date(901000) });
    expect(JSON.stringify(document)).not.toMatch(/student|example|password|email/i);
    expect(index).toHaveBeenCalledTimes(1); expect(index).toHaveBeenCalledWith({ expiresAt: 1 }, { expireAfterSeconds: 0, timeoutMS: 5000, signal: expect.any(AbortSignal) });
    expect(write).toHaveBeenCalledWith({ _id: document._id, revision: expect.any(String) }, document, { upsert: false, writeConcern: { w: 'majority' }, timeoutMS: 5000, signal: expect.any(AbortSignal) });
    expect(signInAddressKey(' STUDENT@example.test ')).toBe(signInAddressKey('student@example.test'));
  });
  it('10 prevents a CAS captured before TTL deletion from overwriting a recreated record', async () => {
    const { collection, documents } = isolatedSignInCollection();
    const repository = new MongoSignInAttemptRepository(async () => collection);
    const old = await ticket(repository); const revision = documents.get('key')!.revision;
    const read = collection.findOne.bind(collection); let held = true;
    vi.spyOn(collection, 'findOne').mockImplementation(async filter => {
      const stale = await read(filter, { timeoutMS: 5000 });
      if (held) {
        held = false; documents.delete('key');
        await repository.reserve('key', 1000, policy);
      }
      return stale;
    });
    await repository.complete('key', old, 'failure', 1000, policy);
    expect(documents.get('key')!.revision).not.toBe(revision);
    expect(documents.get('key')!.failures).toEqual([]);
    expect(documents.get('key')!.pending).toHaveLength(1);
  });
  it.each(['createIndex', 'findOne', 'insertOne', 'replaceOne'] as const)('09 surfaces %s failure and allows ordinary login coordination to fail open', async method => {
    const { collection } = isolatedSignInCollection(); const store = new MongoSignInAttemptRepository(async () => collection);
    if (method === 'replaceOne') await ticket(store, 1000, signInAddressKey('key'));
    vi.spyOn(collection, method).mockRejectedValue(new Error('private provider details'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await new SignInLimit(store).reserve('key');
    expect(result).toEqual({});
    expect(warning.mock.calls).toEqual([['Sign-in attempt storage unavailable; protection may be bypassed.']]);
  });
  it('09 retries failed initialization after the store becomes available', async () => {
    const { collection } = isolatedSignInCollection();
    vi.spyOn(collection, 'createIndex').mockRejectedValueOnce(new Error('Offline'));
    const repository = new MongoSignInAttemptRepository(async () => collection);
    await expect(repository.reserve('key', 1000, policy)).rejects.toThrow('Offline');
    expect(await repository.reserve('key', 1000, policy)).toHaveProperty('ticket');
  });
  it('selects memory in isolation, configured Mongo when shared/hosted, and unavailable storage when hosted is missing Mongo', async () => {
    vi.spyOn(config, 'hasMongoConfig').mockReturnValue(true);
    expect(createSignInAttemptRepository()).toBeInstanceOf(InMemorySignInAttemptRepository);
    vi.spyOn(config, 'getServicesMode').mockReturnValue('hosted'); vi.spyOn(config, 'isHostedApi').mockReturnValue(true);
    expect(createSignInAttemptRepository()).toBeInstanceOf(MongoSignInAttemptRepository);
    vi.spyOn(config, 'hasMongoConfig').mockReturnValue(false);
    await expect(createSignInAttemptRepository().reserve('key', 1000, policy)).rejects.toThrow('Sign-in attempt storage unavailable');
    vi.spyOn(config, 'isHostedApi').mockReturnValue(false); vi.spyOn(config, 'getServicesMode').mockReturnValue('shared');
    expect(createSignInAttemptRepository()).toBeInstanceOf(InMemorySignInAttemptRepository);
    vi.spyOn(config, 'hasMongoConfig').mockReturnValue(true);
    expect(createSignInAttemptRepository()).toBeInstanceOf(MongoSignInAttemptRepository);
  });
});
