import type { ClientLimitCollection, ClientLimitDocument } from '../src/clientLimitRepository.js';

export function fakeClientLimitCollection() {
  const documents = new Map<string, ClientLimitDocument>();
  const indexes: unknown[] = [];
  const updates: unknown[] = [];
  const collection: ClientLimitCollection = {
    async createIndex(keys, options) { indexes.push({ keys, options }); },
    async findOneAndUpdate(filter, update, options) {
      await Promise.resolve();
      updates.push({ filter, update, options });
      let document = documents.get(filter._id);
      if (!document) {
        document = { _id: filter._id, count: 0, expiresAt: new Date(update.$setOnInsert.expiresAt) };
        documents.set(filter._id, document);
      }
      document.count += update.$inc.count;
      return structuredClone(document);
    },
  };
  return { collection, documents, indexes, updates };
}
