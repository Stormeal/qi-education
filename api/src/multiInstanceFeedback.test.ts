import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository, type UpdateFeedbackTriageRecord } from './feedbackRepository.js';
import type { GitHubFeedbackIssue, GitHubFeedbackService } from './githubFeedback.js';
import { createServer } from './server.js';

// Fail before persistence, only when a newly created issue's link is being saved.
class FailFirstLinkSaveRepository extends InMemoryFeedbackRepository {
  private failNextLink = true;
  override async updateFeedbackTriage(id: string, input: UpdateFeedbackTriageRecord) {
    if (this.failNextLink && input.githubIssueUrl) {
      this.failNextLink = false;
      throw new Error('Synthetic feedback link save failure');
    }
    return super.updateFeedbackTriage(id, input);
  }
}

describe.each(['', '/api'])('INV-004 feedback retry after server restart (%s)', prefix => {
  const servers = new Set<Server>();
  let issues: Array<GitHubFeedbackIssue & { feedbackId: string }>;

  beforeEach(async () => {
    expect(apiConfig.mode).toBe('isolated');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const auth = new InMemoryAuthRepository();
    const feedback = new FailFirstLinkSaveRepository();
    const admin = (await auth.findByEmail('admin@qi-education.local'))!;
    const student = (await auth.findByEmail('student@qi-education.local'))!;
    const entry = await feedback.createFeedback({ page: 'Courses', rating: 'needs-work',
      message: 'Synthetic INV-004 restart reproduction.' }, toAuthenticatedUser(student));
    // This array is the stub provider's durable state, independent of either API instance.
    issues = [];

    async function start() {
      // A fresh service and createServer closure model the restarted process. Only stored
      // feedback/accounts and the simulated external issues survive; no pending map is shared.
      const github: GitHubFeedbackService = {
        async createIssueFromFeedback(item) {
          const number = issues.length + 1;
          const issue = { number, url: `https://github.example.test/fixture/issues/${number}`, feedbackId: item.id };
          issues.push(issue);
          return { number: issue.number, url: issue.url };
        },
      };
      const server = createServer({ authRepository: auth, feedbackRepository: feedback,
        gitHubFeedbackService: github, courseRepository: new InMemoryCourseRepository(),
        courseContentRepository: new InMemoryCourseContentRepository(),
        courseAssetRepository: new InMemoryCourseAssetRepository(), muxVideoService: null, muxWebhookService: null,
      }).listen(0, '127.0.0.1');
      servers.add(server);
      await new Promise<void>(resolve => server.once('listening', resolve));
      return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
    }
    async function triage(base: string) {
      return fetch(`${base}${prefix}/feedback/${entry.id}/triage`, { method: 'PATCH', headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${createSessionToken(toAuthenticatedUser(admin), apiConfig.AUTH_TOKEN_SECRET!)}`,
      }, body: JSON.stringify({ workStatus: 'work', priority: 'high' }) });
    }

    // Guards deliberately live outside it.fails: only the final no-duplicate assertion
    // below is expected to fail, never authentication, fixture setup, or either request.
    const first = await start();
    const failed = await triage(first.base);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ message: 'Unexpected server error' });
    expect(issues).toEqual([{ number: 1, url: 'https://github.example.test/fixture/issues/1', feedbackId: entry.id }]);
    expect(await feedback.findFeedbackById(entry.id)).toEqual(entry);

    await new Promise<void>(resolve => first.server.close(() => resolve()));
    servers.delete(first.server);
    const restarted = await start();
    expect(restarted.server).not.toBe(first.server);
    const retried = await triage(restarted.base);
    expect(retried.status).toBe(200);
    const persisted = await feedback.findFeedbackById(entry.id);
    expect(await retried.json()).toEqual(persisted);
    expect(persisted).toMatchObject({ id: entry.id, workStatus: 'work', priority: 'high',
      githubIssueNumber: expect.any(Number), githubIssueUrl: expect.any(String) });
    expect(issues.some(issue => issue.feedbackId === entry.id && issue.number === persisted?.githubIssueNumber &&
      issue.url === persisted?.githubIssueUrl)).toBe(true);
  });

  afterEach(async () => {
    await Promise.all([...servers].map(server => new Promise<void>(resolve => server.close(() => resolve()))));
    servers.clear();
    vi.restoreAllMocks();
  });

  it.fails('INV-004 reuses one GitHub issue after a failed link save and a fresh-instance retry', () => {
    expect(issues, 'A restart must not create a second issue for the same feedback.').toHaveLength(1);
  });
});
