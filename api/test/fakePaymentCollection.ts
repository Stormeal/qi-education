import type { CoursePayment, PaymentCollection } from '../src/paymentRepository.js';
// Atomic in-memory Mongo operations only; no provider or database connection.
export function fakePaymentCollection() {
  const documents = new Map<string, CoursePayment>();
  const calls = { writes: [] as unknown[], finds: [] as unknown[] };
  const matches = (doc: CoursePayment, filter: Record<string, unknown>) => Object.entries(filter).every(([key, value]) => {
    const actual = (doc as unknown as Record<string, unknown>)[key];
    if (value && typeof value === 'object' && '$ne' in value) return actual !== value.$ne;
    if (value && typeof value === 'object' && '$exists' in value) return (actual !== undefined) === value.$exists;
    return actual === value;
  });
  const sorted = (filter: Record<string, unknown>, options?: { sort?: Record<string, number> }) => {
    const rows = [...documents.values()].filter(doc => matches(doc, filter));
    if (options?.sort) {
      const sort = options.sort;
      rows.sort((a, b) => {
        for (const [key, direction] of Object.entries(sort)) {
          const result = String((a as unknown as Record<string, unknown>)[key]).localeCompare(String((b as unknown as Record<string, unknown>)[key]));
          if (result) return direction * result;
        }
        return 0;
      });
    }
    return structuredClone(rows);
  };
  const operations = {
    async updateMany(filter: Record<string, unknown>, pipeline: { $project: Record<string, number> }[], options: unknown) {
      calls.writes.push({ filter, pipeline, options });
      let matchedCount = 0;
      for (const [id, doc] of documents) if (matches(doc, filter)) {
        documents.set(id, Object.fromEntries(Object.entries(doc).filter(([field]) => pipeline[0].$project[field] === 1)) as CoursePayment);
        matchedCount++;
      }
      return { acknowledged: true, matchedCount };
    },
    async createIndex() { return 'index'; },
    async insertOne(doc: CoursePayment, options: unknown) {
      calls.writes.push({ doc, options });
      if (documents.has(doc._id)) throw Object.assign(new Error('Duplicate'), { code: 11000 });
      documents.set(doc._id, structuredClone(doc)); return { acknowledged: true };
    },
    find(filter: Record<string, unknown>, options?: { sort?: Record<string, number> }) {
      calls.finds.push({ filter, options });
      return { toArray: async () => sorted(filter, options) };
    },
    async findOne(filter: Record<string, unknown>, options?: { sort?: Record<string, number> }) {
      calls.finds.push({ filter, options });
      return sorted(filter, options)[0] ?? null;
    },
    async findOneAndUpdate(filter: Record<string, unknown>, update: { $set: Partial<CoursePayment> }, options: { returnDocument?: string }) {
      calls.writes.push({ filter, update, options });
      const doc = [...documents.values()].find(doc => matches(doc, filter)); if (!doc) return null;
      const before = structuredClone(doc); Object.assign(doc, structuredClone(update.$set));
      return structuredClone(options.returnDocument === 'before' ? before : doc);
    },
  };
  return { documents, calls, operations, collection: operations as unknown as PaymentCollection };
}
