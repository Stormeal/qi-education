import type { AccountProfileDocument, AccountProfileInput } from './accountProfile.js';
import { accountProfileFields } from './accountProfile.js';
import { apiConfig, hasMongoConfig, isHostedApi } from './config.js';
import { getMongoDatabase } from './mongo.js';

export interface AccountProfileRepository {
  collectForExport(userId: string): Promise<AccountProfileDocument | null>;
  removeForUser(userId: string): Promise<void>;
  get(userId: string): Promise<AccountProfileDocument | null>;
  save(userId: string, input: AccountProfileInput): Promise<AccountProfileDocument>;
}

export type AccountProfileOptions = { now?: () => Date };
export type AccountProfileCollection = {
  deleteOne(filter: { _id: string }, options: { writeConcern: { w: 'majority' } }): Promise<{ acknowledged: boolean }>;
  findOne(filter: { _id: string }): Promise<AccountProfileDocument | null>;
  updateOne(filter: { _id: string }, update: { $set: AccountProfileInput & { updatedAt: string } }, options: {
    upsert: boolean; writeConcern: { w: 'majority' };
  }): Promise<{ matchedCount: number }>;
};

export class AccountProfileUnavailableError extends Error {
  constructor() { super('Account profile storage is temporarily unavailable.'); }
}

export class InMemoryAccountProfileRepository implements AccountProfileRepository {
  async collectForExport(userId: string): Promise<AccountProfileDocument | null> {
    const profile = await this.get(userId);
    return profile ? { _id: profile._id, ...accountProfileFields(profile), updatedAt: profile.updatedAt } : null;
  }
  async removeForUser(userId: string): Promise<void> { this.profiles.delete(userId); }

  private readonly profiles = new Map<string, AccountProfileDocument>();
  private readonly now: () => Date;
  constructor(options: AccountProfileOptions = {}) { this.now = options.now ?? (() => new Date()); }
  async get(userId: string): Promise<AccountProfileDocument | null> {
    return structuredClone(this.profiles.get(userId) ?? null);
  }
  async save(userId: string, input: AccountProfileInput): Promise<AccountProfileDocument> {
    const profile = { _id: userId, ...accountProfileFields(input), updatedAt: this.now().toISOString() };
    this.profiles.set(userId, profile);
    return structuredClone(profile);
  }
}

export class MongoAccountProfileRepository implements AccountProfileRepository {
  async collectForExport(userId: string): Promise<AccountProfileDocument | null> {
    const profile = await this.get(userId);
    return profile ? { _id: profile._id, ...accountProfileFields(profile), updatedAt: profile.updatedAt } : null;
  }
  async removeForUser(userId: string): Promise<void> {
    const result = await (await this.collectionLoader()).deleteOne({ _id: userId }, { writeConcern: { w: 'majority' } });
    if (!result.acknowledged) throw new Error('Account profile deletion was not confirmed.');
  }

  private readonly now: () => Date;
  constructor(private readonly collectionLoader: () => Promise<AccountProfileCollection> = async () =>
    (await getMongoDatabase()).collection<AccountProfileDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_account_profiles`),
  options: AccountProfileOptions = {}) { this.now = options.now ?? (() => new Date()); }

  async get(userId: string): Promise<AccountProfileDocument | null> {
    return (await this.collectionLoader()).findOne({ _id: userId });
  }

  async save(userId: string, input: AccountProfileInput): Promise<AccountProfileDocument> {
    const collection = await this.collectionLoader();
    const stored = { ...accountProfileFields(input), updatedAt: this.now().toISOString() };
    const filter = { _id: userId };
    const update = { $set: stored };
    try {
      await collection.updateOne(filter, update, { upsert: true, writeConcern: { w: 'majority' } });
    } catch (error) {
      // Match instructor-profile first-upsert handling: retry a unique _id race
      // once, but never claim success if that winning row has since disappeared.
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error;
      const retry = await collection.updateOne(filter, update, { upsert: false, writeConcern: { w: 'majority' } });
      if (retry.matchedCount !== 1) throw error;
    }
    return { _id: userId, ...stored };
  }
}

export function createAccountProfileRepository(): AccountProfileRepository {
  // Private account profiles are isolated for every local/test run, including
  // local opt-in to other shared services. Hosted missing Mongo fails closed.
  if (!isHostedApi()) return new InMemoryAccountProfileRepository();
  if (hasMongoConfig()) return new MongoAccountProfileRepository();
  const unavailable = async (): Promise<never> => { throw new AccountProfileUnavailableError(); };
  return { get: unavailable, save: unavailable, collectForExport: unavailable, removeForUser: unavailable };
}
