import { apiConfig, hasMongoConfig, getServicesMode, isHostedApi } from './config.js';
import { getMongoDatabase } from './mongo.js';

const lifetime = 60 * 60 * 1000;
type ResetToken = { hash: string; createdAt: number; expiresAt: number; state: 'pending' | 'active' | 'used'; credentialVersion?: string };
export type PasswordResetDocument = { _id: string; version: number; tokens: ResetToken[] };
export interface PasswordResetRepository {
  removeForUser(userId: string): Promise<void>;
  reserve(userId: string, hash: string, now: number, credentialVersion?: string): Promise<boolean>;
  activate(userId: string, hash: string): Promise<boolean>;
  findActive(hash: string, now: number): Promise<{ userId: string; hash: string; credentialVersion?: string } | null>;
  consume(hash: string, now: number): Promise<string | null>;
  invalidateAll(userId: string): Promise<void>;
}
// Exercise the real CAS adapter against a collection double without a live database.
export type PasswordResetCollection = {
  deleteOne(filter: { _id: string }, options: { writeConcern: { w: 'majority' } }): Promise<{ acknowledged: boolean }>;
  findOne(filter: { _id?: string; 'tokens.hash'?: string }): Promise<PasswordResetDocument | null>;
  insertOne(document: PasswordResetDocument, options: { writeConcern: { w: 'majority' } }): Promise<unknown>;
  replaceOne(filter: { _id: string; version: number }, document: PasswordResetDocument,
    options: { upsert: false; writeConcern: { w: 'majority' } }): Promise<{ matchedCount: number }>;
};

export class MongoPasswordResetRepository implements PasswordResetRepository {
  async removeForUser(userId: string): Promise<void> {
    const result = await (await this.collectionLoader()).deleteOne({ _id: userId }, { writeConcern: { w: 'majority' } });
    if (!result.acknowledged) throw new Error('Account mail token deletion was not confirmed.');
  }

  constructor(private readonly collectionLoader: () => Promise<PasswordResetCollection> = async () =>
    (await getMongoDatabase()).collection<PasswordResetDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_password_resets`),
    private readonly tokenLifetimeMs = lifetime) {}

  async reserve(userId: string, hash: string, now: number, credentialVersion?: string): Promise<boolean> {
    return this.change(userId, document => {
      const recent = document.tokens.filter(token => token.createdAt > now - lifetime);
      if (recent.length >= 3 || recent.some(token => token.hash === hash)) return { value: false };
      // Confirmation links outlive their rolling-hour mail slots. Keep those
      // links usable; the default reset lifetime retains its existing behavior.
      const retained = document.tokens.filter(token => token.expiresAt > now || token.createdAt > now - lifetime);
      document.tokens = [...retained, { hash, createdAt: now, expiresAt: now + this.tokenLifetimeMs, state: 'pending',
        ...(credentialVersion ? { credentialVersion } : {}) }];
      return { value: true, write: true };
    });
  }
  async activate(userId: string, hash: string): Promise<boolean> {
    return this.change(userId, document => {
      const token = document.tokens.find(token => token.hash === hash && token.state === 'pending');
      if (!token) return { value: false };
      token.state = 'active'; return { value: true, write: true };
    });
  }
  async mailRetryAfter(userId: string, now: number): Promise<number> {
    const document = await (await this.collectionLoader()).findOne({ _id: userId });
    const recent = document?.tokens.filter(token => token.createdAt > now - lifetime) ?? [];
    if (recent.length < 3) return 1;
    return Math.max(1, Math.ceil((Math.min(...recent.map(token => token.createdAt)) + lifetime - now) / 1000));
  }
  async findActive(hash: string, now: number) {
    const document = await (await this.collectionLoader()).findOne({ 'tokens.hash': hash });
    const token = document?.tokens.find(token => token.hash === hash && token.state === 'active' && token.expiresAt > now);
    return document && token ? { userId: document._id, hash, ...(token.credentialVersion ? { credentialVersion: token.credentialVersion } : {}) } : null;
  }
  async consume(hash: string, now: number): Promise<string | null> {
    const document = await (await this.collectionLoader()).findOne({ 'tokens.hash': hash });
    if (!document) return null;
    return this.change<string | null>(document._id, current => {
      const token = current.tokens.find(token => token.hash === hash && token.state === 'active' && token.expiresAt > now);
      if (!token) return { value: null };
      // Claim one link and cancel every sibling (including mail still in flight)
      // in the same CAS, so distinct preexisting links cannot both win.
      for (const sibling of current.tokens) sibling.state = 'used';
      return { value: current._id, write: true };
    });
  }
  async invalidateAll(userId: string): Promise<void> {
    await this.change(userId, document => {
      const write = document.tokens.some(token => token.state !== 'used');
      for (const token of document.tokens) token.state = 'used';
      return { value: undefined, write };
    });
  }
  private async change<T>(userId: string, mutation: (document: PasswordResetDocument) => { value: T; write?: boolean }): Promise<T> {
    const collection = await this.collectionLoader();
    for (;;) {
      const stored = await collection.findOne({ _id: userId });
      const next = structuredClone(stored ?? { _id: userId, version: -1, tokens: [] });
      const result = mutation(next);
      if (!result.write) return result.value;
      next.version++;
      if (stored) {
        const write = await collection.replaceOne({ _id: userId, version: stored.version }, next,
          { upsert: false, writeConcern: { w: 'majority' } });
        if (write.matchedCount === 1) return result.value;
      } else {
        try {
          await collection.insertOne(next, { writeConcern: { w: 'majority' } }); return result.value;
        } catch (error) {
          // Only a competing first insert is retryable; never hide an uncertain write.
          if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error;
        }
      }
    }
  }
}

export class InMemoryPasswordResetRepository extends MongoPasswordResetRepository {
  constructor(tokenLifetimeMs = lifetime) {
    const documents = new Map<string, PasswordResetDocument>();
    super(async () => ({
      async deleteOne(filter) { documents.delete(filter._id); return { acknowledged: true }; },
      async findOne(filter) {
        return structuredClone(filter._id ? documents.get(filter._id) ?? null
          : [...documents.values()].find(document => document.tokens.some(token => token.hash === filter['tokens.hash'])) ?? null);
      },
      async insertOne(document) {
        if (documents.has(document._id)) throw { code: 11000 };
        documents.set(document._id, structuredClone(document));
      },
      async replaceOne(filter, document) {
        // Compare and replace without yielding, mirroring Mongo's conditional write.
        if (documents.get(filter._id)?.version !== filter.version) return { matchedCount: 0 };
        documents.set(document._id, structuredClone(document)); return { matchedCount: 1 };
      },
    }), tokenLifetimeMs);
  }
}

export function createPasswordResetRepository(): PasswordResetRepository {
  if (getServicesMode() === 'isolated') return new InMemoryPasswordResetRepository();
  if (hasMongoConfig()) return new MongoPasswordResetRepository();
  if (!isHostedApi()) return new InMemoryPasswordResetRepository();
  const unavailable = async (): Promise<never> => { throw new Error('Password reset storage is unavailable.'); };
  return { reserve: unavailable, activate: unavailable, findActive: unavailable, consume: unavailable, invalidateAll: unavailable, removeForUser: unavailable };
}
