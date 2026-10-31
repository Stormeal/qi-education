import type { Collection } from 'mongodb';
import { apiConfig, hasMongoConfig } from './config.js';
import { getMongoDatabase } from './mongo.js';

export type LearningProgressDocument = {
  _id: string;
  userId: string;
  courseId: string;
  completedIds: string[];
  passedQuizzes: string[];
};
export interface LearningProgressRepository {
  collectForExport(userId: string): Promise<LearningProgressDocument[]>;
  removeForUser(userId: string): Promise<void>;
  list(userId: string): Promise<LearningProgressDocument[]>;
  listForCourse(courseId: string, userIds: string[]): Promise<LearningProgressDocument[]>;
  get(userId: string, courseId: string): Promise<LearningProgressDocument | null>;
  complete(userId: string, courseId: string, componentId: string): Promise<void>;
  recordPass(userId: string, courseId: string, fingerprint: string): Promise<void>;
}
const key = (userId: string, courseId: string) => JSON.stringify([userId, courseId]);
type ProgressCollection = Pick<Collection<LearningProgressDocument>, 'find' | 'findOne' | 'updateOne' | 'deleteMany'>;

export class MongoLearningProgressRepository implements LearningProgressRepository {
  async collectForExport(userId: string): Promise<LearningProgressDocument[]> {
    return (await this.list(userId)).map(({ _id, userId, courseId, completedIds, passedQuizzes }) =>
      ({ _id, userId, courseId, completedIds: [...completedIds], passedQuizzes: [...passedQuizzes] }));
  }
  async removeForUser(userId: string): Promise<void> {
    const result = await (await this.collection()).deleteMany({ userId }, { writeConcern: { w: 'majority' } });
    if (!result.acknowledged) throw new Error('Learning progress deletion was not confirmed.');
  }

  constructor(private readonly collection: () => Promise<ProgressCollection> = async () =>
    (await getMongoDatabase()).collection<LearningProgressDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_learning_progress`)) {}

  async list(userId: string): Promise<LearningProgressDocument[]> {
    return (await this.collection()).find({ userId }).toArray();
  }
  async listForCourse(courseId: string, userIds: string[]): Promise<LearningProgressDocument[]> {
    if (!userIds.length) return [];
    return (await this.collection()).find({ courseId, userId: { $in: userIds } }).toArray();
  }
  async get(userId: string, courseId: string): Promise<LearningProgressDocument | null> {
    return (await this.collection()).findOne({ _id: key(userId, courseId), userId });
  }
  complete(userId: string, courseId: string, componentId: string): Promise<void> {
    return this.add(userId, courseId, 'completedIds', componentId);
  }
  recordPass(userId: string, courseId: string, fingerprint: string): Promise<void> {
    return this.add(userId, courseId, 'passedQuizzes', fingerprint);
  }
  private async add(userId: string, courseId: string, field: 'completedIds' | 'passedQuizzes', value: string): Promise<void> {
    const collection = await this.collection();
    const filter = { _id: key(userId, courseId), userId, courseId };
    const other = field === 'completedIds' ? 'passedQuizzes' : 'completedIds';
    const update = { $setOnInsert: { userId, courseId, [other]: [] }, $addToSet: { [field]: value } };
    try { await collection.updateOne(filter, update, { upsert: true }); }
    catch (error) {
      // Two initial upserts may race on _id; merge into the winner, never replace it.
      if (!(error instanceof Error) || !('code' in error) || error.code !== 11000) throw error;
      const result = await collection.updateOne(filter, { $addToSet: { [field]: value } });
      if (!result.matchedCount) throw error;
    }
  }
}

export class InMemoryLearningProgressRepository implements LearningProgressRepository {
  async collectForExport(userId: string): Promise<LearningProgressDocument[]> {
    return (await this.list(userId)).map(({ _id, userId, courseId, completedIds, passedQuizzes }) =>
      ({ _id, userId, courseId, completedIds: [...completedIds], passedQuizzes: [...passedQuizzes] }));
  }
  async removeForUser(userId: string): Promise<void> {
    for (const [id, document] of this.documents) if (document.userId === userId) this.documents.delete(id);
  }

  private readonly documents = new Map<string, LearningProgressDocument>();
  async list(userId: string): Promise<LearningProgressDocument[]> {
    return structuredClone([...this.documents.values()].filter(document => document.userId === userId));
  }
  async listForCourse(courseId: string, userIds: string[]): Promise<LearningProgressDocument[]> {
    const enrolled = new Set(userIds);
    return structuredClone([...this.documents.values()].filter(document => document.courseId === courseId && enrolled.has(document.userId)));
  }
  async get(userId: string, courseId: string): Promise<LearningProgressDocument | null> {
    return structuredClone(this.documents.get(key(userId, courseId)) ?? null);
  }
  async complete(userId: string, courseId: string, componentId: string): Promise<void> {
    this.add(userId, courseId, 'completedIds', componentId);
  }
  async recordPass(userId: string, courseId: string, fingerprint: string): Promise<void> {
    this.add(userId, courseId, 'passedQuizzes', fingerprint);
  }
  private add(userId: string, courseId: string, field: 'completedIds' | 'passedQuizzes', value: string): void {
    const id = key(userId, courseId);
    const document = this.documents.get(id) ?? { _id: id, userId, courseId, completedIds: [], passedQuizzes: [] };
    if (!document[field].includes(value)) document[field].push(value);
    this.documents.set(id, document);
  }
}

export function createLearningProgressRepository(): LearningProgressRepository {
  return hasMongoConfig() ? new MongoLearningProgressRepository() : new InMemoryLearningProgressRepository();
}
