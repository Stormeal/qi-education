import { apiConfig, getServicesMode, hasMongoConfig } from './config.js';
import { getMongoDatabase } from './mongo.js';

export interface ClientLimitRepository {
  increment(key: string, windowStart: number, expiresAt: number, signal?: AbortSignal): Promise<number>;
}
export type ClientLimitDocument = { _id: string; count: number; expiresAt: Date };
type OperationOptions = { timeoutMS: number; signal?: AbortSignal };
export type ClientLimitCollection = {
  createIndex(keys: { expiresAt: 1 }, options: OperationOptions & { expireAfterSeconds: 0 }): Promise<unknown>;
  findOneAndUpdate(filter: { _id: string }, update: { $inc: { count: 1 }; $setOnInsert: { expiresAt: Date } },
    options: OperationOptions & { upsert: true; returnDocument: 'after'; includeResultMetadata: false; writeConcern: { w: 'majority' } }): Promise<ClientLimitDocument | null>;
};

// Window identity is part of the document ID: delayed TTL deletion cannot keep
// an old counter alive or let a delayed request reset a newer window's counter.
const documentId = (key: string, windowStart: number) => `${key}:${windowStart}`;

export class MongoClientLimitRepository implements ClientLimitRepository {
  private indexedCollection?: Promise<ClientLimitCollection>;
  constructor(private readonly collectionLoader: () => Promise<ClientLimitCollection> = async () =>
    (await getMongoDatabase()).collection<ClientLimitDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_client_limits`)) {}

  async increment(key: string, windowStart: number, expiresAt: number, signal?: AbortSignal): Promise<number> {
    signal?.throwIfAborted();
    const collection = await this.collection(signal);
    const increment = () => {
      signal?.throwIfAborted();
      return collection.findOneAndUpdate({ _id: documentId(key, windowStart) },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(expiresAt) } },
        { upsert: true, returnDocument: 'after', includeResultMetadata: false, writeConcern: { w: 'majority' },
          timeoutMS: 5000, ...(signal ? { signal } : {}) });
    };
    let document: ClientLimitDocument | null;
    try { document = await increment(); }
    catch (error) {
      // A simultaneous first upsert can lose to the unique _id insertion. It
      // has not incremented anything, so retry against the winning document.
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error;
      document = await increment();
    }
    if (!document) throw new Error('Client limit count was not confirmed.');
    return document.count;
  }

  private async collection(signal?: AbortSignal): Promise<ClientLimitCollection> {
    this.indexedCollection ??= (async () => {
      const collection = await this.collectionLoader();
      signal?.throwIfAborted();
      await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, timeoutMS: 5000, ...(signal ? { signal } : {}) });
      return collection;
    })();
    try { return await this.indexedCollection; }
    catch (error) { this.indexedCollection = undefined; throw error; }
  }
}

export class InMemoryClientLimitRepository implements ClientLimitRepository {
  private readonly documents = new Map<string, { count: number; expiresAt: number }>();
  async increment(key: string, windowStart: number, expiresAt: number, signal?: AbortSignal): Promise<number> {
    signal?.throwIfAborted();
    for (const [id, document] of this.documents) if (document.expiresAt <= windowStart) this.documents.delete(id);
    const id = documentId(key, windowStart);
    const count = (this.documents.get(id)?.count ?? 0) + 1;
    this.documents.set(id, { count, expiresAt });
    return count;
  }
}

export function createClientLimitRepository(): ClientLimitRepository {
  if (getServicesMode() === 'isolated') return new InMemoryClientLimitRepository();
  if (hasMongoConfig()) return new MongoClientLimitRepository();
  return { async increment() { throw new Error('Client limit storage unavailable.'); } };
}
