import { apiConfig, hasMongoConfig, isHostedApi } from './config.js';
import { getMongoDatabase } from './mongo.js';
import { SYSTEM_ACCOUNT_ID } from './systemAccount.js';

export type UserChange = {
  id: string;
  at: string;
  actor: { id: string; displayName: string };
  target: { id: string; displayName: string; email: string };
  field: 'role' | 'status';
  from: string;
  to: string;
};
export type UserChangeOptions = { now?: () => number; createId?: () => string };
export interface UserChangeRepository {
  anonymizeForUser(userId: string): Promise<void>;
  recordErasure(userId: string, at: string): Promise<void>;
  append(change: UserChange): Promise<void>;
  recent(): Promise<UserChange[]>;
}

// Whitelist at both storage and HTTP boundaries; never expose extra account/document fields.
export function userChangeDto(change: UserChange): UserChange {
  return {
    id: change.id, at: change.at,
    actor: { id: change.actor.id, displayName: change.actor.displayName },
    target: { id: change.target.id, displayName: change.target.displayName, email: change.target.email },
    field: change.field, from: change.from, to: change.to,
  };
}
type UserChangeDocument = Omit<UserChange, 'id'> & { _id: string };
export type UserChangeCollection = {
  updateMany(filter: Record<string, unknown>, update: { $set: Record<string, unknown> }, options: { writeConcern: { w: 'majority' } }): Promise<{ acknowledged: boolean }>;
  updateOne(filter: { _id: string }, update: { $setOnInsert: UserChangeDocument }, options: { upsert: true; writeConcern: { w: 'majority' } }): Promise<{ acknowledged: boolean }>;
  insertOne(document: UserChangeDocument, options: { writeConcern: { w: 'majority' } }): Promise<unknown>;
  find(): { sort(order: { at: -1; _id: -1 }): { limit(count: number): { toArray(): Promise<UserChangeDocument[]> } } };
};

export class MongoUserChangeRepository implements UserChangeRepository {
  constructor(private readonly collectionLoader: () => Promise<UserChangeCollection> = async () =>
    (await getMongoDatabase()).collection<UserChangeDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_user_changes`)) {}

  async anonymizeForUser(userId: string): Promise<void> {
    const collection = await this.collectionLoader(), options = { writeConcern: { w: 'majority' as const } };
    for (const [filter, fields] of [
      [{ 'target.id': userId }, { 'target.displayName': 'Deleted user', 'target.email': '' }],
      [{ 'actor.id': userId }, { 'actor.displayName': 'Deleted user' }],
    ] as const) {
      const result = await collection.updateMany(filter, { $set: fields }, options);
      if (!result.acknowledged) throw new Error('User change anonymization was not acknowledged');
    }
  }
  async recordErasure(userId: string, at: string): Promise<void> {
    const { id, ...snapshot } = erasureChange(userId, at);
    const result = await (await this.collectionLoader()).updateOne({ _id: id }, { $setOnInsert: { _id: id, ...snapshot } },
      { upsert: true, writeConcern: { w: 'majority' } });
    if (!result.acknowledged) throw new Error('Erasure audit was not acknowledged');
  }
  async append(change: UserChange): Promise<void> {
    const { id, ...snapshot } = userChangeDto(change);
    await (await this.collectionLoader()).insertOne({ _id: id, ...snapshot }, { writeConcern: { w: 'majority' } });
  }
  async recent(): Promise<UserChange[]> {
    const documents = await (await this.collectionLoader()).find().sort({ at: -1, _id: -1 }).limit(50).toArray();
    return documents.map(document => userChangeDto({ ...document, id: document._id }));
  }
}

export class InMemoryUserChangeRepository implements UserChangeRepository {
  private readonly changes: UserChange[] = [];
  async anonymizeForUser(userId: string): Promise<void> {
    for (const change of this.changes) {
      if (change.target.id === userId) { change.target.displayName = 'Deleted user'; change.target.email = ''; }
      if (change.actor.id === userId) change.actor.displayName = 'Deleted user';
    }
  }
  async recordErasure(userId: string, at: string): Promise<void> {
    const change = erasureChange(userId, at);
    if (!this.changes.some(existing => existing.id === change.id)) this.changes.push(change);
  }
  async append(change: UserChange): Promise<void> { this.changes.push(userChangeDto(change)); }
  async recent(): Promise<UserChange[]> {
    return [...this.changes].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, 50).map(userChangeDto);
  }
}

export function createUserChangeRepository(): UserChangeRepository {
  // This increment explicitly keeps local logs in memory, including opted-in local runs.
  if (!isHostedApi()) return new InMemoryUserChangeRepository();
  if (hasMongoConfig()) return new MongoUserChangeRepository();
  const unavailable = async (): Promise<never> => { throw new Error('User change log storage is unavailable.'); };
  return { append: unavailable, recent: unavailable, anonymizeForUser: unavailable, recordErasure: unavailable };
}

function erasureChange(userId: string, at: string): UserChange {
  return { id: `account-erasure:${userId}`, at, actor: { id: SYSTEM_ACCOUNT_ID, displayName: 'System' },
    target: { id: userId, displayName: 'Deleted user', email: '' }, field: 'status', from: 'erasing', to: 'erased' };
}
