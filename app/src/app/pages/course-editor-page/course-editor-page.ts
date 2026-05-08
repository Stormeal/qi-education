import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CourseCreateDraft, FeedbackOption, StudentSummary } from '../../app.models';
import { AppButton } from '../../ui/app-button/app-button';
import { BrandLink } from '../../ui/brand-link/brand-link';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { ProfileMenu } from '../../ui/profile-menu/profile-menu';

@Component({
  selector: 'app-course-editor-page',
  imports: [AppButton, BrandLink, FeedbackDialog, ProfileMenu],
  templateUrl: './course-editor-page.html',
  styleUrls: ['../../app.scss', './course-editor-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseEditorPage {
  readonly appVersion = input.required<string>();
  readonly currentYear = input.required<number>();
  readonly student = input.required<StudentSummary>();
  readonly userEmail = input.required<string>();
  readonly userRoleLabel = input.required<string>();
  readonly canAccessAdmin = input.required<boolean>();
  readonly courseFormMode = input.required<'create' | 'edit'>();
  readonly courseDraft = input.required<CourseCreateDraft>();
  readonly courseSubmitting = input.required<boolean>();
  readonly courseCreateError = input.required<string>();
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
  readonly adminClicked = output<void>();
  readonly courseCanceled = output<void>();
  readonly courseTitleChanged = output<string>();
  readonly courseDescriptionChanged = output<string>();
  readonly courseRequirementsChanged = output<string>();
  readonly courseAudienceChanged = output<string>();
  readonly courseLevelChanged = output<string>();
  readonly courseTeacherChanged = output<string>();
  readonly courseCareerGoalsChanged = output<string>();
  readonly courseStatusChanged = output<string>();
  readonly courseSubmitted = output<void>();
  readonly feedbackClosed = output<void>();
  readonly feedbackRatingSelected = output<string>();
  readonly feedbackTextChanged = output<string>();
  readonly feedbackSubmittedClicked = output<void>();

  protected requirementItems(): string[] {
    return this.courseDraft()
      .requirements.split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  protected statusLabel(): string {
    switch (this.courseDraft().status) {
      case 'published':
        return 'Published';
      case 'archived':
        return 'Archived';
      default:
        return 'Draft';
    }
  }

  protected controlValue(event: Event): string {
    const control = event.target;

    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement
    ) {
      return control.value;
    }

    return '';
  }
}
