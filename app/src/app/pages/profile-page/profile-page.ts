import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FeedbackOption } from '../../app.models';
import { AppButton } from '../../ui/app-button/app-button';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { PageHeader } from '../../ui/page-header/page-header';

const BIO_MAX_LENGTH = 280;
const GOALS_MAX_LENGTH = 280;

@Component({
  selector: 'app-profile-page',
  imports: [AppButton, FeedbackDialog, PageHeader],
  templateUrl: './profile-page.html',
  styleUrls: ['../../app.scss', './profile-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  readonly appVersion = input.required<string>();
  readonly currentYear = input.required<number>();
  readonly displayName = input.required<string>();
  readonly email = input.required<string>();
  readonly roleLabel = input.required<string>();
  readonly canAccessAdmin = input.required<boolean>();
  readonly memberSince = input.required<string>();
  readonly enrolledCount = input.required<number>();
  readonly avatarColor = input.required<string>();
  readonly avatarColorOptions = input.required<readonly string[]>();
  readonly bio = input.required<string>();
  readonly jobTitle = input.required<string>();
  readonly company = input.required<string>();
  readonly learningGoals = input.required<string>();
  readonly profileSaving = input.required<boolean>();
  readonly profileSaved = input.required<boolean>();
  readonly profileDirty = input.required<boolean>();
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
  readonly libraryClicked = output<void>();
  readonly feedbackOpened = output<void>();
  readonly loggedOut = output<void>();
  readonly adminClicked = output<void>();
  readonly bioChanged = output<string>();
  readonly jobTitleChanged = output<string>();
  readonly companyChanged = output<string>();
  readonly learningGoalsChanged = output<string>();
  readonly avatarColorSelected = output<string>();
  readonly profileSaveClicked = output<void>();
  readonly feedbackClosed = output<void>();
  readonly feedbackRatingSelected = output<string>();
  readonly feedbackTextChanged = output<string>();
  readonly feedbackSubmittedClicked = output<void>();

  protected readonly bioMaxLength = BIO_MAX_LENGTH;
  protected readonly goalsMaxLength = GOALS_MAX_LENGTH;

  protected readonly initials = computed(() =>
    this.displayName()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.profileSaveClicked.emit();
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
