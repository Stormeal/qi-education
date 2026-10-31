import { randomUUID } from 'node:crypto';
import { hasMongoConfig, isHostedApi } from './config.js';
import { getMongoDatabase } from './mongo.js';
import type { CourseRating, ExportedCourseRating, RatingInput } from './courseRatings.js';

export interface CourseRatingRepository {
  get(courseId: string, userId: string): Promise<CourseRating | null>;
  upsert(courseId: string, userId: string, input: RatingInput): Promise<CourseRating>;
  listForCourse(courseId: string): Promise<CourseRating[]>;
  setHidden(courseId: string, id: string, hidden: boolean): Promise<CourseRating | null>;
  collectForExport(userId: string): Promise<ExportedCourseRating[]>;
  anonymizeForUser(userId: string): Promise<void>;
}
const exportRow = ({ courseId, stars, comment, hidden, createdAt, updatedAt }: CourseRating): ExportedCourseRating =>
  ({ courseId, stars, ...(comment ? { comment } : {}), hidden, createdAt, updatedAt });
const dto = (row: CourseRating): CourseRating => ({ id: row.id, userId: row.userId, ...exportRow(row) });

export class InMemoryCourseRatingRepository implements CourseRatingRepository {
  private readonly rows = new Map<string, CourseRating>();
  async get(courseId: string, userId: string): Promise<CourseRating | null> {
    return structuredClone(this.rows.get(JSON.stringify([courseId, userId])) ?? null);
  }
  async upsert(courseId: string, userId: string, input: RatingInput): Promise<CourseRating> {
    const key = JSON.stringify([courseId, userId]);
    const now = new Date().toISOString();
    const current = this.rows.get(key);
    const row: CourseRating = { id: current?.id ?? randomUUID(), courseId, userId, stars: input.stars,
      ...(input.comment ? { comment: input.comment } : {}), hidden: current?.hidden ?? false,
      createdAt: current?.createdAt ?? now, updatedAt: now };
    this.rows.set(key, row);
    return structuredClone(row);
  }
  async listForCourse(courseId: string): Promise<CourseRating[]> {
    return structuredClone([...this.rows.values()].filter(row => row.courseId === courseId));
  }
  async setHidden(courseId: string, id: string, hidden: boolean): Promise<CourseRating | null> {
    const row = [...this.rows.values()].find(row => row.courseId === courseId && row.id === id);
    if (!row) return null;
    row.hidden = hidden; row.updatedAt = new Date().toISOString();
    return structuredClone(row);
  }
  async collectForExport(userId: string): Promise<ExportedCourseRating[]> {
    return [...this.rows.values()].filter(row => row.userId === userId).map(exportRow);
  }
  async anonymizeForUser(userId: string): Promise<void> {
    for (const row of this.rows.values()) if (row.userId === userId) delete row.comment;
  }
}

type RatingUpdate = { $set: Partial<CourseRating>; $setOnInsert?: Partial<CourseRating>; $unset?: { comment: '' } };
type WriteOptions = { upsert?: boolean; returnDocument: 'after'; includeResultMetadata: false; writeConcern: { w: 'majority' } };
export type CourseRatingCollection = {
  createIndex(keys: { courseId: 1; userId: 1 } | { courseId: 1; updatedAt: -1 }, options?: { unique: true }): Promise<string>;
  findOne(filter: Partial<CourseRating>): Promise<CourseRating | null>;
  find(filter: Partial<CourseRating>): { toArray(): Promise<CourseRating[]> };
  findOneAndUpdate(filter: Partial<CourseRating>, update: RatingUpdate, options: WriteOptions): Promise<CourseRating | null>;
  updateMany(filter: { userId: string }, update: { $unset: { comment: '' } }, options: { writeConcern: { w: 'majority' } }): Promise<{ acknowledged: boolean }>;
};
const majority = { writeConcern: { w: 'majority' as const } };
const returning = { returnDocument: 'after' as const, includeResultMetadata: false as const, ...majority };
export class MongoCourseRatingRepository implements CourseRatingRepository {
  private ready?: Promise<CourseRatingCollection>;
  constructor(private readonly collectionLoader: () => Promise<CourseRatingCollection> = async () =>
    (await getMongoDatabase()).collection<CourseRating>('courseRatings')) {}
  private collection(): Promise<CourseRatingCollection> {
    return this.ready ??= Promise.resolve().then(this.collectionLoader).then(async collection => {
      await collection.createIndex({ courseId: 1, userId: 1 }, { unique: true });
      await collection.createIndex({ courseId: 1, updatedAt: -1 });
      return collection;
    }).catch(error => { this.ready = undefined; throw error; });
  }
  async get(courseId: string, userId: string): Promise<CourseRating | null> {
    const row = await (await this.collection()).findOne({ courseId, userId });
    return row ? dto(row) : null;
  }
  async upsert(courseId: string, userId: string, input: RatingInput): Promise<CourseRating> {
    const collection = await this.collection();
    const now = new Date().toISOString();
    const filter = { courseId, userId };
    const update: RatingUpdate = { $set: { stars: input.stars, updatedAt: now, ...(input.comment ? { comment: input.comment } : {}) },
      $setOnInsert: { id: randomUUID(), courseId, userId, hidden: false, createdAt: now },
      ...(!input.comment ? { $unset: { comment: '' as const } } : {}),
    };
    let row: CourseRating | null;
    try { row = await collection.findOneAndUpdate(filter, update, { upsert: true, ...returning }); }
    catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error;
      row = await collection.findOneAndUpdate(filter, update, { upsert: false, ...returning });
      if (!row) throw error;
    }
    if (!row) throw new Error('Course rating was not confirmed.');
    return dto(row);
  }
  async listForCourse(courseId: string): Promise<CourseRating[]> {
    return (await (await this.collection()).find({ courseId }).toArray()).map(dto);
  }
  async setHidden(courseId: string, id: string, hidden: boolean): Promise<CourseRating | null> {
    const row = await (await this.collection()).findOneAndUpdate({ courseId, id },
      { $set: { hidden, updatedAt: new Date().toISOString() } }, returning);
    return row ? dto(row) : null;
  }
  async collectForExport(userId: string): Promise<ExportedCourseRating[]> {
    return (await (await this.collection()).find({ userId }).toArray()).map(exportRow);
  }
  async anonymizeForUser(userId: string): Promise<void> {
    const result = await (await this.collection()).updateMany({ userId }, { $unset: { comment: '' } }, majority);
    if (!result.acknowledged) throw new Error('Course rating anonymization was not confirmed.');
  }
}

export function createCourseRatingRepository(): CourseRatingRepository {
  if (hasMongoConfig()) return new MongoCourseRatingRepository();
  if (isHostedApi()) {
    const unavailable = async (): Promise<never> => { throw new Error('Course ratings are temporarily unavailable.'); };
    return { get: unavailable, upsert: unavailable, listForCourse: unavailable, setHidden: unavailable,
      collectForExport: unavailable, anonymizeForUser: unavailable };
  }
  return new InMemoryCourseRatingRepository();
}
