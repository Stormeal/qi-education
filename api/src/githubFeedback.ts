import { apiConfig, hasGitHubFeedbackConfig } from './config.js';
import type { FeedbackEntry } from './feedback.js';

export type GitHubFeedbackIssue = {
  number: number;
  url: string;
};

export interface GitHubFeedbackService {
  createIssueFromFeedback(feedback: FeedbackEntry): Promise<GitHubFeedbackIssue>;
}

export class GitHubFeedbackError extends Error {}

export class ConfiguredGitHubFeedbackService implements GitHubFeedbackService {
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
          labels: ['feedback', `feedback:${feedback.page.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`],
        }),
      },
    );

    if (!issueResponse.ok) {
      throw new GitHubFeedbackError(
        await githubErrorMessage(issueResponse, 'Unable to create GitHub issue.'),
      );
    }

    const issue = (await issueResponse.json()) as {
      number: number;
      html_url: string;
      node_id: string;
    };

    if (apiConfig.GITHUB_FEEDBACK_PROJECT_ID) {
      try {
        await this.addIssueToProject(issue.node_id);
      } catch (error) {
        console.warn('Created GitHub feedback issue, but could not add it to the configured project.', error);
      }
    }

    return {
      number: issue.number,
      url: issue.html_url,
    };
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
    const summary = feedback.message.trim() || `${feedback.rating} feedback from ${feedback.page}`;
    return `[Feedback] ${feedback.page}: ${truncate(summary, 90)}`;
  }

  private issueBody(feedback: FeedbackEntry) {
    return [
      '## Feedback',
      '',
      feedback.message.trim() || '_No written message provided._',
      '',
      '## Context',
      '',
      `- Page: ${feedback.page}`,
      `- Rating: ${feedback.rating}`,
      `- Submitted by: ${feedback.userEmail} (${feedback.userRole})`,
      `- Submitted at: ${feedback.createdAt}`,
      `- Priority: ${feedback.priority ?? 'medium'}`,
      `- Feedback ID: ${feedback.id}`,
      feedback.userAgent ? `- User agent: ${feedback.userAgent}` : null,
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n');
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

  if (!owner || !repo) {
    throw new GitHubFeedbackError('GITHUB_FEEDBACK_REPOSITORY must use the format "owner/repo".');
  }

  return { owner, repo };
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
