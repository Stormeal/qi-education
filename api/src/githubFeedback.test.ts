import { afterEach, describe, expect, it, vi } from 'vitest';
import * as config from './config.js';
import { ConfiguredGitHubFeedbackService } from './githubFeedback.js';
import { createFeedbackSchema } from './feedback.js';

describe('US-L016 problem report issue context (isolated fetch)', () => {
  const original = { ...config.apiConfig };
  afterEach(() => { Object.assign(config.apiConfig, original); vi.restoreAllMocks(); });
  it('names the course, lesson and category in a triaged issue', async () => {
    vi.spyOn(config, 'hasGitHubFeedbackConfig').mockReturnValue(true);
    Object.assign(config.apiConfig, { GITHUB_FEEDBACK_REPOSITORY: 'isolated/repository', GITHUB_FEEDBACK_TOKEN: 'test-only', GITHUB_FEEDBACK_PROJECT_ID: undefined });
    let issueBody = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
      issueBody = JSON.parse(String(options?.body)).body;
      return new Response(JSON.stringify({ number: 1, html_url: 'https://example.test/issue/1', node_id: 'node' }));
    });
    const entry = { ...createFeedbackSchema.parse({ page: 'learning', rating: 'needs-work', message: 'Broken file', courseId: 'course', componentId: 'lesson', category: 'file' }),
      id: 'f', userId: 'u', userEmail: 'u@example.test', userRole: 'student', createdAt: '2026-10-15T00:00:00Z' };
    await new ConfiguredGitHubFeedbackService().createIssueFromFeedback(entry);
    expect(issueBody).toContain('- Course ID: course');
    expect(issueBody).toContain('- Lesson ID: lesson');
    expect(issueBody).toContain('- Category: file');
    expect(issueBody).toContain('Broken file');
  });
});
