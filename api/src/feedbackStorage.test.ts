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
    find(filter: Record<string, unknown> = {}) { return { sort() { return { async toArray() {
      return structuredClone([...records.values()].filter(value => Object.entries(filter).every(([key, expected]) => (value as unknown as Record<string, unknown>)[key] === expected)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } }; } }; },
    async updateMany(filter: Record<string, unknown>, update: { $set: Record<string, unknown>; $unset?: Record<string, unknown> }, options: unknown) {
      writes.push(options);
      for (const value of records.values()) {
        const record = value as unknown as Record<string, unknown>;
        if (!Object.entries(filter).every(([key, expected]) => typeof expected === 'object' && expected !== null && '$exists' in expected
          ? Object.hasOwn(record, key) === expected.$exists : record[key] === expected)) continue;
        Object.assign(record, update.$set);
        for (const key of Object.keys(update.$unset ?? {})) delete record[key];
      }
      return { acknowledged: true };
    },
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

describe.each(['memory', 'mongodb'])('US-P021 feedback privacy %s', kind => {
  const setup = () => { const db = provider(); return { ...db, repo: kind === 'memory' ? new InMemoryFeedbackRepository() : new MongoFeedbackRepository(async () => db.collection) }; };
  it('exports only caller submissions as detached whitelisted records', async () => {
    const { repo } = setup(); const mine = await repo.createFeedback(input, user);
    await repo.createFeedback({ ...input, message: 'Other text' }, { ...user, id: 'other', email: 'other@example.test' });
    const exported = await repo.collectForExport('user'); expect(exported).toEqual([mine]);
    exported[0].message = 'Changed'; expect((await repo.collectForExport('user'))[0].message).toBe('Useful');
  });
  it('anonymizes submitter email, retains general text, clears lesson text and preserves unrelated users on retry', async () => {
    const { repo } = setup(); const general = await repo.createFeedback(input, user);
    const lesson = await repo.createFeedback({ ...input, lessonFeedbackKind: 'problem', courseId: 'course', componentId: 'lesson', message: 'Private lesson comment' }, user);
    const other = await repo.createFeedback(input, { ...user, id: 'other', email: 'other@example.test' });
    await repo.anonymizeForUser('user'); await repo.anonymizeForUser('user');
    expect(await repo.findFeedbackById(general.id)).toMatchObject({ userEmail: '', message: 'Useful', userId: 'user' });
    expect(await repo.findFeedbackById(lesson.id)).toMatchObject({ userEmail: '', message: '', lessonFeedbackKind: 'problem', rating: 'great' });
    expect(await repo.findFeedbackById(other.id)).toEqual(other);
  });
  it('allows scoped export during freeze while refusing anonymization', async () => {
    const { repo } = setup(); await repo.createFeedback(input, user); const frozen = feedbackWriteFreeze(repo, true);
    expect(await frozen.collectForExport('user')).toHaveLength(1);
    await expect(frozen.anonymizeForUser('user')).rejects.toBeInstanceOf(FeedbackReadOnlyError);
    expect((await repo.listFeedback())[0].userEmail).toBe('person@example.test');
  });
});
