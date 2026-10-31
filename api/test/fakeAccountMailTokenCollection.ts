import type { PasswordResetCollection, PasswordResetDocument } from '../src/passwordResetRepository.js';

// Both reset and confirmation adapters use the production CAS implementation.
export function fakeAccountMailTokenCollection() {
  const documents = new Map<string, PasswordResetDocument>();
  const collection: PasswordResetCollection = {
    async deleteOne(filter) { documents.delete(filter._id); return { acknowledged: true }; },
    async findOne(filter) { return structuredClone(filter._id ? documents.get(filter._id) ?? null
      : [...documents.values()].find(doc => doc.tokens.some(token => token.hash === filter['tokens.hash'])) ?? null); },
    async insertOne(document) {
      if (documents.has(document._id)) throw { code: 11000 };
      documents.set(document._id, structuredClone(document));
    },
    async replaceOne(filter, document) {
      const current = documents.get(filter._id);
      if (current?.version !== filter.version) return { matchedCount: 0 };
      documents.set(document._id, structuredClone(document)); return { matchedCount: 1 };
    },
  };
  return { collection, documents };
}
