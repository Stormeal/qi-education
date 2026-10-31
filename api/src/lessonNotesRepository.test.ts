import { afterEach, describe, expect, it, vi } from 'vitest';
import * as config from './config.js';
import { LessonNoteLimitError } from './lessonNotes.js';
import { createLessonNotesRepository, InMemoryLessonNotesRepository, MongoLessonNotesRepository,
  type LessonNotesCollection, type LessonNotesDocument } from './lessonNotesRepository.js';

// Isolated Mongo operation semantics: no Mongo client or shared data.
function memoryCollection() {
  const documents = new Map<string, LessonNotesDocument>();
  type Filter = { _id: string; userId: string; courseId: string; 'notes.id'?: string; 'notes.499'?: unknown };
  function matching(filter: Filter) {
    const doc = documents.get(filter._id);
    if (!doc || doc.userId !== filter.userId || doc.courseId !== filter.courseId) return null;
    if (filter['notes.id'] && !doc.notes.some(note => note.id === filter['notes.id'])) return null;
    if (filter['notes.499'] && doc.notes.length >= 500) return null;
    return doc;
  }
  const operations = {
    find(filter: { userId: string }) {
      return { async toArray() { return structuredClone([...documents.values()].filter(doc => doc.userId === filter.userId)); } };
    },
    async deleteMany(filter: { userId: string }) {
      let deletedCount = 0;
      for (const [id, doc] of documents) if (doc.userId === filter.userId) { documents.delete(id); deletedCount++; }
      return { acknowledged: true, deletedCount };
    },
    async findOne(filter: Filter) { return structuredClone(matching(filter)); },
    async updateOne(filter: Filter, update: any, options?: { upsert?: boolean }) {
      let doc = matching(filter);
      const existed = !!doc;
      if (!doc && options?.upsert) {
        if (documents.has(filter._id)) throw { code: 11000 };
        doc = { _id: filter._id, userId: filter.userId, courseId: filter.courseId, notes: [] };
        documents.set(doc._id, doc);
      }
      if (doc && update.$push) doc.notes.push(structuredClone(update.$push.notes));
      if (doc && update.$pull) doc.notes = doc.notes.filter(note => note.id !== update.$pull.notes.id);
      return { acknowledged: true, matchedCount: existed ? 1 : 0, modifiedCount: existed ? 1 : 0, upsertedCount: !existed && doc ? 1 : 0 };
    },
    async findOneAndUpdate(filter: Filter, update: any) {
      const doc = matching(filter);
      const note = doc?.notes.find(note => note.id === filter['notes.id']);
      if (note) { note.text = update.$set['notes.$.text']; note.updatedAt = update.$set['notes.$.updatedAt']; }
      return structuredClone(doc);
    },
  };
  return { operations, collection: operations as unknown as LessonNotesCollection };
}

describe.each(['memory', 'mongo'])('US-L015 AC01–AC03 notes storage (%s)', kind => {
  function setup() {
    const { collection, operations } = memoryCollection();
    return { repository: kind === 'memory' ? new InMemoryLessonNotesRepository() : new MongoLessonNotesRepository(async () => collection), operations };
  }
  const input = { componentId: 'video', text: 'Private', videoSeconds: 95 };
  it('isolates account and course, clones snapshots, and preserves identity/time on updates', async () => {
    const { repository } = setup();
    const note = await repository.add('a', 'course', input);
    note.text = 'Mutated';
    expect((await repository.list('a', 'course'))[0].text).toBe('Private');
    expect(await repository.list('b', 'course')).toEqual([]);
    expect(await repository.list('a', 'other-course')).toEqual([]);
    for (const [account, course] of [['b', 'course'], ['a', 'other-course']]) {
      expect(await repository.update(account, course, note.id, 'Stolen')).toBeNull();
      expect(await repository.delete(account, course, note.id)).toBe(false);
    }
    const changed = await repository.update('a', 'course', note.id, 'Revised');
    expect(changed).toEqual({ ...note, text: 'Revised', updatedAt: expect.any(String) });
    changed!.text = 'Mutated';
    expect((await repository.list('a', 'course'))[0].text).toBe('Revised');
    expect(await repository.delete('a', 'course', note.id)).toBe(true);
    expect(await repository.delete('a', 'course', note.id)).toBe(false);
    expect(await repository.update('a', 'course', note.id, 'Missing')).toBeNull();
  });
  it('atomically caps simultaneous additions at 500 per account/course and frees a slot after delete', async () => {
    const { repository } = setup();
    const results = await Promise.allSettled(Array.from({ length: 502 }, () => repository.add('a', 'course', input)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(500);
    for (const result of results.filter(result => result.status === 'rejected')) expect(result.reason).toBeInstanceOf(LessonNoteLimitError);
    const notes = await repository.list('a', 'course');
    expect(notes).toHaveLength(500);
    await repository.add('b', 'course', input); await repository.add('a', 'other', input);
    await repository.delete('a', 'course', notes[0].id);
    await repository.add('a', 'course', input);
    expect(await repository.list('a', 'course')).toHaveLength(500);
  });
});

describe('US-L015 Mongo failures and factory', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  it('retries only a duplicate first-write race against the bounded document', async () => {
    const { collection, operations } = memoryCollection();
    const repository = new MongoLessonNotesRepository(async () => collection);
    await repository.add('a', 'course', { componentId: 'x', text: 'First', videoSeconds: null });
    vi.spyOn(operations, 'updateOne').mockRejectedValueOnce({ code: 11000 });
    await repository.add('a', 'course', { componentId: 'x', text: 'Second', videoSeconds: null });
    expect((await repository.list('a', 'course')).map(note => note.text)).toEqual(['First', 'Second']);
  });
  it('propagates storage errors without reporting success', async () => {
    const repository = new MongoLessonNotesRepository(async () => { throw new Error('Offline'); });
    await expect(repository.list('a', 'course')).rejects.toThrow('Offline');
    await expect(repository.add('a', 'course', { componentId: 'x', text: 'Note', videoSeconds: null })).rejects.toThrow('Offline');
    await expect(repository.update('a', 'course', 'x', 'New')).rejects.toThrow('Offline');
    await expect(repository.delete('a', 'course', 'x')).rejects.toThrow('Offline');
  });
  it('selects memory in isolated mode and configured Mongo without connecting', () => {
    expect(createLessonNotesRepository()).toBeInstanceOf(InMemoryLessonNotesRepository);
    vi.spyOn(config, 'hasMongoConfig').mockReturnValue(true);
    expect(createLessonNotesRepository()).toBeInstanceOf(MongoLessonNotesRepository);
  });
});
