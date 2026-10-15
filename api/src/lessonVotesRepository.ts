import type { Collection } from 'mongodb';
import { apiConfig, hasMongoConfig } from './config.js';
import { getMongoDatabase } from './mongo.js';

export type LessonVote = { componentId: string; vote: 'up' | 'down' };
type VoteDocument = LessonVote & { _id: string; userId: string; courseId: string };
export interface LessonVotesRepository {
  list(userId: string, courseId: string): Promise<LessonVote[]>;
  set(userId: string, courseId: string, componentId: string, vote: LessonVote['vote'] | null): Promise<void>;
}
const key = (userId: string, courseId: string, componentId: string) => JSON.stringify([userId, courseId, componentId]);
type VotesCollection = Pick<Collection<VoteDocument>, 'find' | 'updateOne' | 'deleteOne'>;
export class MongoLessonVotesRepository implements LessonVotesRepository {
  constructor(private readonly collection: () => Promise<VotesCollection> = async () =>
    (await getMongoDatabase()).collection<VoteDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_lesson_votes`)) {}
  async list(userId: string, courseId: string): Promise<LessonVote[]> {
    return (await (await this.collection()).find({ userId, courseId }).toArray()).map(({ componentId, vote }) => ({ componentId, vote }));
  }
  async set(userId: string, courseId: string, componentId: string, vote: LessonVote['vote'] | null) {
    const collection = await this.collection(), filter = { _id: key(userId, courseId, componentId), userId, courseId, componentId };
    if (vote === null) { await collection.deleteOne(filter); return; }
    try { await collection.updateOne(filter, { $set: { vote } }, { upsert: true }); }
    catch (error) {
      // Concurrent initial upserts can collide on _id; update the winning document.
      if (!(error instanceof Error) || !('code' in error) || error.code !== 11000) throw error;
      const result = await collection.updateOne(filter, { $set: { vote } });
      if (!result.matchedCount) throw error;
    }
  }
}
export class InMemoryLessonVotesRepository implements LessonVotesRepository {
  private readonly votes = new Map<string, VoteDocument>();
  async list(userId: string, courseId: string): Promise<LessonVote[]> {
    return [...this.votes.values()].filter(item => item.userId === userId && item.courseId === courseId).map(({ componentId, vote }) => ({ componentId, vote }));
  }
  async set(userId: string, courseId: string, componentId: string, vote: LessonVote['vote'] | null) {
    const id = key(userId, courseId, componentId);
    if (vote === null) this.votes.delete(id);
    else this.votes.set(id, { _id: id, userId, courseId, componentId, vote });
  }
}
export function createLessonVotesRepository(): LessonVotesRepository {
  return hasMongoConfig() ? new MongoLessonVotesRepository() : new InMemoryLessonVotesRepository();
}
