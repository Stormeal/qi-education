// Isolated operation semantics shared by account repository/HTTP tests only.
import type { MongoAuthCollection, MongoAuthDocument } from '../src/mongoAuthRepository.js';

export function fakeAuthCollection() {
  const documents = new Map<string, MongoAuthDocument>();
  let uniqueEmailIndex = false;
  const duplicate = () => Object.assign(new Error('Duplicate'), { code: 11000 });
  const checkEmail = (document: MongoAuthDocument) => {
    if (uniqueEmailIndex && [...documents.values()].some(other => other._id !== document._id && other.email === document.email)) throw duplicate();
  };
  const calls = { finds: [] as Record<string, unknown>[], counts: [] as Record<string, unknown>[], indexes: [] as unknown[], writes: [] as unknown[] };
  type Filter = Record<string, unknown>;
  const matches = (doc: MongoAuthDocument, filter: Filter) => Object.entries(filter).every(([key, value]) => {
    const actual = doc[key as keyof MongoAuthDocument];
    if (value && typeof value === 'object' && '$ne' in value) return actual !== value.$ne;
    return Array.isArray(actual) ? actual.includes(value as string) : actual === value;
  });
  const operations = {
    async createIndex(keys: unknown, options: unknown) {
      calls.indexes.push({ keys, options });
      if (keys && typeof keys === 'object' && 'email' in keys && Object.keys(keys).length === 1 &&
        options && typeof options === 'object' && 'unique' in options && options.unique === true) {
        const seen = new Set<string>();
        for (const document of documents.values()) {
          if (seen.has(document.email)) throw duplicate();
          seen.add(document.email);
        }
        uniqueEmailIndex = true;
      }
      return 'index';
    },
    async findOne(filter: Filter) { calls.finds.push(filter); return structuredClone([...documents.values()].find(doc => matches(doc, filter)) ?? null); },
    find() { return { async toArray() { return structuredClone([...documents.values()]); } }; },
    async insertOne(document: MongoAuthDocument, options: unknown) {
      calls.writes.push({ document, options });
      // _id is always unique. Email is unique only after a successful index
      // build, using Mongo's default binary comparison (normalization is the
      // repository's responsibility). Check and insert have no intervening yield.
      if (documents.has(document._id)) throw duplicate();
      checkEmail(document);
      documents.set(document._id, structuredClone(document)); return { acknowledged: true };
    },
    async findOneAndUpdate(filter: Filter, update: { $set?: Partial<MongoAuthDocument>; $addToSet?: { enrolledCourseIds: string } }, options: { returnDocument?: string }) {
      calls.writes.push({ filter, update, options });
      const document = [...documents.values()].find(doc => matches(doc, filter));
      if (!document) return null;
      const before = structuredClone(document);
      const next = { ...structuredClone(document), ...structuredClone(update.$set) };
      if (update.$addToSet && !next.enrolledCourseIds.includes(update.$addToSet.enrolledCourseIds)) next.enrolledCourseIds.push(update.$addToSet.enrolledCourseIds);
      checkEmail(next);
      Object.assign(document, next);
      return structuredClone(options.returnDocument === 'before' ? before : document);
    },
    async countDocuments(filter: Filter) { calls.counts.push(filter); return [...documents.values()].filter(doc => matches(doc, filter)).length; },
  };
  return { documents, calls, operations, collection: operations as unknown as MongoAuthCollection };
}
