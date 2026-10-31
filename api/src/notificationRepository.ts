import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Collection } from 'mongodb';
import { apiConfig, hasMongoConfig } from './config.js';
import { getMongoDatabase } from './mongo.js';
import type { NewNotification, Notification } from './notification.js';

export interface NotificationRepository {
  collectForExport(userId: string): Promise<Notification[]>;
  removeForUser(userId: string): Promise<void>;
  create(input: NewNotification): Promise<Notification>;
  listForUser(userId: string, limit?: number): Promise<Notification[]>;
  markRead(id: string, userId: string): Promise<boolean>;
  markAllRead(userId: string): Promise<void>;
  countUnread(userId: string): Promise<number>;
  /** Calls listener after any change to this account's rows; resolves to an unsubscribe. */
  subscribe(userId: string, listener: () => void): Promise<() => void>;
}
type NotificationDocument = Notification & { _id: string };
export type NotificationCollection = Pick<Collection<NotificationDocument>,
  'createIndex' | 'insertOne' | 'find' | 'findOne' | 'updateOne' | 'updateMany' | 'countDocuments' | 'deleteMany'>
  & Partial<Pick<Collection<NotificationDocument>, 'watch'>>;
const exportNotification = ({ id, userId, type, title, link, createdAt, readAt }: Notification): Notification =>
  ({ id, userId, type, title, link, createdAt, readAt });
const limitFor = (limit = 50) => Number.isSafeInteger(limit) ? Math.max(1, Math.min(50, limit)) : 50;
const createRow = (input: NewNotification, now: () => Date): Notification => ({
  ...input, id: randomUUID(), createdAt: now().toISOString(), readAt: null,
});

export class InMemoryNotificationRepository implements NotificationRepository {
  async collectForExport(userId: string): Promise<Notification[]> {
    return [...this.rows.values()].filter(row => row.userId === userId).map(exportNotification);
  }
  async removeForUser(userId: string): Promise<void> {
    for (const [id, row] of this.rows) if (row.userId === userId) this.rows.delete(id);
    this.changes.emit(userId);
  }

  private readonly rows = new Map<string, Notification>();
  private readonly changes = new EventEmitter().setMaxListeners(0);
  constructor(private readonly now: () => Date = () => new Date()) {}
  async create(input: NewNotification): Promise<Notification> {
    const row = createRow(input, this.now);
    this.rows.set(row.id, structuredClone(row)); this.changes.emit(row.userId); return structuredClone(row);
  }
  async listForUser(userId: string, limit = 50): Promise<Notification[]> {
    return structuredClone([...this.rows.values()].filter(n => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, limitFor(limit)));
  }
  async markRead(id: string, userId: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return false;
    if (row.readAt === null) { row.readAt = this.now().toISOString(); this.changes.emit(userId); }
    return true;
  }
  async markAllRead(userId: string): Promise<void> {
    const time = this.now().toISOString();
    for (const row of this.rows.values()) if (row.userId === userId) row.readAt ??= time;
    this.changes.emit(userId);
  }
  async countUnread(userId: string): Promise<number> {
    return [...this.rows.values()].filter(n => n.userId === userId && n.readAt === null).length;
  }
  async subscribe(userId: string, listener: () => void): Promise<() => void> {
    this.changes.on(userId, listener);
    return () => { this.changes.off(userId, listener); };
  }
}

export class MongoNotificationRepository implements NotificationRepository {
  async collectForExport(userId: string): Promise<Notification[]> {
    return (await (await this.collection()).find({ userId }).toArray()).map(exportNotification);
  }
  async removeForUser(userId: string): Promise<void> {
    const result = await (await this.collection()).deleteMany({ userId }, { writeConcern: { w: 'majority' } });
    if (!result.acknowledged) throw new Error('Notification deletion was not confirmed.');
  }

  private indexes?: Promise<NotificationCollection>;
  constructor(private readonly loader: () => Promise<NotificationCollection> = async () =>
    (await getMongoDatabase()).collection<NotificationDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_notifications`),
  private readonly now: () => Date = () => new Date()) {}
  private collection(): Promise<NotificationCollection> {
    return this.indexes ??= this.loader().then(async collection => {
      await collection.createIndex({ userId: 1, createdAt: -1, id: -1 });
      await collection.createIndex({ userId: 1, readAt: 1 });
      return collection;
    }).catch(error => { this.indexes = undefined; throw error; });
  }
  async create(input: NewNotification): Promise<Notification> {
    const row = createRow(input, this.now);
    const result = await (await this.collection()).insertOne({ _id: row.id, ...row }, { writeConcern: { w: 'majority' } });
    if (!result.acknowledged) throw new Error('Notification creation was not confirmed.');
    return row;
  }
  async listForUser(userId: string, limit = 50): Promise<Notification[]> {
    const rows = await (await this.collection()).find({ userId }, { projection: { _id: 0 } })
      .sort({ createdAt: -1, id: -1 }).limit(limitFor(limit)).toArray();
    return rows.map(({ id, userId, type, title, link, createdAt, readAt }) => ({ id, userId, type, title, link, createdAt, readAt }));
  }
  async markRead(id: string, userId: string): Promise<boolean> {
    const collection = await this.collection();
    const result = await collection.updateOne({ _id: id, userId, readAt: null },
      { $set: { readAt: this.now().toISOString() } }, { writeConcern: { w: 'majority' } });
    if (!result.acknowledged) throw new Error('Notification read was not confirmed.');
    return result.matchedCount > 0 || !!await collection.findOne({ _id: id, userId }, { projection: { _id: 1 } });
  }
  async markAllRead(userId: string): Promise<void> {
    const result = await (await this.collection()).updateMany({ userId, readAt: null },
      { $set: { readAt: this.now().toISOString() } }, { writeConcern: { w: 'majority' } });
    if (!result.acknowledged) throw new Error('Notifications read was not confirmed.');
  }
  async countUnread(userId: string): Promise<number> {
    return (await this.collection()).countDocuments({ userId, readAt: null });
  }
  // A change stream reaches every server instance, so a notice written elsewhere still arrives.
  async subscribe(userId: string, listener: () => void): Promise<() => void> {
    const collection = await this.collection();
    if (!collection.watch) return () => {};
    const stream = collection.watch([{ $match: { 'fullDocument.userId': userId } }], { fullDocument: 'updateLookup' });
    stream.on('change', listener);
    stream.on('error', () => { void stream.close().catch(() => {}); });
    return () => { void stream.close().catch(() => {}); };
  }
}

export function createNotificationRepository(): NotificationRepository {
  if (apiConfig.mode === 'isolated') return new InMemoryNotificationRepository();
  if (hasMongoConfig()) return new MongoNotificationRepository();
  const unavailable = async (): Promise<never> => { throw new Error('Notification storage is temporarily unavailable.'); };
  return { create: unavailable, listForUser: unavailable, markRead: unavailable, markAllRead: unavailable, countUnread: unavailable, subscribe: unavailable, collectForExport: unavailable, removeForUser: unavailable };
}
