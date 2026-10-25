import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CourseSummary, FeedbackOption, StudentSummary } from '../../app.models';
import { RouterLink } from '@angular/router';
import { CareerPathService } from '../../services/career-path.service';
import { AppStateService } from '../../services/app-state.service';
import { LearningProgressService } from '../../services/learning-progress.service';
import { PROGRESS_SYNC_NOTICE } from '../progress-sync-notice';
import { AdminAttention } from '../../ui/admin-attention/admin-attention';
import { Button } from '../../ui/button/button';
import { PageHeader } from '../../ui/page-header/page-header';
import { ProgressBar } from '../../ui/progress-bar/progress-bar';

@Component({
  selector: 'app-dashboard-page',
  imports: [AdminAttention, Button, PageHeader, RouterLink, ProgressBar],
  templateUrl: './dashboard-page.html',
  styleUrls: ['../../app.scss', './dashboard-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  protected readonly careerPath = inject(CareerPathService);
  private readonly learningProgress = inject(LearningProgressService);
  protected readonly state = inject(AppStateService);
  protected readonly isAdmin = computed(() => this.state.loginState()?.user.role === 'admin');
  protected readonly progressSyncNotice = computed(() => this.learningProgress.accountSyncState() === 'pending' ? PROGRESS_SYNC_NOTICE : '');
  readonly appVersion = input.required<string>();
  readonly currentYear = input.required<number>();
  readonly student = input.required<StudentSummary>();
  readonly userEmail = input.required<string>();
  readonly userRoleLabel = input.required<string>();
  readonly canAccessAdmin = input.required<boolean>();
  readonly activeCourse = input.required<CourseSummary | null>();
  readonly courses = input.required<CourseSummary[]>();
  readonly coursesLoading = input.required<boolean>();
  readonly coursesError = input.required<string>();
  // The course to continue: one already started beats one not started; unknown progress is never recommended.
  protected readonly recommended = computed(() => {
    const open = this.courses().filter((course) => course.status === 'In progress');
    return open.find((course) => course.completed > 0) ?? open[0] ?? null;
  });
  protected readonly orderedCourses = computed(() => {
    const first = this.recommended();
    return first ? [first, ...this.courses().filter((course) => course !== first)] : this.courses();
  });
  readonly progressReloaded = output<void>();
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
  readonly libraryClicked = output<void>();
  readonly adminClicked = output<void>();
  readonly careerPathClicked = output<void>();
}
