import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CourseListItem, FeedbackOption, StudentSummary } from '../../app.models';
import { AppButton } from '../../ui/app-button/app-button';
import { BrandLink } from '../../ui/brand-link/brand-link';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { ProfileMenu } from '../../ui/profile-menu/profile-menu';

@Component({
  selector: 'app-courses-page',
  imports: [AppButton, BrandLink, FeedbackDialog, ProfileMenu],
  templateUrl: './courses-page.html',
  styleUrls: ['../../app.scss', './courses-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoursesPage {
  readonly appVersion = input.required<string>();
  readonly currentYear = input.required<number>();
  readonly student = input.required<StudentSummary>();
  readonly userEmail = input.required<string>();
  readonly userRoleLabel = input.required<string>();
  readonly canAccessAdmin = input.required<boolean>();
  readonly courses = input.required<CourseListItem[]>();
  readonly coursesLoading = input.required<boolean>();
  readonly coursesError = input.required<string>();
  readonly canCreateCourses = input.required<boolean>();
  readonly isFeedbackOpen = input.required<boolean>();
  readonly feedbackSubmitted = input.required<boolean>();
  readonly feedbackPage = input.required<string>();
  readonly feedbackRating = input.required<string>();
  readonly feedbackText = input.required<string>();
  readonly feedbackSubmitting = input.required<boolean>();
  readonly feedbackError = input.required<string>();
  readonly feedbackOptions = input.required<FeedbackOption[]>();

  readonly homeClicked = output<void>();
  readonly coursesClicked = output<void>();
  readonly feedbackOpened = output<void>();
  readonly loggedOut = output<void>();
  readonly createCourseOpened = output<void>();
  readonly courseOpened = output<string>();
  readonly editCourseOpened = output<string>();
  readonly feedbackClosed = output<void>();
  readonly feedbackRatingSelected = output<string>();
  readonly feedbackTextChanged = output<string>();
  readonly feedbackSubmittedClicked = output<void>();
  readonly adminClicked = output<void>();

  protected courseBadge(course: CourseListItem): string {
    return course.status === 'published' ? 'Free' : course.status;
  }

  protected teacherInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }
}
