import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  FeedbackEntry,
  FeedbackOption,
  FeedbackTriageUpdate,
  StudentSummary,
} from '../../app.models';
import { AppButton } from '../../ui/app-button/app-button';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { PageHeader } from '../../ui/page-header/page-header';

type FeedbackPriority = 'low' | 'medium' | 'high';
type FeedbackWorkStatus = 'work' | 'completed' | 'wont-do';

@Component({
  selector: 'app-admin-page',
  imports: [DatePipe, AppButton, FeedbackDialog, PageHeader],
  templateUrl: './admin-page.html',
  styleUrls: ['../../app.scss', './admin-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPage {
  readonly appVersion = input.required<string>();
  readonly currentYear = input.required<number>();
  readonly student = input.required<StudentSummary>();
  readonly userEmail = input.required<string>();
  readonly userRoleLabel = input.required<string>();
  readonly feedback = input.required<FeedbackEntry[]>();
  readonly feedbackLoading = input.required<boolean>();
  readonly feedbackError = input.required<string>();
  readonly isFeedbackOpen = input.required<boolean>();
  readonly feedbackSubmitted = input.required<boolean>();
  readonly feedbackPage = input.required<string>();
  readonly feedbackRating = input.required<string>();
  readonly feedbackText = input.required<string>();
  readonly feedbackSubmitting = input.required<boolean>();
  readonly feedbackSubmitError = input.required<string>();
  readonly feedbackOptions = input.required<FeedbackOption[]>();

  readonly homeClicked = output<void>();
  readonly coursesClicked = output<void>();
  readonly feedbackOpened = output<void>();
  readonly loggedOut = output<void>();
  readonly adminClicked = output<void>();
  readonly feedbackReloaded = output<void>();
  readonly feedbackClosed = output<void>();
  readonly feedbackRatingSelected = output<string>();
  readonly feedbackTextChanged = output<string>();
  readonly feedbackSubmittedClicked = output<void>();
  readonly feedbackTriaged = output<FeedbackTriageUpdate>();

  protected readonly workStatusOptions: { value: FeedbackWorkStatus; label: string }[] = [
    { value: 'work', label: 'Mark for work' },
    { value: 'completed', label: 'Completed' },
    { value: 'wont-do', label: "Won't do" },
  ];
  protected readonly priorityOptions: { value: FeedbackPriority; label: string }[] = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];
  protected readonly feedbackTotal = computed(() => this.feedback().length);
  protected readonly needsWorkTotal = computed(
    () => this.feedback().filter((item) => item.rating === 'needs-work').length,
  );
  protected readonly activePagesTotal = computed(
    () => new Set(this.feedback().map((item) => item.page)).size,
  );

  protected ratingLabel(rating: FeedbackEntry['rating']): string {
    switch (rating) {
      case 'great':
        return 'Great';
      case 'needs-work':
        return 'Bad';
      default:
        return 'Okay';
    }
  }

  protected isSelected(item: FeedbackEntry): boolean {
    return !!item.workStatus;
  }

  protected isCompleted(item: FeedbackEntry): boolean {
    return item.workStatus === 'completed';
  }

  protected isWontDo(item: FeedbackEntry): boolean {
    return item.workStatus === 'wont-do';
  }

  protected selectedStatus(item: FeedbackEntry): FeedbackWorkStatus | null {
    return item.workStatus ?? null;
  }

  protected selectedPriority(item: FeedbackEntry): FeedbackPriority {
    return item.priority ?? 'medium';
  }

  protected selectStatus(item: FeedbackEntry, workStatus: FeedbackWorkStatus): void {
    this.feedbackTriaged.emit({
      id: item.id,
      workStatus,
      priority: workStatus === 'work' ? item.priority ?? 'medium' : undefined,
    });
  }

  protected selectPriority(item: FeedbackEntry, priority: FeedbackPriority): void {
    this.feedbackTriaged.emit({
      id: item.id,
      workStatus: item.workStatus ?? 'work',
      priority,
    });
  }
}
