import { hasMongoConfig, isHostedApi } from './config.js';
import { getMongoDatabase } from './mongo.js';
import type { TermsDocumentId } from './termsDocuments.js';

export type Acceptance = { userId: string; documentId: TermsDocumentId; version: number; acceptedAt: string };
export type ExportedAcceptance = Omit<Acceptance, 'userId'>;
export interface TermsAcceptanceRepository {
  record(userId: string, documentId: TermsDocumentId, version: number): Promise<void>;
  latestAccepted(userId: string, documentId: TermsDocumentId): Promise<number | null>;
  listForUser(userId: string): Promise<Acceptance[]>;
  collectForExport(userId: string): Promise<ExportedAcceptance[]>;
}

export class InMemoryTermsAcceptanceRepository implements TermsAcceptanceRepository {
  private readonly rows = new Map<string, Acceptance>();
  async record(userId: string, documentId: TermsDocumentId, version: number): Promise<void> {
    const key = JSON.stringify([userId, documentId, version]);
    if (!this.rows.has(key)) this.rows.set(key, { userId, documentId, version, acceptedAt: new Date().toISOString() });
  }
  async latestAccepted(userId: string, documentId: TermsDocumentId): Promise<number | null> {
    const rows = (await this.listForUser(userId)).filter(row => row.documentId === documentId);
    return rows.length ? Math.max(...rows.map(row => row.version)) : null;
  }
  async listForUser(userId: string): Promise<Acceptance[]> {
    return structuredClone([...this.rows.values()].filter(row => row.userId === userId));
  }
  async collectForExport(userId: string): Promise<ExportedAcceptance[]> {
    return (await this.listForUser(userId)).map(({ documentId, version, acceptedAt }) => ({ documentId, version, acceptedAt }));
  }
}

type AcceptanceKey = Pick<Acceptance, 'userId' | 'documentId' | 'version'>;
/** Narrow storage boundary allows testing the Mongo adapter with an isolated double. */
export type TermsAcceptanceCollection = {
  createIndex(keys: { userId: 1; documentId: 1; version: 1 }, options: { unique: true; name: string }): Promise<string>;
  updateOne(filter: AcceptanceKey, update: { $setOnInsert: Acceptance },
    options: { upsert: true; writeConcern: { w: 'majority' } }): Promise<{ acknowledged: boolean }>;
  findOne(filter: Pick<Acceptance, 'userId' | 'documentId'> & { version?: number },
    options?: { sort: { version: -1 } }): Promise<Acceptance | null>;
  find(filter: { userId: string }): { toArray(): Promise<Acceptance[]> };
};

export class MongoTermsAcceptanceRepository implements TermsAcceptanceRepository {
  private indexed?: Promise<TermsAcceptanceCollection>;
  constructor(private readonly collectionLoader: () => Promise<TermsAcceptanceCollection> = async () =>
    (await getMongoDatabase()).collection<Acceptance>('termsAcceptances')) {}

  private collection(): Promise<TermsAcceptanceCollection> {
    return this.indexed ??= (async () => {
      try {
        const collection = await this.collectionLoader();
        await collection.createIndex({ userId: 1, documentId: 1, version: 1 }, { unique: true, name: 'user_document_version' });
        return collection;
      } catch (error) { this.indexed = undefined; throw error; }
    })();
  }
  async record(userId: string, documentId: TermsDocumentId, version: number): Promise<void> {
    const collection = await this.collection();
    const key = { userId, documentId, version };
    try {
      const result = await collection.updateOne(key, { $setOnInsert: { ...key, acceptedAt: new Date().toISOString() } },
        { upsert: true, writeConcern: { w: 'majority' } });
      if (!result.acknowledged) throw new Error('Terms acceptance was not confirmed.');
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000 || !await collection.findOne(key)) throw error;
    }
  }
  async latestAccepted(userId: string, documentId: TermsDocumentId): Promise<number | null> {
    return (await (await this.collection()).findOne({ userId, documentId }, { sort: { version: -1 } }))?.version ?? null;
  }
  async listForUser(userId: string): Promise<Acceptance[]> {
    return (await (await this.collection()).find({ userId }).toArray())
      .map(({ userId, documentId, version, acceptedAt }) => ({ userId, documentId, version, acceptedAt }));
  }
  async collectForExport(userId: string): Promise<ExportedAcceptance[]> {
    return (await this.listForUser(userId)).map(({ documentId, version, acceptedAt }) => ({ documentId, version, acceptedAt }));
  }
}

export function createTermsAcceptanceRepository(): TermsAcceptanceRepository {
  if (hasMongoConfig()) return new MongoTermsAcceptanceRepository();
  if (isHostedApi()) {
    const unavailable = async (): Promise<never> => { throw new Error('Terms acceptance storage is temporarily unavailable.'); };
    return { record: unavailable, latestAccepted: unavailable, listForUser: unavailable, collectForExport: unavailable };
  }
  return new InMemoryTermsAcceptanceRepository();
}
