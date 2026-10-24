// Driver double for isolated organization repository and HTTP journey tests.
import type { OrganizationCollection, OrganizationCollections } from './organizationRepository.js';
// `log` records each find filter and index, so tests can check what reaches the database (X8 F6).
export function fakeOrganizationCollections(log?: { finds: { table: string; filter: Record<string, unknown> }[]; indexes: { table: string; keys: Record<string, unknown> }[] }): OrganizationCollections {
  const tables = new Map<string, OrganizationCollection>();
  return async name => {
    let table = tables.get(name); if (table) return table;
    const rows = new Map<string, Record<string, unknown>>();
    const indexes: { keys: Record<string, unknown>; unique?: boolean; partialFilterExpression?: Record<string, unknown> }[] = [];
    const matches = (v: Record<string, unknown>, filter: Record<string, unknown>) => Object.entries(filter).every(([k,x]) => v[k] === x);
    function unique(value: Record<string, unknown>, id?: string) {
      if (rows.has(String(value._id)) && id === undefined) throw Object.assign(new Error('duplicate'), { code: 11000 });
      for (const index of indexes) if (index.unique && matches(value, index.partialFilterExpression ?? {})) {
        if ([...rows.values()].some(v => v._id !== id && matches(v, index.partialFilterExpression ?? {}) && Object.keys(index.keys).every(k => v[k] === value[k]))) throw Object.assign(new Error('duplicate'), { code: 11000 });
      }
    }
    table = {
      find: (filter: Record<string, unknown> = {}) => {
        log?.finds.push({ table: name, filter });
        return { toArray: async () => structuredClone([...rows.values()].filter(v => matches(v, filter))) };
      },
      createIndex: async (keys: Record<string, unknown>, options: object = {}) => { indexes.push({ keys, ...options }); log?.indexes.push({ table: name, keys }); return 'index'; },
      insertOne: async (v: Record<string, unknown>) => { unique(v); rows.set(String(v._id), structuredClone(v)); return {}; },
      updateOne: async (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
        const row = [...rows.values()].find(v => matches(v, filter)); if (!row) return { matchedCount: 0 };
        const next = { ...row, ...update.$set }; unique(next, String(row._id)); rows.set(String(row._id), structuredClone(next)); return { matchedCount: 1 };
      },
      deleteOne: async (filter: Record<string, unknown>) => { const row = [...rows.values()].find(v => matches(v, filter)); return { deletedCount: row && rows.delete(String(row._id)) ? 1 : 0 }; },
    } as unknown as OrganizationCollection;
    tables.set(name, table); return table;
  };
}
