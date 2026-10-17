import type { MongoCourseCollection, MongoCourseDocument } from '../src/mongoCourseRepository.js';

export function fakeCourseCollection() {
  const documents = new Map<string, MongoCourseDocument>();
  const calls = { reads: 0, sorts: [] as unknown[], writes: [] as unknown[], indexes: [] as unknown[] };
  const operations = {
    find() {
      calls.reads++;
      return { sort(order: unknown) {
        calls.sorts.push(order);
        return { async toArray() { return structuredClone([...documents.values()].sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a._id.localeCompare(b._id))); } };
      } };
    },
    async createIndex(keys: unknown) { calls.indexes.push(keys); return 'index'; },
    async insertOne(document: MongoCourseDocument, options: unknown) {
      calls.writes.push({ document, options });
      if (documents.has(document._id)) throw Object.assign(new Error('Duplicate'), { code: 11000 });
      documents.set(document._id, structuredClone(document)); return { acknowledged: true };
    },
    async findOneAndUpdate(filter: { _id: string }, update: { $set: Partial<MongoCourseDocument> }, options: unknown) {
      calls.writes.push({ filter, update, options });
      const document = documents.get(filter._id);
      if (!document) return null;
      Object.assign(document, structuredClone(update.$set));
      return structuredClone(document);
    },
  };
  return { documents, calls, operations, collection: operations as unknown as MongoCourseCollection };
}
