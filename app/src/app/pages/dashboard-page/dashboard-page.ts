import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CourseSummary, FeedbackOption, NextAction, StudentSummary } from '../../app.models';
import { AppButton } from '../../ui/app-button/app-button';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { PageHeader } from '../../ui/page-header/page-header';

@Component({
  selector: 'app-dashboard-page',
  imports: [AppButton, FeedbackDialog, PageHeader],
  templateUrl: './dashboard-page.html',
  styleUrl: '../../app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  readonly appVersion = input.required<string>();
  readonly currentYear = input.required<number>();
  readonly student = input.required<StudentSummary>();
  readonly userEmail = input.required<string>();
  readonly userRoleLabel = input.required<string>();
  readonly canAccessAdmin = input.required<boolean>();
  readonly activeCourse = input.required<CourseSummary>();
  readonly recommendedCourses = input.required<CourseSummary[]>();
  readonly nextActions = input.required<NextAction[]>();
  readonly isFeedbackOpen = input.required<boolean>();
  readonly feedbackSubmitted = input.required<boolean>();
  readonly feedbackPage = input.required<string>();
  readonly feedbackRating = input.required<string>();
  readonly feedbackText = input.required<string>();
  readonly feedbackSubmitting = input.required<boolean>();
  readonly feedbackError = input.required<string>();
  readonly feedbackOptions = input.required<FeedbackOption[]>();

  readonly feedbackOpened = output<void>();
  readonly loggedOut = output<void>();
  readonly feedbackClosed = output<void>();
  readonly feedbackRatingSelected = output<string>();
  readonly feedbackTextChanged = output<string>();
  readonly feedbackSubmittedClicked = output<void>();
  readonly homeClicked = output<void>();
  readonly coursesClicked = output<void>();
  readonly adminClicked = output<void>();
}
