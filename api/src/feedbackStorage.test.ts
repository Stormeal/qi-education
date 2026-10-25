import { describe, expect, it } from 'vitest';
import {
  createFeedbackRepository, feedbackWriteFreeze, FeedbackReadOnlyError,
  FeedbackStoreUnavailableError, InMemoryFeedbackRepository, MongoFeedbackRepository,
  type FeedbackCollection, type FeedbackDocument,
} from './feedbackRepository.js';
import { buildApiConfig } from './config.js';
import type { AuthenticatedUser } from './auth.js';

const user = { id: 'user', email: 'person@example.test', role: 'student' } as AuthenticatedUser;
const input = { page: 'Home', rating: 'great' as const, message: 'Useful' };

function provider() {
  const records = new Map<string, FeedbackDocument>();
  const writes: unknown[] = [], indexes: unknown[] = [];
  const collection = {
    async createIndex(keys: unknown, options: unknown) { indexes.push([keys, options]); return 'newest'; },
    async insertOne(doc: FeedbackDocument, options: unknown) {
      writes.push(options);
      if (records.has(doc._id)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      records.set(doc._id, structuredClone(doc)); return { acknowledged: true, insertedId: doc._id };
    },
    async findOne(filter: { _id: string }) { return structuredClone(records.get(filter._id) ?? null); },
    find() { return { sort() { return { async toArray() {
      return structuredClone([...records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } }; } }; },
    async findOneAndUpdate(filter: { _id: string }, update: { $set: object; $unset?: object }, options: unknown) {
      writes.push(options);
      const found = records.get(filter._id); if (!found) return null;
      Object.assign(found, update.$set);
      for (const key of Object.keys(update.$unset ?? {})) delete (found as unknown as Record<string, unknown>)[key];
      return structuredClone(found);
    },
  } as unknown as FeedbackCollection;
  return { records, writes, indexes, collection };
}

describe('US-A006 AC07/AC09 feedback storage', () => {
  it('shares stable persisted identity between repository instances and acknowledges writes by majority', async () => {
    const db = provider();
    const first = new MongoFeedbackRepository(async () => db.collection);
    const second = new MongoFeedbackRepository(async () => db.collection);
    const created = await first.createFeedback(input, user);
    expect(db.records.get(created.id)?._id).toBe(created.id);
    expect(await second.findFeedbackById(created.id)).toEqual(created);
    expect((await second.listFeedback())[0]).toEqual(created);
    expect(db.writes[0]).toMatchObject({ writeConcern: { w: 'majority' } });
    expect(db.indexes[0]).toMatchObject([{ createdAt: -1, _id: -1 }, { name: 'feedback_newest_first' }]);
  });
  it('atomically unsets priority while retaining an already saved GitHub link', async () => {
    const db = provider(), repo = new MongoFeedbackRepository(async () => db.collection);
    const created = await repo.createFeedback(input, user);
    await repo.updateFeedbackTriage(created.id, { workStatus: 'work', priority: 'high', githubIssueNumber: 42, githubIssueUrl: 'https://github.com/org/repo/issues/42' });
    expect(await repo.updateFeedbackTriage(created.id, { workStatus: 'completed', priority: null })).toMatchObject({ workStatus: 'completed', githubIssueNumber: 42 });
    expect(db.records.get(created.id)).not.toHaveProperty('priority');
    expect(db.writes.at(-1)).toMatchObject({ writeConcern: { w: 'majority' }, returnDocument: 'after' });
  });
  it('omits undefined legacy fields rather than persisting Mongo null values that break migration verification', async () => {
    const db = provider(), repo = new MongoFeedbackRepository(async () => db.collection);
    const created = await repo.createFeedback({ ...input, userAgent: undefined }, user);
    expect(db.records.get(created.id)).not.toHaveProperty('userAgent');
  });
  it('projects stored records without leaking internal fields on list, lookup or triage', async () => {
    const db = provider(), repo = new MongoFeedbackRepository(async () => db.collection);
    const created = await repo.createFeedback(input, user);
    Object.assign(db.records.get(created.id)!, { internalMarker: 'private coordination detail', type: 'defect', summary: 'Playback stops', path: '/library/course', reproductionSteps: 'Start playback', expectedBehavior: 'Playback continues' });
    const results = [
      ...(await repo.listFeedback()),
      await repo.findFeedbackById(created.id),
      await repo.updateFeedbackTriage(created.id, { workStatus: 'completed' }),
    ];
    for (const entry of results) {
      expect(entry).not.toHaveProperty('internalMarker');
      expect(entry).not.toHaveProperty('_id');
      expect(entry).not.toHaveProperty('userAgent');
      expect(entry).not.toHaveProperty('priority');
      expect(entry).toMatchObject({ id: created.id, userId: 'user', type: 'defect', summary: 'Playback stops', path: '/library/course', reproductionSteps: 'Start playback', expectedBehavior: 'Playback continues' });
    }
  });
  it('fails closed in shared/hosted mode and uses memory only in isolation', async () => {
    const shared = createFeedbackRepository(buildApiConfig({ USE_SHARED_SERVICES: '1' }));
    expect(shared.storageType).toBe('unavailable');
    await expect(shared.createFeedback(input, user)).rejects.toBeInstanceOf(FeedbackStoreUnavailableError);
    expect(createFeedbackRepository(buildApiConfig({ NODE_ENV: 'test', MONGODB_URI: 'ignored' })).storageType).toBe('memory');
    expect(createFeedbackRepository(buildApiConfig({ USE_SHARED_SERVICES: '1', MONGODB_URI: 'mongodb://localhost', MONGODB_DB_NAME: 'test', MONGODB_COURSE_CONTENT_COLLECTION: 'content' })).storageType).toBe('mongodb');
  });
  it('wraps provider outages and retries initialization after recovery', async () => {
    const db = provider(); let unavailable = true;
    const repo = new MongoFeedbackRepository(async () => { if (unavailable) throw new Error('secret provider error'); return db.collection; });
    await expect(repo.listFeedback()).rejects.toBeInstanceOf(FeedbackStoreUnavailableError);
    unavailable = false;
    expect(await repo.listFeedback()).toEqual([]);
  });
  it('freezes both write methods while keeping reads and metadata available', async () => {
    const underlying = new InMemoryFeedbackRepository();
    const created = await underlying.createFeedback(input, user);
    const frozen = feedbackWriteFreeze(underlying, true);
    expect(frozen.readOnly).toBe(true); expect(frozen.storageType).toBe('memory');
    await expect(frozen.createFeedback(input, user)).rejects.toBeInstanceOf(FeedbackReadOnlyError);
    await expect(frozen.updateFeedbackTriage(created.id, { workStatus: 'completed' })).rejects.toBeInstanceOf(FeedbackReadOnlyError);
    expect(await frozen.findFeedbackById(created.id)).toEqual(created);
    expect(await frozen.listFeedback()).toHaveLength(1);
    expect(createFeedbackRepository(buildApiConfig({ NODE_ENV: 'test', FEEDBACK_STORE_READ_ONLY: '1' })).readOnly).toBe(true);
  });
});
