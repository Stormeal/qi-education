import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CourseReviewAction, CourseReviewState } from '../../app.models';
import { Button } from '../button/button';

@Component({ selector: 'app-course-review-panel', imports: [DatePipe, Button], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './course-review-panel.html', styleUrl: './course-review-panel.scss' })
export class CourseReviewPanel {
  readonly review = input<CourseReviewState | null>(null);
  readonly canAdmin = input(false); readonly pending = input(false); readonly loading = input(false);
  readonly blocked = input(false);
  /** US-A007: the viewer reviews this course but cannot author it. */
  readonly reviewerOnly = input(false);
  readonly reviewers = computed(() => this.review()?.reviewers ?? null);
  /** US-A007: how many assigned reviewers have not approved yet; publish waits for 0. */
  readonly commentLabel = computed(() => this.canAdmin() && this.reviewers()?.viewerVerdict ? 'Comment or return reason'
    : this.canAdmin() ? 'Return reason' : 'Review comment');
  readonly waitingFor = computed(() => { const r = this.reviewers(); return r ? r.total - r.approved : 0; });
  readonly error = input(''); readonly reason = input('');
  readonly action = output<CourseReviewAction>(); readonly reasonChanged = output<string>();
  readonly history = computed(() => {
    const revisions: (string | null)[] = [];
    return (this.review()?.history ?? []).map(event => {
      if (!revisions.includes(event.revisionId)) revisions.push(event.revisionId);
      return { ...event, revisionNumber: revisions.indexOf(event.revisionId) + 1 };
    });
  });
  label(action: string): string { return ({ 'start-revision': 'Revision started', submit: 'Submitted for review', return: 'Returned for changes', publish: 'Published', archive: 'Archived', approve: 'Approved by reviewer', 'request-changes': 'Changes requested by reviewer' } as Record<string, string>)[action] ?? action; }
  verdictLabel(verdict: string): string { return ({ waiting: 'Waiting for your verdict', approved: 'You approved this revision', 'changes-requested': 'You requested changes' } as Record<string, string>)[verdict] ?? verdict; }
  changeReason(event: Event): void { this.reasonChanged.emit((event.target as HTMLTextAreaElement).value); }
}
