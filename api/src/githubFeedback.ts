import { logError } from './errorLogger.js';
import { apiConfig, hasGitHubFeedbackConfig } from './config.js';
import { feedbackType, type FeedbackEntry } from './feedback.js';
import { createHash } from 'node:crypto';

export type GitHubFeedbackIssue = {
  number: number;
  url: string;
};

export interface GitHubFeedbackService {
  readonly operationNamespace?: string;
  createIssueFromFeedback(feedback: FeedbackEntry): Promise<GitHubFeedbackIssue>;
  findIssueFromFeedback?(feedback: FeedbackEntry): Promise<GitHubFeedbackIssue | null>;
}

export class GitHubFeedbackError extends Error {
  constructor(message: string, readonly uncertain = false) { super(message); }
}

export class ConfiguredGitHubFeedbackService implements GitHubFeedbackService {
  get operationNamespace(): string { return apiConfig.GITHUB_FEEDBACK_REPOSITORY?.toLowerCase() ?? 'unconfigured'; }

  async createIssueFromFeedback(feedback: FeedbackEntry): Promise<GitHubFeedbackIssue> {
    if (!hasGitHubFeedbackConfig()) {
      throw new GitHubFeedbackError(
        'GitHub feedback integration is not configured. Set GITHUB_FEEDBACK_TOKEN and GITHUB_FEEDBACK_REPOSITORY.',
      );
    }

    const repository = parseRepository(apiConfig.GITHUB_FEEDBACK_REPOSITORY!);
    const issueResponse = await fetch(
      `https://api.github.com/repos/${repository.owner}/${repository.repo}/issues`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          title: this.issueTitle(feedback),
          body: this.issueBody(feedback),
          labels: [...new Set(['feedback', feedbackType(feedback), `feedback:${feedback.page.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`])],
        }),
      },
    ).catch(() => { throw new GitHubFeedbackError('GitHub issue creation could not be confirmed.', true); });

    if (!issueResponse.ok) {
      throw new GitHubFeedbackError(
        await githubErrorMessage(issueResponse, 'Unable to create GitHub issue.'),
        issueResponse.status >= 500 || issueResponse.status === 408,
      );
    }

    const issue = (await issueResponse.json().catch(() => {
      throw new GitHubFeedbackError('GitHub issue creation returned an unreadable result.', true);
    })) as {
      number: number;
      html_url: string;
      node_id: string;
    };
    if (!Number.isSafeInteger(issue?.number) || issue.number <= 0 || typeof issue.html_url !== 'string' || !issue.html_url) {
      throw new GitHubFeedbackError('GitHub issue creation returned an incomplete result.', true);
    }

    if (apiConfig.GITHUB_FEEDBACK_PROJECT_ID) {
      try {
        await this.addIssueToProject(issue.node_id);
      } catch (error) {
        logError('Created GitHub feedback issue, but could not add it to the configured project.', error, {}, 'warn');
      }
    }

    return {
      number: issue.number,
      url: issue.html_url,
    };
  }

  async findIssueFromFeedback(feedback: FeedbackEntry): Promise<GitHubFeedbackIssue | null> {
    if (!hasGitHubFeedbackConfig()) throw new GitHubFeedbackError('GitHub feedback integration is not configured.');
    const repository = parseRepository(apiConfig.GITHUB_FEEDBACK_REPOSITORY!);
    // Token identity is checked each recovery. User-submitted marker text and
    // lookalike logins cannot authorize attachment of another user's issue.
    const identity = await this.readJson('https://api.github.com/user') as { id?: number; login?: string };
    if (!Number.isSafeInteger(identity?.id) || typeof identity.login !== 'string' || !identity.login) {
      throw new GitHubFeedbackError('Unable to verify the GitHub integration identity.');
    }
    const suffix = `\n\n${feedbackIssueMarker(this.operationNamespace, feedback.id)}`;
    let match: GitHubFeedbackIssue | null = null;
    for (let page = 1; page <= 10; page++) {
      const response = await fetch(`https://api.github.com/repos/${repository.owner}/${repository.repo}/issues?state=all&per_page=100&sort=created&direction=desc&page=${page}`,
        { headers: this.headers() }).catch(() => { throw new GitHubFeedbackError('GitHub issue recovery lookup failed.'); });
      if (!response.ok) throw new GitHubFeedbackError('GitHub issue recovery lookup failed.');
      const issues: unknown = await response.json().catch(() => { throw new GitHubFeedbackError('GitHub issue recovery lookup is incomplete.'); });
      if (!Array.isArray(issues)) throw new GitHubFeedbackError('GitHub issue recovery lookup is incomplete.');
      for (const value of issues) {
        if (!value || typeof value !== 'object') throw new GitHubFeedbackError('GitHub issue recovery lookup is incomplete.');
        const candidate = value as { body?: string; user?: { id?: number; login?: string }; number?: number; html_url?: string; pull_request?: unknown };
        if (candidate.pull_request || typeof candidate.body !== 'string' || !candidate.body.trimEnd().endsWith(suffix) ||
          candidate.user?.id !== identity.id || candidate.user?.login?.toLowerCase() !== identity.login.toLowerCase()) continue;
        if (!Number.isSafeInteger(candidate.number) || candidate.number! <= 0 || typeof candidate.html_url !== 'string' || !candidate.html_url) {
          throw new GitHubFeedbackError('GitHub issue recovery lookup is incomplete.');
        }
        if (match) throw new GitHubFeedbackError('GitHub issue recovery found multiple matches. Operator reconciliation is required.');
        match = { number: candidate.number!, url: candidate.html_url };
      }
      const hasNext = /rel="next"/.test(response.headers.get('link') ?? '');
      if (!hasNext && issues.length < 100) return match;
    }
    // Reaching the cap cannot establish uniqueness or absence.
    throw new GitHubFeedbackError('GitHub issue recovery lookup is incomplete. Operator reconciliation is required.');
  }

  private async readJson(url: string): Promise<unknown> {
    const response = await fetch(url, { headers: this.headers() })
      .catch(() => { throw new GitHubFeedbackError('Unable to verify the GitHub integration identity.'); });
    if (!response.ok) throw new GitHubFeedbackError('Unable to verify the GitHub integration identity.');
    return response.json().catch(() => { throw new GitHubFeedbackError('Unable to verify the GitHub integration identity.'); });
  }

  private headers() {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${apiConfig.GITHUB_FEEDBACK_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'qi-education-feedback-bot',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  private issueTitle(feedback: FeedbackEntry) {
    const type = feedbackType(feedback);
    const label = type === 'defect' ? 'Defect' : type === 'change-request' ? 'Change request' : 'Feedback';
    const summary = feedback.summary || feedback.message.trim() || `${label} from ${feedback.page}`;
    return `[${label}] ${feedback.page}: ${truncate(summary, 120)}`;
  }

  private issueBody(feedback: FeedbackEntry) {
    return [
      '## Feedback',
      '',
      feedback.summary ? `### ${feedback.summary}` : null,
      feedback.message.trim() || '_No written message provided._',
      '',
      feedback.reproductionSteps ? `## Reproduction steps\n\n${feedback.reproductionSteps}` : null,
      feedback.expectedBehavior ? `## Expected behavior\n\n${feedback.expectedBehavior}` : null,
      '## Context',
      '',
      `- Type: ${feedbackType(feedback)}`,
      `- Page: ${feedback.page}`,
      feedback.path ? `- Path: ${feedback.path}` : null,
      feedback.rating ? `- Rating: ${feedback.rating}` : null,
      `- Submitted by: ${feedback.userEmail} (${feedback.userRole})`,
      `- Submitted at: ${feedback.createdAt}`,
      `- Priority: ${feedback.priority ?? 'medium'}`,
      `- Feedback ID: ${feedback.id}`,
      feedback.courseId ? `- Course ID: ${feedback.courseId}` : null,
      feedback.componentId ? `- Lesson ID: ${feedback.componentId}` : null,
      feedback.lessonFeedbackKind ? `- Lesson feedback kind: ${feedback.lessonFeedbackKind}` : null,
      feedback.problemCategory ? `- Problem category: ${feedback.problemCategory}` : null,
      feedback.userAgent ? `- User agent: ${feedback.userAgent}` : null,
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n') + `\n\n${feedbackIssueMarker(this.operationNamespace, feedback.id)}`;
  }

  private async addIssueToProject(contentId: string): Promise<void> {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        query: `
          mutation AddFeedbackIssueToProject($projectId: ID!, $contentId: ID!) {
            addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
              item {
                id
              }
            }
          }
        `,
        variables: {
          projectId: apiConfig.GITHUB_FEEDBACK_PROJECT_ID,
          contentId,
        },
      }),
    });

    const body = (await response.json().catch(() => null)) as
      | {
          errors?: Array<{ message?: string }>;
        }
      | null;

    if (!response.ok || body?.errors?.length) {
      const errorMessage = body?.errors?.[0]?.message ?? 'Unable to add GitHub issue to project.';
      throw new GitHubFeedbackError(errorMessage);
    }
  }
}

function parseRepository(value: string) {
  const [owner, repo] = value.split('/');

  if (!owner || !repo || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(value)) {
    throw new GitHubFeedbackError('GITHUB_FEEDBACK_REPOSITORY must use the format "owner/repo".');
  }

  return { owner, repo };
}

export function feedbackIssueMarker(repository: string, feedbackId: string): string {
  const digest = createHash('sha256').update(JSON.stringify([repository.toLowerCase(), feedbackId])).digest('hex');
  return `<!-- qi-academy-feedback:${digest} -->`;
}

async function githubErrorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  return body?.message ? `${fallback} ${body.message}` : fallback;
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
