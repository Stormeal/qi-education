import type { FeedbackEntry, UpdateFeedbackTriageInput } from './feedback.js';
import { FeedbackReadOnlyError, type FeedbackRepository } from './feedbackRepository.js';
import type { GitHubFeedbackService } from './githubFeedback.js';
import { FeedbackIssueOperationUnavailableError, type FeedbackIssueOperationRepository } from './feedbackIssueOperationRepository.js';
import { randomUUID } from 'node:crypto';
import { GitHubFeedbackError, type GitHubFeedbackIssue } from './githubFeedback.js';
import { KeyedSerialQueue } from './keyedSerialQueue.js';

export class FeedbackTriagePendingError extends Error {
  constructor() {
    super('GitHub issue creation is unresolved. Retry to recover an existing issue, or ask an operator to reconcile the feedback issue operation before creating another issue.');
  }
}
export class FeedbackTriageService {
  private readonly writes = new KeyedSerialQueue();
  constructor(private readonly repository: FeedbackRepository, private readonly github: GitHubFeedbackService,
    private readonly operations: FeedbackIssueOperationRepository) {}
  async triage(id: string, input: UpdateFeedbackTriageInput): Promise<FeedbackEntry | null> {
    return this.writes.run(id, async () => {
      if (this.repository.readOnly) throw new FeedbackReadOnlyError();
      const feedback = await this.repository.findFeedbackById(id);
      if (!feedback) return null;
      let issue: GitHubFeedbackIssue | undefined;
      if (!feedback.githubIssueUrl) {
        if (input.workStatus === 'work') {
          issue = await this.issueFor({ ...feedback, ...input, priority: input.priority ?? undefined });
        } else {
          try {
            const operation = await this.operations.find(this.operationKey(feedback));
            if (operation?.state === 'created') issue = operation.issue;
          } catch (error) {
            // Changing status does not create an external side effect. An unavailable
            // journal must not prevent archiving; a later Work retry recovers its link.
            if (!(error instanceof FeedbackIssueOperationUnavailableError)) throw error;
          }
        }
      }
      return this.repository.updateFeedbackTriage(id, {
        ...input,
        githubIssueNumber: issue?.number ?? feedback.githubIssueNumber,
        githubIssueUrl: issue?.url ?? feedback.githubIssueUrl,
      });
    });
  }

  private async issueFor(feedback: FeedbackEntry): Promise<GitHubFeedbackIssue> {
    const key = this.operationKey(feedback);
    const claim = await this.operations.claim(key, randomUUID());
    if (claim.operation.state === 'created' && claim.operation.issue) return claim.operation.issue;
    if (!claim.claimed) {
      let recovered: GitHubFeedbackIssue | null = null;
      try { recovered = await this.github.findIssueFromFeedback?.(feedback) ?? null; }
      catch { throw new FeedbackTriagePendingError(); }
      // Even a complete bounded lookup returning nothing cannot prove a lost
      // external POST was rejected. A claim never expires into a second POST.
      if (!recovered) throw new FeedbackTriagePendingError();
      await this.operations.recordCreated(key, claim.operation.owner, recovered);
      return recovered;
    }
    let issue: GitHubFeedbackIssue;
    try { issue = await this.github.createIssueFromFeedback(feedback); }
    catch (error) {
      if (error instanceof GitHubFeedbackError && !error.uncertain) {
        await this.operations.release(key, claim.operation.owner);
        throw error;
      }
      throw new FeedbackTriagePendingError();
    }
    // Journal the result independently of the feedback update. A failure leaves
    // the original claim in place for recovery instead of enabling a new POST.
    await this.operations.recordCreated(key, claim.operation.owner, issue);
    return issue;
  }

  private operationKey(feedback: FeedbackEntry): string {
    return JSON.stringify([this.github.operationNamespace ?? 'isolated', feedback.id]);
  }
}
