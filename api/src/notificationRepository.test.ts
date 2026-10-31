import { describe, expect, it, vi } from 'vitest';
import { InMemoryNotificationRepository, MongoNotificationRepository, createNotificationRepository, type NotificationCollection } from './notificationRepository.js';

const input = (userId = 'one', title = 'Notice') => ({ userId, type: 'org-invitation' as const, title, link: '/organization' });
describe('US-P019 A2 notification storage', () => {
  it('lists the newest 50 snapshots for the caller while counting all unread rows', async () => {
    let now = 0;
    const repo = new InMemoryNotificationRepository(() => new Date(now++));
    for (let i = 0; i < 55; i++) await repo.create(input('one', String(i)));
    await repo.create(input('two'));
    const list = await repo.listForUser('one');
    expect(list).toHaveLength(50);
    expect(list.map(n => n.title)).toEqual(Array.from({ length: 50 }, (_, i) => String(54 - i)));
    expect(await repo.countUnread('one')).toBe(55);
    list[0].title = 'mutated';
    expect((await repo.listForUser('one'))[0].title).toBe('54');
    expect(await repo.listForUser('one', 500)).toHaveLength(50);
  });
  it('scopes individual/all read writes and preserves the first read timestamp', async () => {
    let now = 0;
    const repo = new InMemoryNotificationRepository(() => new Date(now++));
    const first = await repo.create(input()), foreign = await repo.create(input('two'));
    expect(await repo.markRead(first.id, 'two')).toBe(false);
    expect(await repo.countUnread('one')).toBe(1);
    expect(await repo.markRead(first.id, 'one')).toBe(true);
    const readAt = (await repo.listForUser('one'))[0].readAt;
    expect(readAt).not.toBeNull();
    expect(await repo.markRead(first.id, 'one')).toBe(true);
    expect((await repo.listForUser('one'))[0].readAt).toBe(readAt);
    await repo.create(input());
    await repo.markAllRead('one');
    expect(await repo.countUnread('one')).toBe(0);
    expect(await repo.countUnread('two')).toBe(1);
    expect(await repo.markRead(foreign.id, 'one')).toBe(false);
    expect(await repo.markRead('missing', 'one')).toBe(false);
  });
  it('uses fresh isolated stores in tests', async () => {
    const first = createNotificationRepository(), second = createNotificationRepository();
    expect(first).toBeInstanceOf(InMemoryNotificationRepository);
    await first.create(input());
    expect(await second.listForUser('one')).toEqual([]);
  });
});

describe('US-P019 A2 Mongo driver boundary (no live database)', () => {
  function fixture() {
    const cursor = { sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([]) };
    const collection = { deleteMany: vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 }), createIndex: vi.fn().mockResolvedValue('index'), insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
      find: vi.fn(() => cursor), findOne: vi.fn().mockResolvedValue(null),
      updateOne: vi.fn().mockResolvedValue({ acknowledged: true, matchedCount: 1 }),
      updateMany: vi.fn().mockResolvedValue({ acknowledged: true }), countDocuments: vi.fn().mockResolvedValue(3) };
    const repo = new MongoNotificationRepository(async () => collection as unknown as NotificationCollection, () => new Date(0));
    return { repo, collection, cursor };
  }
  it('uses acknowledged writes, account filters, bounded sorting and indexes', async () => {
    const { repo, collection: c, cursor } = fixture();
    const row = await repo.create(input());
    expect(c.insertOne).toHaveBeenCalledWith({ _id: row.id, ...row }, { writeConcern: { w: 'majority' } });
    await repo.listForUser('one', 999);
    expect(c.find).toHaveBeenCalledWith({ userId: 'one' }, { projection: { _id: 0 } });
    expect(cursor.sort).toHaveBeenCalledWith({ createdAt: -1, id: -1 });
    expect(cursor.limit).toHaveBeenCalledWith(50);
    expect(await repo.markRead(row.id, 'one')).toBe(true);
    expect(c.updateOne).toHaveBeenCalledWith({ _id: row.id, userId: 'one', readAt: null },
      { $set: { readAt: new Date(0).toISOString() } }, { writeConcern: { w: 'majority' } });
    await repo.markAllRead('one');
    expect(c.updateMany).toHaveBeenCalledWith({ userId: 'one', readAt: null }, expect.any(Object), { writeConcern: { w: 'majority' } });
    expect(await repo.countUnread('one')).toBe(3);
    expect(c.countDocuments).toHaveBeenCalledWith({ userId: 'one', readAt: null });
    expect(c.createIndex).toHaveBeenCalledWith({ userId: 1, readAt: 1 });
  });
  it('never treats a foreign/nonexistent row as read or acknowledges uncertain writes', async () => {
    const { repo, collection: c } = fixture();
    c.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 0 });
    expect(await repo.markRead('foreign', 'one')).toBe(false);
    expect(c.findOne).toHaveBeenCalledWith({ _id: 'foreign', userId: 'one' }, { projection: { _id: 1 } });
    c.insertOne.mockResolvedValue({ acknowledged: false });
    await expect(repo.create(input())).rejects.toThrow('not confirmed');
    c.updateOne.mockResolvedValue({ acknowledged: false, matchedCount: 0 });
    await expect(repo.markRead('id', 'one')).rejects.toThrow('not confirmed');
    c.updateMany.mockResolvedValue({ acknowledged: false });
    await expect(repo.markAllRead('one')).rejects.toThrow('not confirmed');
  });
});
