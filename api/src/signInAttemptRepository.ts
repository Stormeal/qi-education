import { randomUUID } from 'node:crypto';
import { apiConfig, getServicesMode, hasMongoConfig, isHostedApi } from './config.js';
import { getMongoDatabase } from './mongo.js';

export type SignInPolicy = { limit: number; windowMs: number; lockMs: number };
export type SignInReservation = { ticket: string } | { lockedUntil: number } | { busy: true };
export interface SignInAttemptRepository {
  reserve(key: string, now: number, policy: SignInPolicy, signal?: AbortSignal): Promise<SignInReservation>;
  complete(key: string, ticket: string, outcome: 'failure' | 'cancel', now: number, policy: SignInPolicy, signal?: AbortSignal): Promise<void>;
  clear(key: string, now: number, signal?: AbortSignal): Promise<void>;
}
export type SignInAttemptDocument = {
  _id: string; revision: string; failures: number[];
  pending: { ticket: string; expiresAt: number }[];
  lockedUntil: number; expiresAt: Date;
};
export type SignInAttemptCollection = {
  createIndex(keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0; timeoutMS: number; signal?: AbortSignal }): Promise<unknown>;
  findOne(filter: { _id: string }, options: { timeoutMS: number; signal?: AbortSignal }): Promise<SignInAttemptDocument | null>;
  insertOne(document: SignInAttemptDocument, options: { writeConcern: { w: 'majority' }; timeoutMS: number; signal?: AbortSignal }): Promise<unknown>;
  replaceOne(filter: { _id: string; revision: string }, document: SignInAttemptDocument,
    options: { upsert: false; writeConcern: { w: 'majority' }; timeoutMS: number; signal?: AbortSignal }): Promise<{ matchedCount: number }>;
};

/** Single-document CAS reserves capacity before any user read/password check. */
export class MongoSignInAttemptRepository implements SignInAttemptRepository {
  private indexedCollection?: Promise<SignInAttemptCollection>;
  constructor(private readonly collectionLoader: () => Promise<SignInAttemptCollection> = async () =>
    (await getMongoDatabase()).collection<SignInAttemptDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_sign_in_attempts`),
    private readonly identifier: () => string = randomUUID) {}

  async reserve(key: string, now: number, policy: SignInPolicy, signal?: AbortSignal): Promise<SignInReservation> {
    return this.change<SignInReservation>(key, now, document => {
      if (document.lockedUntil > now) return { value: { lockedUntil: document.lockedUntil } };
      this.prune(document, now, policy);
      if (document.failures.length + document.pending.length >= policy.limit) return { value: { busy: true } };
      const ticket = this.identifier();
      document.pending.push({ ticket, expiresAt: now + policy.windowMs });
      this.expiry(document, now, policy);
      return { value: { ticket }, write: true };
    }, signal);
  }
  async complete(key: string, ticket: string, outcome: 'failure' | 'cancel', now: number, policy: SignInPolicy, signal?: AbortSignal): Promise<void> {
    await this.change(key, now, document => {
      this.prune(document, now, policy);
      if (!document.pending.some(attempt => attempt.ticket === ticket)) return { value: undefined };
      document.pending = document.pending.filter(attempt => attempt.ticket !== ticket);
      if (outcome === 'failure') {
        document.failures.push(now);
        if (document.failures.length >= policy.limit) document.lockedUntil = now + policy.lockMs;
      }
      this.expiry(document, now, policy);
      return { value: undefined, write: true };
    }, signal);
  }
  async clear(key: string, now: number, signal?: AbortSignal): Promise<void> {
    await this.change(key, now, document => {
      if (!document.failures.length && !document.pending.length && !document.lockedUntil) return { value: undefined };
      document.failures = []; document.pending = []; document.lockedUntil = 0;
      document.expiresAt = new Date(now);
      return { value: undefined, write: true };
    }, signal);
  }
  private prune(document: SignInAttemptDocument, now: number, policy: SignInPolicy) {
    if (document.lockedUntil && document.lockedUntil <= now) {
      document.failures = []; document.pending = []; document.lockedUntil = 0;
    }
    document.failures = document.failures.filter(time => time > now - policy.windowMs);
    document.pending = document.pending.filter(attempt => attempt.expiresAt > now);
  }
  private expiry(document: SignInAttemptDocument, now: number, policy: SignInPolicy) {
    document.expiresAt = new Date(Math.max(now, document.lockedUntil,
      ...document.failures.map(time => time + policy.windowMs), ...document.pending.map(attempt => attempt.expiresAt)));
  }
  private async collection(signal?: AbortSignal) {
    if (!this.indexedCollection) {
      this.indexedCollection = (async () => {
        const collection = await this.collectionLoader();
        signal?.throwIfAborted();
        await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, timeoutMS: 5000, ...(signal ? { signal } : {}) });
        return collection;
      })();
    }
    try { return await this.indexedCollection; }
    catch (error) { this.indexedCollection = undefined; throw error; }
  }
  private async change<T>(key: string, now: number,
    mutate: (document: SignInAttemptDocument) => { value: T; write?: boolean }, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    const collection = await this.collection(signal);
    for (;;) {
      signal?.throwIfAborted();
      const stored = await collection.findOne({ _id: key }, { timeoutMS: 5000, ...(signal ? { signal } : {}) });
      signal?.throwIfAborted();
      const next = structuredClone(stored ?? { _id: key, revision: '', failures: [], pending: [], lockedUntil: 0, expiresAt: new Date(now) });
      const result = mutate(next);
      if (!result.write) return result.value;
      // Unique revisions prevent ABA if TTL deletes a record during a CAS retry.
      next.revision = this.identifier();
      if (stored) {
        const write = await collection.replaceOne({ _id: key, revision: stored.revision }, next,
          { upsert: false, writeConcern: { w: 'majority' }, timeoutMS: 5000, ...(signal ? { signal } : {}) });
        if (write.matchedCount === 1) return result.value;
      } else {
        try { await collection.insertOne(next, { writeConcern: { w: 'majority' }, timeoutMS: 5000, ...(signal ? { signal } : {}) }); return result.value; }
        catch (error) {
          if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error;
        }
      }
    }
  }
}

export class InMemorySignInAttemptRepository extends MongoSignInAttemptRepository {
  private readonly documents: Map<string, SignInAttemptDocument>;
  constructor(identifier: () => string = randomUUID) {
    const documents = new Map<string, SignInAttemptDocument>();
    super(async () => ({
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
    }), identifier);
    this.documents = documents;
  }
  override reserve(key: string, now: number, policy: SignInPolicy, signal?: AbortSignal) {
    signal?.throwIfAborted();
    // Lazy reclamation also removes expired addresses that are never tried again.
    for (const [id, document] of this.documents) if (document.expiresAt.getTime() <= now) this.documents.delete(id);
    return super.reserve(key, now, policy, signal);
  }
}

export function createSignInAttemptRepository(): SignInAttemptRepository {
  if (getServicesMode() === 'isolated') return new InMemorySignInAttemptRepository();
  if (hasMongoConfig()) return new MongoSignInAttemptRepository();
  if (!isHostedApi()) return new InMemorySignInAttemptRepository();
  const unavailable = async (): Promise<never> => { throw new Error('Sign-in attempt storage unavailable.'); };
  return { reserve: unavailable, complete: unavailable, clear: unavailable };
}
