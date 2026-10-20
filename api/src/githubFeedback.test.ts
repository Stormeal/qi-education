import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./config.js', () => ({
  apiConfig: { GITHUB_FEEDBACK_REPOSITORY: 'fixture/repo', GITHUB_FEEDBACK_TOKEN: 'synthetic', GITHUB_FEEDBACK_PROJECT_ID: 'fixture-project' },
  hasGitHubFeedbackConfig: () => true,
}));
import { ConfiguredGitHubFeedbackService } from './githubFeedback.js';
import type { FeedbackEntry } from './feedback.js';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('DEF-049 GitHub project failure retains the created issue without logging bearer data', async () => {
  const canary = 'PRIVATE_GITHUB_CANARY';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ number: 1, html_url: 'https://example.test/issue/1', node_id: 'fixture' }), { status: 201 }))
    .mockRejectedValueOnce(Object.assign(new Error(canary), { request: { headers: { authorization: canary } }, cause: new Error(canary) })));
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const issue = await new ConfiguredGitHubFeedbackService().createIssueFromFeedback({ id: 'fixture', page: 'Home', message: 'Fixture', rating: 'good', userEmail: 'fixture@example.test', userRole: 'student', createdAt: '2026-10-20' } as unknown as FeedbackEntry);
  expect(issue).toEqual({ number: 1, url: 'https://example.test/issue/1' });
  expect(log.mock.calls).toEqual([['Created GitHub feedback issue, but could not add it to the configured project.', { errorClass: 'Error' }]]);
});
