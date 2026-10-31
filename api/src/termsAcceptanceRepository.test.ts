import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTermsAcceptanceRepository, InMemoryTermsAcceptanceRepository, MongoTermsAcceptanceRepository,
  type Acceptance, type TermsAcceptanceCollection, type TermsAcceptanceRepository } from './termsAcceptanceRepository.js';

// A storage-boundary double exercises the real Mongo adapter without a database connection.
function mongoCollection() {
  const rows: Acceptance[] = [];
  const collection: TermsAcceptanceCollection = {
    createIndex: vi.fn(async () => 'user_document_version'),
    updateOne: vi.fn(async (filter, update) => {
      if (!rows.some(row => row.userId === filter.userId && row.documentId === filter.documentId && row.version === filter.version)) {
        rows.push(structuredClone(update.$setOnInsert));
      }
      return { acknowledged: true };
    }),
    findOne: vi.fn(async (filter) => structuredClone(rows.filter(row => row.userId === filter.userId && row.documentId === filter.documentId
      && (filter.version === undefined || row.version === filter.version)).sort((a, b) => b.version - a.version)[0] ?? null)),
    find: vi.fn((filter) => ({ toArray: async () => structuredClone(rows.filter(row => row.userId === filter.userId)) })),
  };
  return collection;
}

describe.each(['memory', 'mongo'] as const)('US-P022 acceptance repository %s', adapter => {
  let repository: TermsAcceptanceRepository;
  let collection: TermsAcceptanceCollection;
  beforeEach(() => {
    collection = mongoCollection();
    repository = adapter === 'memory' ? new InMemoryTermsAcceptanceRepository() : new MongoTermsAcceptanceRepository(async () => collection);
  });

  it('starts empty, isolates users and documents, and returns the highest accepted version', async () => {
    expect(await repository.latestAccepted('ada', 'tos')).toBeNull();
    await repository.record('ada', 'tos', 1);
    await repository.record('ada', 'tos', 3);
    await repository.record('ada', 'tos', 2);
    await repository.record('ada', 'purchase', 5);
    await repository.record('bob', 'tos', 9);
    expect(await repository.latestAccepted('ada', 'tos')).toBe(3);
    expect(await repository.latestAccepted('ada', 'purchase')).toBe(5);
    expect(await repository.latestAccepted('bob', 'tos')).toBe(9);
    expect(await repository.listForUser('missing')).toEqual([]);
    const rows = await repository.listForUser('ada');
    expect(rows).toHaveLength(4);
    expect(rows.every(row => row.userId === 'ada' && !Number.isNaN(Date.parse(row.acceptedAt)))).toBe(true);
  });

  it('records duplicate and concurrent acceptance once without changing the original timestamp', async () => {
    await repository.record('ada', 'tos', 1);
    const original = await repository.listForUser('ada');
    await Promise.all([repository.record('ada', 'tos', 1), repository.record('ada', 'tos', 1)]);
    expect(await repository.listForUser('ada')).toEqual(original);
    expect(original).toEqual([{ userId: 'ada', documentId: 'tos', version: 1, acceptedAt: expect.any(String) }]);
    original[0].version = 99;
    expect(await repository.latestAccepted('ada', 'tos')).toBe(1);
  });

  it('exports only the caller acceptance evidence without user identifiers', async () => {
    await repository.record('ada', 'purchase', 2);
    await repository.record('bob', 'tos', 4);
    expect(await repository.collectForExport('ada')).toEqual([{ documentId: 'purchase', version: 2, acceptedAt: expect.any(String) }]);
  });
});

describe('US-P022 Mongo acceptance guarantees', () => {
  it('creates the compound unique index and upserts immutable evidence with majority acknowledgement', async () => {
    const collection = mongoCollection();
    const repository = new MongoTermsAcceptanceRepository(async () => collection);
    await repository.record('ada', 'tos', 1);
    expect(collection.createIndex).toHaveBeenCalledWith({ userId: 1, documentId: 1, version: 1 },
      { unique: true, name: 'user_document_version' });
    expect(collection.updateOne).toHaveBeenCalledWith({ userId: 'ada', documentId: 'tos', version: 1 }, {
      $setOnInsert: { userId: 'ada', documentId: 'tos', version: 1, acceptedAt: expect.any(String) },
    }, { upsert: true, writeConcern: { w: 'majority' } });
  });

  it('tolerates a duplicate-key race only when that acceptance exists', async () => {
    const collection = mongoCollection();
    const repository = new MongoTermsAcceptanceRepository(async () => collection);
    await repository.record('ada', 'tos', 1);
    vi.mocked(collection.updateOne).mockRejectedValue({ code: 11000 });
    await expect(repository.record('ada', 'tos', 1)).resolves.toBeUndefined();
    await expect(repository.record('bob', 'tos', 1)).rejects.toEqual({ code: 11000 });
  });

  it('propagates unconfirmed writes and storage failures instead of claiming acceptance', async () => {
    const collection = mongoCollection();
    const repository = new MongoTermsAcceptanceRepository(async () => collection);
    vi.mocked(collection.updateOne).mockResolvedValue({ acknowledged: false });
    await expect(repository.record('ada', 'tos', 1)).rejects.toThrow();
    vi.mocked(collection.findOne).mockRejectedValue(new Error('offline'));
    await expect(repository.latestAccepted('ada', 'tos')).rejects.toThrow('offline');
  });

  it('uses unseeded in-memory storage in test mode', async () => {
    const repository = createTermsAcceptanceRepository();
    expect(repository).toBeInstanceOf(InMemoryTermsAcceptanceRepository);
    expect(await repository.listForUser('demo-student')).toEqual([]);
  });
});
