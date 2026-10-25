import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./config.js', () => ({
  apiConfig: { GITHUB_FEEDBACK_REPOSITORY: 'fixture/repo', GITHUB_FEEDBACK_TOKEN: 'synthetic', GITHUB_FEEDBACK_PROJECT_ID: 'fixture-project' },
  hasGitHubFeedbackConfig: () => true,
}));
import { ConfiguredGitHubFeedbackService, GitHubFeedbackError, feedbackIssueMarker } from './githubFeedback.js';
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

const feedback = { id: 'fixture', page: 'Home', message: 'Details', rating: 'okay',
  userId: 'learner', userEmail: 'fixture@example.test', userRole: 'student', createdAt: '2026-10-25' } as FeedbackEntry;
const json = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), { status, headers });
const trusted = { id: 42, login: 'integration' };
const marker = () => feedbackIssueMarker('fixture/repo', feedback.id);
const candidate = (number = 17, extra = {}) => ({ number, html_url: `https://github.com/fixture/repo/issues/${number}`,
  body: `Details\n\n${marker()}`, user: trusted, ...extra });

it('US-A006 AC12 formats typed defects and preserves context without an absent rating', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json({ number: 17, html_url: 'https://github.com/fixture/repo/issues/17', node_id: 'node' }, 201))
    .mockResolvedValueOnce(json({ data: {} }));
  vi.stubGlobal('fetch', fetcher);
  await new ConfiguredGitHubFeedbackService().createIssueFromFeedback({ ...feedback, type: 'defect',
    summary: 'Video stops', rating: undefined, path: '/library/fixture', courseId: 'course', componentId: 'lesson',
    lessonFeedbackKind: 'problem', problemCategory: 'video', reproductionSteps: 'Press play', expectedBehavior: 'Keep playing' } as FeedbackEntry);
  const payload = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(payload.title).toBe('[Defect] Home: Video stops');
  expect(payload.labels).toContain('defect');
  expect(payload.body).toContain('Press play');
  expect(payload.body).toContain('Keep playing');
  for (const context of ['/library/fixture', 'course', 'lesson', 'video', 'Details']) expect(payload.body).toContain(context);
  expect(payload.body).not.toContain('Rating:');
  expect(payload.body.endsWith(marker())).toBe(true);
});

it('US-A006 AC10 recovers a trusted closed issue on a later page and ignores quoted/spoofed markers', async () => {
  const page = [candidate(1, { body: `Quoted\n${marker()}\nEnd of actual integration context` }),
    candidate(2, { user: { id: 999, login: 'untrusted' } }), candidate(3, { pull_request: { url: 'https://example.test/pr' } })];
  const fetcher = vi.fn().mockResolvedValueOnce(json(trusted))
    .mockResolvedValueOnce(json(page, 200, { Link: '<https://api.github.com/repos/fixture/repo/issues?page=2>; rel="next"' }))
    .mockResolvedValueOnce(json([candidate(17, { state: 'closed' })]));
  vi.stubGlobal('fetch', fetcher);
  const recovered = await new ConfiguredGitHubFeedbackService().findIssueFromFeedback(feedback);
  expect(recovered).toEqual({ number: 17, url: 'https://github.com/fixture/repo/issues/17' });
  expect(fetcher.mock.calls[0][0]).toBe('https://api.github.com/user');
  expect(fetcher.mock.calls[1][0]).toContain('state=all');
  expect(fetcher.mock.calls[2][0]).toContain('page=2');
  expect(fetcher.mock.calls.every(call => !call[1]?.method || call[1].method === 'GET')).toBe(true);
});

it('US-A006 AC10 refuses ambiguous trusted marker matches', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(trusted)).mockResolvedValueOnce(json([candidate(), candidate(18)])));
  await expect(new ConfiguredGitHubFeedbackService().findIssueFromFeedback(feedback)).rejects.toThrow('multiple');
});

it('US-A006 AC10 bounded lookup refuses a truncated list even if one match was found', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json(trusted));
  for (let page = 0; page < 10; page++) fetcher.mockResolvedValueOnce(json(page === 0 ? [candidate()] : [], 200,
    { Link: `<https://api.github.com/repos/fixture/repo/issues?page=${page + 2}>; rel="next"` }));
  vi.stubGlobal('fetch', fetcher);
  await expect(new ConfiguredGitHubFeedbackService().findIssueFromFeedback(feedback)).rejects.toThrow('incomplete');
  expect(fetcher).toHaveBeenCalledTimes(11);
});

it.each([403, 500])('US-A006 AC10 lookup denial/failure (%s) never becomes absence', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(trusted)).mockResolvedValueOnce(json({ message: 'denied' }, status)));
  await expect(new ConfiguredGitHubFeedbackService().findIssueFromFeedback(feedback)).rejects.toBeInstanceOf(GitHubFeedbackError);
});

it.each(['transport', 'server', 'malformed'] as const)('US-A006 AC10 creation %s outcome is uncertain', async mode => {
  const fetcher = vi.fn();
  if (mode === 'transport') fetcher.mockRejectedValue(new Error('connection lost'));
  if (mode === 'server') fetcher.mockResolvedValue(json({ message: 'bad gateway' }, 502));
  if (mode === 'malformed') fetcher.mockResolvedValue(new Response('not JSON', { status: 201 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(new ConfiguredGitHubFeedbackService().createIssueFromFeedback(feedback)).rejects.toMatchObject({ uncertain: true });
});

it('US-A006 AC10 definite rejected creation can be retried after correction', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ message: 'validation failed' }, 422)));
  await expect(new ConfiguredGitHubFeedbackService().createIssueFromFeedback(feedback)).rejects.toMatchObject({ uncertain: false });
});
