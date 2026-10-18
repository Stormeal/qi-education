import type { Collection } from 'mongodb';
import { apiConfig, hasMongoConfig } from './config.js';
import { getMongoDatabase } from './mongo.js';

export type CareerAchievement = { actionId: string; provenance: 'self-reported' | 'cv'; declaredAt: string };
export type StoredAccountCareers = { followedPathIds: string[]; focusPathId: string | null; achievements: CareerAchievement[] };
export type AccountCareersDocument = StoredAccountCareers & { _id: string; version: number };
export interface AccountCareersRepository {
  get(userId: string): Promise<AccountCareersDocument | null>;
  // change may run again after a competing write; it must have no external side effects.
  mutate(userId: string, initial: StoredAccountCareers, change: (document: AccountCareersDocument) => void): Promise<AccountCareersDocument>;
}
type CareersCollection = Pick<Collection<AccountCareersDocument>, 'findOne' | 'insertOne' | 'replaceOne'>;

export class MongoAccountCareersRepository implements AccountCareersRepository {
  constructor(private readonly collection: () => Promise<CareersCollection> = async () =>
    (await getMongoDatabase()).collection<AccountCareersDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_account_careers`)) {}

  async get(userId: string): Promise<AccountCareersDocument | null> {
    return (await this.collection()).findOne({ _id: userId });
  }

  async mutate(userId: string, initial: StoredAccountCareers, change: (document: AccountCareersDocument) => void): Promise<AccountCareersDocument> {
    const collection = await this.collection();
    for (;;) {
      const current = await collection.findOne({ _id: userId });
      const next: AccountCareersDocument = structuredClone(current ?? { ...initial, _id: userId, version: 0 });
      change(next);
      next.version += 1;
      if (current) {
        const result = await collection.replaceOne({ _id: userId, version: current.version }, next,
          { upsert: false, writeConcern: { w: 'majority' } });
        if (result.matchedCount === 1) return next;
      } else {
        try {
          await collection.insertOne(next, { writeConcern: { w: 'majority' } });
          return next;
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 11000
            && await collection.findOne({ _id: userId })) continue;
          throw error;
        }
      }
    }
  }
}

export class InMemoryAccountCareersRepository implements AccountCareersRepository {
  private readonly documents = new Map<string, AccountCareersDocument>();
  async get(userId: string): Promise<AccountCareersDocument | null> {
    return structuredClone(this.documents.get(userId) ?? null);
  }
  async mutate(userId: string, initial: StoredAccountCareers, change: (document: AccountCareersDocument) => void): Promise<AccountCareersDocument> {
    // No yield between reading and replacing; throw leaves the saved record untouched.
    const next = structuredClone(this.documents.get(userId) ?? { ...initial, _id: userId, version: 0 });
    change(next);
    next.version += 1;
    this.documents.set(userId, structuredClone(next));
    return next;
  }
}

export function createAccountCareersRepository(): AccountCareersRepository {
  return hasMongoConfig() ? new MongoAccountCareersRepository() : new InMemoryAccountCareersRepository();
}
