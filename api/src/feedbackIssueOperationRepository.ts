import type { Collection } from 'mongodb';
import type { GitHubFeedbackIssue } from './githubFeedback.js';
import { apiConfig, hasMongoConfig } from './config.js';
import { getMongoDatabase } from './mongo.js';

export type FeedbackIssueOperation = {
  _id: string;
  owner: string;
  state: 'creating' | 'created';
  createdAt: string;
  updatedAt: string;
  issue?: GitHubFeedbackIssue;
};
export interface FeedbackIssueOperationRepository {
  find(key: string): Promise<FeedbackIssueOperation | null>;
  claim(key: string, owner: string): Promise<{ claimed: boolean; operation: FeedbackIssueOperation }>;
  recordCreated(key: string, owner: string, issue: GitHubFeedbackIssue): Promise<void>;
  release(key: string, owner: string): Promise<void>;
}
export class FeedbackIssueOperationUnavailableError extends Error {
  constructor() { super('Feedback issue coordination is unavailable. Try again later.'); }
}
export type FeedbackIssueOperationCollection = Pick<Collection<FeedbackIssueOperation>, 'insertOne' | 'findOne' | 'updateOne' | 'deleteOne'>;
export class InMemoryFeedbackIssueOperationRepository implements FeedbackIssueOperationRepository {
  constructor(private readonly state = new Map<string, FeedbackIssueOperation>()) {}
  async find(key: string): Promise<FeedbackIssueOperation | null> { return structuredClone(this.state.get(key) ?? null); }
  async claim(key: string, owner: string) {
    const existing = this.state.get(key);
    if (existing) return { claimed: false, operation: structuredClone(existing) };
    const operation = newOperation(key, owner);
    this.state.set(key, operation);
    return { claimed: true, operation: structuredClone(operation) };
  }
  async recordCreated(key: string, owner: string, issue: GitHubFeedbackIssue): Promise<void> {
    const operation = this.state.get(key);
    if (!operation || operation.owner !== owner ||
      (operation.state === 'created' && !sameIssue(operation.issue, issue))) throw new FeedbackIssueOperationUnavailableError();
    this.state.set(key, { ...operation, state: 'created', issue: structuredClone(issue), updatedAt: new Date().toISOString() });
  }
  async release(key: string, owner: string): Promise<void> {
    const operation = this.state.get(key);
    if (operation?.owner === owner && operation.state === 'creating') this.state.delete(key);
  }
}
export class MongoFeedbackIssueOperationRepository implements FeedbackIssueOperationRepository {
  constructor(private readonly collection: () => Promise<FeedbackIssueOperationCollection> = async () =>
    (await getMongoDatabase()).collection<FeedbackIssueOperation>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_feedback_issue_operations`)) {}

  async find(key: string): Promise<FeedbackIssueOperation | null> {
    return this.safe(async () => (await this.collection()).findOne({ _id: key }, { readConcern: { level: 'majority' } }));
  }

  async claim(key: string, owner: string) {
    return this.safe(async () => {
      const collection = await this.collection();
      const operation = newOperation(key, owner);
      try {
        const result = await collection.insertOne(operation, { writeConcern: { w: 'majority' } });
        if (!result.acknowledged) throw new FeedbackIssueOperationUnavailableError();
        return { claimed: true, operation };
      } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error;
        const existing = await collection.findOne({ _id: key }, { readConcern: { level: 'majority' } });
        if (!existing) throw new FeedbackIssueOperationUnavailableError();
        return { claimed: false, operation: existing };
      }
    });
  }
  async recordCreated(key: string, owner: string, issue: GitHubFeedbackIssue): Promise<void> {
    await this.safe(async () => {
      const collection = await this.collection();
      const result = await collection.updateOne({ _id: key, owner, state: 'creating' },
        { $set: { state: 'created', issue, updatedAt: new Date().toISOString() } }, { writeConcern: { w: 'majority' } });
      if (!result.acknowledged) throw new FeedbackIssueOperationUnavailableError();
      if (result.matchedCount === 0) {
        // A recovery reader can race the original successful POST response. Identical
        // results are idempotent; an unexpected result must never overwrite a known issue.
        const existing = await collection.findOne({ _id: key }, { readConcern: { level: 'majority' } });
        if (existing?.owner !== owner || existing.state !== 'created' || !sameIssue(existing.issue, issue)) {
          throw new FeedbackIssueOperationUnavailableError();
        }
      }
    });
  }
  async release(key: string, owner: string): Promise<void> {
    await this.safe(async () => {
      const result = await (await this.collection()).deleteOne({ _id: key, owner, state: 'creating' }, { writeConcern: { w: 'majority' } });
      if (!result.acknowledged) throw new FeedbackIssueOperationUnavailableError();
    });
  }
  private async safe<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); }
    catch { throw new FeedbackIssueOperationUnavailableError(); }
  }
}

export function createFeedbackIssueOperationRepository(): FeedbackIssueOperationRepository {
  if (apiConfig.mode === 'isolated') return new InMemoryFeedbackIssueOperationRepository();
  if (hasMongoConfig()) return new MongoFeedbackIssueOperationRepository();
  return {
    async find() { throw new FeedbackIssueOperationUnavailableError(); },
    async claim() { throw new FeedbackIssueOperationUnavailableError(); },
    async recordCreated() { throw new FeedbackIssueOperationUnavailableError(); },
    async release() { throw new FeedbackIssueOperationUnavailableError(); },
  };
}

function newOperation(key: string, owner: string): FeedbackIssueOperation {
  const now = new Date().toISOString();
  return { _id: key, owner, state: 'creating', createdAt: now, updatedAt: now };
}
function sameIssue(a: GitHubFeedbackIssue | undefined, b: GitHubFeedbackIssue): boolean {
  return a?.number === b.number && a.url === b.url;
}
