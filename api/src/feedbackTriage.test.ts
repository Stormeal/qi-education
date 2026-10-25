import { describe, expect, it, vi } from 'vitest';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { FeedbackTriagePendingError, FeedbackTriageService } from './feedbackTriage.js';
import { InMemoryFeedbackIssueOperationRepository, MongoFeedbackIssueOperationRepository,
  FeedbackIssueOperationUnavailableError, type FeedbackIssueOperationCollection,
  type FeedbackIssueOperation, createFeedbackIssueOperationRepository } from './feedbackIssueOperationRepository.js';
import { GitHubFeedbackError, type GitHubFeedbackService } from './githubFeedback.js';
import type { AuthenticatedUser } from './auth.js';
import { apiConfig } from './config.js';

const user = { id: 'learner', email: 'learner@example.test', role: 'student' } as AuthenticatedUser;
const issue = { number: 17, url: 'https://github.example.test/fixture/issues/17' };
const work = { workStatus: 'work' as const, priority: 'high' as const };
async function fixture() {
  const repository = new InMemoryFeedbackRepository();
  const feedback = await repository.createFeedback({ page: 'Home', rating: 'okay', message: 'A problem' }, user);
  const operations = new InMemoryFeedbackIssueOperationRepository();
  return { repository, feedback, operations };
}

describe('US-A006 AC10 durable feedback triage', () => {
  it('reuses the durable issue after a failed final link save and fresh service', async () => {
    const { repository, feedback, operations } = await fixture();
    const save = vi.spyOn(repository, 'updateFeedbackTriage').mockRejectedValueOnce(new Error('save failed'));
    const create = vi.fn(async () => issue);
    const github = { createIssueFromFeedback: create };
    await expect(new FeedbackTriageService(repository, github, operations).triage(feedback.id, work)).rejects.toThrow('save failed');
    const saved = await new FeedbackTriageService(repository, github, operations).triage(feedback.id, work);
    expect(saved).toMatchObject({ githubIssueNumber: 17, githubIssueUrl: issue.url, priority: 'high' });
    expect(save).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each(['completed', 'wont-do'] as const)('attaches a known durable issue when a restarted service retries as %s', async workStatus => {
    const { repository, feedback, operations } = await fixture();
    vi.spyOn(repository, 'updateFeedbackTriage').mockRejectedValueOnce(new Error('save failed'));
    const create = vi.fn(async () => issue);
    await expect(new FeedbackTriageService(repository, { createIssueFromFeedback: create }, operations).triage(feedback.id, work)).rejects.toThrow('save failed');
    expect(await new FeedbackTriageService(repository, { createIssueFromFeedback: create }, operations).triage(feedback.id, { workStatus })).toMatchObject({ workStatus, githubIssueNumber: 17, githubIssueUrl: issue.url });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('direct service use respects the write freeze before journal or GitHub mutation', async () => {
    const { repository, feedback, operations } = await fixture();
    Object.defineProperty(repository, 'readOnly', { value: true });
    const claim = vi.spyOn(operations, 'claim');
    const create = vi.fn();
    await expect(new FeedbackTriageService(repository, { createIssueFromFeedback: create }, operations).triage(feedback.id, work)).rejects.toThrow('maintenance');
    expect(claim).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(await repository.findFeedbackById(feedback.id)).toEqual(feedback);
  });

  it('allows only one provider POST across concurrent independent services', async () => {
    const { repository, feedback, operations } = await fixture();
    let resolve!: (value: typeof issue) => void;
    let started!: () => void;
    const posting = new Promise<void>(r => { started = r; });
    const create = vi.fn(() => { started(); return new Promise<typeof issue>(r => { resolve = r; }); });
    const first = new FeedbackTriageService(repository, { createIssueFromFeedback: create }, operations).triage(feedback.id, work);
    await posting;
    await expect(new FeedbackTriageService(repository, { createIssueFromFeedback: create }, operations).triage(feedback.id, work)).rejects.toBeInstanceOf(FeedbackTriagePendingError);
    resolve(issue);
    expect(await first).toMatchObject({ githubIssueNumber: 17 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each(['missing', 'failed'] as const)('refuses a second POST after lost response when lookup is %s', async lookup => {
    const { repository, feedback, operations } = await fixture();
    const create = vi.fn().mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue(issue);
    const github: GitHubFeedbackService = { createIssueFromFeedback: create,
      findIssueFromFeedback: lookup === 'missing' ? async () => null : async () => { throw new Error('lookup denied'); } };
    await expect(new FeedbackTriageService(repository, github, operations).triage(feedback.id, work)).rejects.toBeInstanceOf(FeedbackTriagePendingError);
    await expect(new FeedbackTriageService(repository, github, operations).triage(feedback.id, work)).rejects.toBeInstanceOf(FeedbackTriagePendingError);
    expect(create).toHaveBeenCalledTimes(1);
    expect(await repository.findFeedbackById(feedback.id)).not.toHaveProperty('githubIssueUrl');
  });

  it('recovers a trusted issue after a lost POST response and persists it before linking', async () => {
    const { repository, feedback, operations } = await fixture();
    const create = vi.fn(async () => { throw new GitHubFeedbackError('lost response', true); });
    const github = { createIssueFromFeedback: create, findIssueFromFeedback: async () => issue };
    const service = new FeedbackTriageService(repository, github, operations);
    await expect(service.triage(feedback.id, work)).rejects.toBeInstanceOf(FeedbackTriagePendingError);
    vi.spyOn(repository, 'updateFeedbackTriage').mockRejectedValueOnce(new Error('link failed'));
    await expect(new FeedbackTriageService(repository, github, operations).triage(feedback.id, work)).rejects.toThrow('link failed');
    expect(await new FeedbackTriageService(repository, { createIssueFromFeedback: create }, operations).triage(feedback.id, work)).toMatchObject({ githubIssueNumber: 17 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('releases only definite rejection, permitting a corrected configuration retry', async () => {
    const { repository, feedback, operations } = await fixture();
    const create = vi.fn().mockRejectedValueOnce(new GitHubFeedbackError('not configured')).mockResolvedValue(issue);
    const service = new FeedbackTriageService(repository, { createIssueFromFeedback: create }, operations);
    await expect(service.triage(feedback.id, work)).rejects.toThrow('not configured');
    expect(await service.triage(feedback.id, work)).toMatchObject({ githubIssueNumber: 17 });
  });

  it('keeps saved links authoritative and completed feedback actionable during a journal outage', async () => {
    const { repository, feedback, operations } = await fixture();
    await repository.updateFeedbackTriage(feedback.id, { ...work, githubIssueNumber: 17, githubIssueUrl: issue.url });
    vi.spyOn(operations, 'claim').mockRejectedValue(new Error('offline'));
    const create = vi.fn();
    const service = new FeedbackTriageService(repository, { createIssueFromFeedback: create }, operations);
    expect(await service.triage(feedback.id, work)).toMatchObject({ githubIssueNumber: 17 });
    expect(await service.triage(feedback.id, { workStatus: 'completed' })).toMatchObject({ workStatus: 'completed', githubIssueNumber: 17 });
    expect(await service.triage('missing', work)).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('fails closed before GitHub when the journal cannot claim', async () => {
    const { repository, feedback, operations } = await fixture();
    vi.spyOn(operations, 'claim').mockRejectedValue(new FeedbackIssueOperationUnavailableError());
    const create = vi.fn();
    await expect(new FeedbackTriageService(repository, { createIssueFromFeedback: create }, operations).triage(feedback.id, work)).rejects.toBeInstanceOf(FeedbackIssueOperationUnavailableError);
    expect(create).not.toHaveBeenCalled();
  });

  it('retains an uncertain claim after journal result persistence fails', async () => {
    const { repository, feedback, operations } = await fixture();
    vi.spyOn(operations, 'recordCreated').mockRejectedValueOnce(new FeedbackIssueOperationUnavailableError());
    const create = vi.fn(async () => issue);
    const service = new FeedbackTriageService(repository, { createIssueFromFeedback: create }, operations);
    await expect(service.triage(feedback.id, work)).rejects.toBeInstanceOf(FeedbackIssueOperationUnavailableError);
    await expect(new FeedbackTriageService(repository, { createIssueFromFeedback: create }, operations).triage(feedback.id, work)).rejects.toBeInstanceOf(FeedbackTriagePendingError);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('supports conditional operator reconciliation without another provider POST', async () => {
    const { repository, feedback, operations } = await fixture();
    const create = vi.fn(async () => { throw new Error('response lost'); });
    const github = { operationNamespace: 'fixture/repo', createIssueFromFeedback: create };
    await expect(new FeedbackTriageService(repository, github, operations).triage(feedback.id, work)).rejects.toBeInstanceOf(FeedbackTriagePendingError);
    // An operator first independently verifies this issue's author, marker and context.
    // Reuse the original owner in a conditional transition; never release an unknown POST.
    const key = JSON.stringify(['fixture/repo', feedback.id]);
    const pending = await operations.claim(key, 'operator-inspection');
    expect(pending.claimed).toBe(false);
    await operations.recordCreated(key, pending.operation.owner, issue);
    expect(await new FeedbackTriageService(repository, github, operations).triage(feedback.id, work)).toMatchObject({ githubIssueNumber: 17 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('keeps a different feedback item actionable while one outcome remains unresolved', async () => {
    const { repository, feedback, operations } = await fixture();
    const another = await repository.createFeedback({ page: 'Courses', rating: 'okay', message: 'Another' }, user);
    const create = vi.fn().mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce(issue);
    const service = new FeedbackTriageService(repository, { createIssueFromFeedback: create }, operations);
    await expect(service.triage(feedback.id, work)).rejects.toBeInstanceOf(FeedbackTriagePendingError);
    expect(await service.triage(another.id, work)).toMatchObject({ id: another.id, githubIssueNumber: 17 });
    await expect(service.triage(feedback.id, work)).rejects.toBeInstanceOf(FeedbackTriagePendingError);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('US-A006 AC10 atomic operation repository', () => {
  it('shares durable memory state with conditional ownership and no claim expiry', async () => {
    const state = new Map<string, FeedbackIssueOperation>();
    const a = new InMemoryFeedbackIssueOperationRepository(state);
    const b = new InMemoryFeedbackIssueOperationRepository(state);
    expect((await a.claim('repo:id', 'first')).claimed).toBe(true);
    expect((await b.claim('repo:id', 'second')).claimed).toBe(false);
    await b.release('repo:id', 'second');
    expect((await b.claim('repo:id', 'second')).claimed).toBe(false);
    await a.recordCreated('repo:id', 'first', issue);
    expect((await b.claim('repo:id', 'second')).operation).toMatchObject({ state: 'created', issue });
  });

  it('Mongo uses majority writes and unique id claims across repository instances', async () => {
    const docs = new Map<string, FeedbackIssueOperation>();
    const options: unknown[] = [];
    const collection = {
      async insertOne(doc: FeedbackIssueOperation, opts: unknown) {
        options.push(opts);
        if (docs.has(doc._id)) throw Object.assign(new Error('duplicate'), { code: 11000 });
        docs.set(doc._id, structuredClone(doc)); return { acknowledged: true };
      },
      async findOne(filter: { _id: string }) { return structuredClone(docs.get(filter._id) ?? null); },
      async updateOne(filter: { _id: string; owner: string; state: string }, update: { $set: Partial<FeedbackIssueOperation> }, opts: unknown) {
        options.push(opts); const doc = docs.get(filter._id);
        if (!doc || doc.owner !== filter.owner || doc.state !== filter.state) return { acknowledged: true, matchedCount: 0 };
        Object.assign(doc, update.$set); return { acknowledged: true, matchedCount: 1 };
      },
      async deleteOne(filter: { _id: string; owner: string; state: string }, opts: unknown) {
        options.push(opts); const doc = docs.get(filter._id);
        const matches = doc?.owner === filter.owner && doc?.state === filter.state;
        if (matches) docs.delete(filter._id); return { acknowledged: true, deletedCount: matches ? 1 : 0 };
      },
    } as unknown as FeedbackIssueOperationCollection;
    const a = new MongoFeedbackIssueOperationRepository(async () => collection);
    const b = new MongoFeedbackIssueOperationRepository(async () => collection);
    const claims = await Promise.all([a.claim('repo:id', 'first'), b.claim('repo:id', 'second')]);
    expect(claims.filter(value => value.claimed)).toHaveLength(1);
    const owner = claims.find(value => value.claimed)!.operation.owner;
    await a.recordCreated('repo:id', owner, issue);
    await b.release('repo:id', owner);
    expect((await b.claim('repo:id', 'third')).operation).toMatchObject({ state: 'created', issue });
    expect(options.every(value => JSON.stringify(value).includes('majority'))).toBe(true);
  });

  it('Mongo outages expose a safe error instead of silently using memory', async () => {
    const repo = new MongoFeedbackIssueOperationRepository(async () => { throw new Error('mongodb://secret'); });
    await expect(repo.claim('repo:id', 'first')).rejects.toBeInstanceOf(FeedbackIssueOperationUnavailableError);
    await expect(repo.claim('repo:id', 'first')).rejects.not.toThrow('secret');
  });

  it('factory uses isolated memory but refuses a missing shared journal', async () => {
    expect(createFeedbackIssueOperationRepository()).toBeInstanceOf(InMemoryFeedbackIssueOperationRepository);
    const original = apiConfig.mode;
    try {
      // NODE_ENV=test still prevents any real provider selection or calls.
      apiConfig.mode = 'shared';
      const repository = createFeedbackIssueOperationRepository();
      expect(repository).not.toBeInstanceOf(InMemoryFeedbackIssueOperationRepository);
      await expect(repository.claim('fixture:id', 'owner')).rejects.toBeInstanceOf(FeedbackIssueOperationUnavailableError);
    } finally { apiConfig.mode = original; }
  });
});
