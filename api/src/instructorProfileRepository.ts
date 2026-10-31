import { apiConfig, hasMongoConfig, isHostedApi } from './config.js';
import type { InstructorProfileDocument } from './instructorProfile.js';
import { getMongoDatabase } from './mongo.js';

export interface InstructorProfileRepository {
  collectForExport(userId: string): Promise<InstructorProfileDocument | null>;
  anonymizeForUser(userId: string): Promise<void>;
  get(userId: string): Promise<InstructorProfileDocument | null>;
  save(userId: string, description: string): Promise<void>;
  list(): Promise<InstructorProfileDocument[]>;
  clear(userId: string): Promise<void>;
}

// Narrow collection boundary permits exercising the real adapter without Mongo.
export type InstructorProfileCollection = {
  findOne(filter: { _id: string }): Promise<InstructorProfileDocument | null>;
  find(): { toArray(): Promise<InstructorProfileDocument[]> };
  updateOne(filter: { _id: string }, update: { $set: { description: string } }, options: {
    upsert: boolean; writeConcern: { w: 'majority' };
  }): Promise<{ matchedCount: number }>;
  deleteOne(filter: { _id: string }, options?: { writeConcern: { w: 'majority' } }): Promise<{ acknowledged: boolean }>;
};

export class MongoInstructorProfileRepository implements InstructorProfileRepository {
  async collectForExport(userId: string): Promise<InstructorProfileDocument | null> {
    const profile = await this.get(userId);
    return profile ? { _id: profile._id, description: profile.description } : null;
  }
  async anonymizeForUser(userId: string): Promise<void> {
    const result = await (await this.collectionLoader()).deleteOne({ _id: userId }, { writeConcern: { w: 'majority' } });
    if (!result.acknowledged) throw new Error('Instructor profile anonymization was not confirmed.');
  }

  constructor(private readonly collectionLoader: () => Promise<InstructorProfileCollection> = async () =>
    (await getMongoDatabase()).collection<InstructorProfileDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_instructor_profiles`)) {}

  async get(userId: string): Promise<InstructorProfileDocument | null> {
    return (await this.collectionLoader()).findOne({ _id: userId });
  }

  async save(userId: string, description: string): Promise<void> {
    if (!description) { await this.clear(userId); return; }
    const collection = await this.collectionLoader();
    const filter = { _id: userId };
    const update = { $set: { description } };
    try {
      await collection.updateOne(filter, update, { upsert: true, writeConcern: { w: 'majority' } });
    } catch (error) {
      // Two first saves can race on unique _id. Replace the winning row once;
      // if it was concurrently removed, preserve the failure rather than lose text.
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error;
      const retry = await collection.updateOne(filter, update, { upsert: false, writeConcern: { w: 'majority' } });
      if (retry.matchedCount !== 1) throw error;
    }
  }

  async list(): Promise<InstructorProfileDocument[]> {
    return (await this.collectionLoader()).find().toArray();
  }

  async clear(userId: string): Promise<void> {
    await (await this.collectionLoader()).deleteOne({ _id: userId }, { writeConcern: { w: 'majority' } });
  }
}

export class InMemoryInstructorProfileRepository implements InstructorProfileRepository {
  async collectForExport(userId: string): Promise<InstructorProfileDocument | null> {
    const profile = await this.get(userId);
    return profile ? { _id: profile._id, description: profile.description } : null;
  }
  async anonymizeForUser(userId: string): Promise<void> { await this.clear(userId); }

  private readonly profiles = new Map<string, InstructorProfileDocument>();
  async get(userId: string): Promise<InstructorProfileDocument | null> {
    return structuredClone(this.profiles.get(userId) ?? null);
  }
  async save(userId: string, description: string): Promise<void> {
    if (!description) this.profiles.delete(userId);
    else this.profiles.set(userId, { _id: userId, description });
  }
  async list(): Promise<InstructorProfileDocument[]> { return structuredClone([...this.profiles.values()]); }
  async clear(userId: string): Promise<void> { this.profiles.delete(userId); }
}

export class InstructorProfileUnavailableError extends Error {
  constructor() { super('Instructor profile storage is temporarily unavailable.'); }
}

export function createInstructorProfileRepository(): InstructorProfileRepository {
  if (hasMongoConfig()) return new MongoInstructorProfileRepository();
  if (isHostedApi()) {
    const unavailable = async (): Promise<never> => { throw new InstructorProfileUnavailableError(); };
    return { get: unavailable, save: unavailable, list: unavailable, clear: unavailable, collectForExport: unavailable, anonymizeForUser: unavailable };
  }
  return new InMemoryInstructorProfileRepository();
}
