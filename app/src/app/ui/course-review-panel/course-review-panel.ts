import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CourseReviewAction, CourseReviewState } from '../../app.models';
import { AppButton } from '../app-button/app-button';

@Component({ selector: 'app-course-review-panel', imports: [DatePipe, AppButton], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './course-review-panel.html', styleUrl: './course-review-panel.scss' })
export class CourseReviewPanel {
  readonly review = input<CourseReviewState | null>(null);
  readonly canAdmin = input(false); readonly pending = input(false); readonly loading = input(false);
  readonly error = input(''); readonly reason = input('');
  readonly action = output<CourseReviewAction>(); readonly reasonChanged = output<string>();
  readonly history = computed(() => {
    const revisions: (string | null)[] = [];
    return (this.review()?.history ?? []).map(event => {
      if (!revisions.includes(event.revisionId)) revisions.push(event.revisionId);
      return { ...event, revisionNumber: revisions.indexOf(event.revisionId) + 1 };
    });
  });
  label(action: string): string { return ({ 'start-revision': 'Revision started', submit: 'Submitted for review', return: 'Returned for changes', publish: 'Published', archive: 'Archived' } as Record<string, string>)[action] ?? action; }
  changeReason(event: Event): void { this.reasonChanged.emit((event.target as HTMLTextAreaElement).value); }
}
