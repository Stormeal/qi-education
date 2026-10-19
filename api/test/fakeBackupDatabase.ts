import { BSON, type Document } from 'mongodb';
import type { BackupDatabase, RestoreDatabase } from '../src/databaseBackup.js';

export function bsonClone<T>(value: T): T {
  return BSON.EJSON.parse(BSON.EJSON.stringify(value, { relaxed: false }), { relaxed: false });
}
export function fakeBackupDatabase(databaseName: string, initial: Record<string, { documents: Document[]; indexes?: Document[] }> = {}) {
  const data = new Map(Object.entries(initial).map(([name, value]) => [name,
    { documents: value.documents.map(bsonClone), indexes: value.indexes ?? [{ name: '_id_', key: { _id: 1 }, v: 2 }] }]));
  const events: Array<{ operation: string; name: string; size?: number; options?: unknown }> = [];
  let adjustCount = (_name: string, count: number) => count;
  const database: BackupDatabase & RestoreDatabase = {
    databaseName,
    listCollections() { return { async toArray() { return [...data.keys()].map(name => ({ name })); } }; },
    async createCollection(name) {
      events.push({ operation: 'create', name });
      if (data.has(name)) throw new Error('Already exists');
      data.set(name, { documents: [], indexes: [{ name: '_id_', key: { _id: 1 }, v: 2 }] });
    },
    collection(name) {
      return {
        find(_filter, options) {
          events.push({ operation: 'find', name, options });
          return {
            async *[Symbol.asyncIterator]() { for (const document of data.get(name)?.documents ?? []) yield bsonClone(document); },
            async close() { events.push({ operation: 'close', name }); },
          };
        },
        listIndexes() { return { async toArray() { return data.get(name)?.indexes ?? []; } }; },
        async countDocuments() {
          events.push({ operation: 'count', name });
          return adjustCount(name, data.get(name)?.documents.length ?? 0);
        },
        async insertMany(documents, options) {
          events.push({ operation: 'insert', name, size: documents.length, options });
          const collection = data.get(name);
          if (!collection) throw new Error('Collection must be created first');
          collection.documents.push(...documents.map(bsonClone));
          return { acknowledged: true, insertedCount: documents.length };
        },
        async createIndexes(indexes) {
          events.push({ operation: 'indexes', name });
          data.get(name)!.indexes.push(...bsonClone(indexes));
        },
      };
    },
  };
  return { database, data, events, setCountResult(adjust: typeof adjustCount) { adjustCount = adjust; } };
}
