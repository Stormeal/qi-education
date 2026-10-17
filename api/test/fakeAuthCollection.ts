// Isolated operation semantics shared by account repository/HTTP tests only.
import type { MongoAuthCollection, MongoAuthDocument } from '../src/mongoAuthRepository.js';

export function fakeAuthCollection() {
  const documents = new Map<string, MongoAuthDocument>();
  const calls = { finds: [] as Record<string, unknown>[], counts: [] as Record<string, unknown>[], indexes: [] as unknown[], writes: [] as unknown[] };
  type Filter = Record<string, unknown>;
  const matches = (doc: MongoAuthDocument, filter: Filter) => Object.entries(filter).every(([key, value]) => {
    const actual = doc[key as keyof MongoAuthDocument];
    if (value && typeof value === 'object' && '$ne' in value) return actual !== value.$ne;
    return Array.isArray(actual) ? actual.includes(value as string) : actual === value;
  });
  const operations = {
    async createIndex(keys: unknown, options: unknown) { calls.indexes.push({ keys, options }); return 'index'; },
    async findOne(filter: Filter) { calls.finds.push(filter); return structuredClone([...documents.values()].find(doc => matches(doc, filter)) ?? null); },
    find() { return { async toArray() { return structuredClone([...documents.values()]); } }; },
    async insertOne(document: MongoAuthDocument, options: unknown) {
      calls.writes.push({ document, options });
      if (documents.has(document._id) || [...documents.values()].some(doc => doc.email === document.email)) throw Object.assign(new Error('Duplicate'), { code: 11000 });
      documents.set(document._id, structuredClone(document)); return { acknowledged: true };
    },
    async findOneAndUpdate(filter: Filter, update: { $set?: Partial<MongoAuthDocument>; $addToSet?: { enrolledCourseIds: string } }, options: { returnDocument?: string }) {
      calls.writes.push({ filter, update, options });
      const document = [...documents.values()].find(doc => matches(doc, filter));
      if (!document) return null;
      const before = structuredClone(document);
      Object.assign(document, update.$set);
      if (update.$addToSet && !document.enrolledCourseIds.includes(update.$addToSet.enrolledCourseIds)) document.enrolledCourseIds.push(update.$addToSet.enrolledCourseIds);
      return structuredClone(options.returnDocument === 'before' ? before : document);
    },
    async countDocuments(filter: Filter) { calls.counts.push(filter); return [...documents.values()].filter(doc => matches(doc, filter)).length; },
  };
  return { documents, calls, operations, collection: operations as unknown as MongoAuthCollection };
}
