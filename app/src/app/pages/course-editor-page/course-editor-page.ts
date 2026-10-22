import { CourseTeachers } from '../../ui/course-teachers/course-teachers';
import { CourseReviewPanel } from '../../ui/course-review-panel/course-review-panel';
import { CourseDraftStatus } from '../../ui/course-draft-status/course-draft-status';
import type { CourseEditorBuffer, RecoverableCourseDraft } from '../../services/course-draft-recovery.service';
import { CourseReviewAction, CourseReviewState, QuizQuestionEdit } from '../../app.models';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { normalizeBulletList } from '../../utils/bullet-list';
import { CourseFormStepId, courseFormLockedReason, courseFormSteps } from '../../utils/course-form-steps';
import {
  CourseComponentType,
  CourseContentDocument,
  CourseCreateDraft,
  CourseListItem,
  FeedbackOption,
  StudentSummary,
} from '../../app.models';
import { CourseService } from '../../services/course.service';
import { ApiClientService } from '../../services/api-client.service';
import { Button } from '../../ui/button/button';
import { CourseBuilder } from '../../ui/course-builder/course-builder';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { PageHeader } from '../../ui/page-header/page-header';
import { ProgressBar } from '../../ui/progress-bar/progress-bar';

@Component({
  selector: 'app-course-editor-page',
  imports: [CourseDraftStatus, CourseReviewPanel, CourseTeachers, Button, CourseBuilder, FeedbackDialog, PageHeader, ProgressBar],
  templateUrl: './course-editor-page.html',
  styleUrls: ['../../app.scss', './course-editor-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseEditorPage {
  private readonly apiClient = inject(ApiClientService);
  private readonly courseService = inject(CourseService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  readonly appVersion = input.required<string>();
  readonly currentYear = input.required<number>();
  readonly student = input.required<StudentSummary>();
  readonly userEmail = input.required<string>();
  readonly userRoleLabel = input.required<string>();
  readonly canAccessAdmin = input.required<boolean>();
  readonly courseFormMode = input.required<'create' | 'edit'>();
  readonly editingCourse = input.required<CourseListItem | null>();
  readonly courseDraft = input.required<CourseCreateDraft>();
  readonly courseReview = input<CourseReviewState | null>(null);
  readonly courseEditable = input(true);
  readonly recoveryAvailable = input(false);
  readonly recoveryDrafts = input<RecoverableCourseDraft[]>([]);
  readonly recoveryKey = input('');
  readonly recoverySelected = output<string>();
  readonly recoveryError = input('');
  readonly saveConflict = input(false);
  readonly latestVersion = input<CourseContentDocument | null>(null);
  readonly latestLoading = input(false);
  readonly draftRestored = output<void>();
  readonly recoveryDiscarded = output<void>();
  readonly latestRequested = output<void>();
  readonly draftReconciled = output<void>();
  readonly latestAccepted = output<void>();
  readonly reviewPending = input(false); readonly reviewError = input(''); readonly reviewReason = input('');
  readonly reviewAction = output<CourseReviewAction>(); readonly reviewReasonChanged = output<string>();
  readonly courseSubmitting = input.required<boolean>();
  readonly courseCreateError = input.required<string>();
  readonly courseSaveNotice = input.required<string>();
  readonly courseContent = input.required<CourseContentDocument | null>();
  readonly courseContentLoading = input.required<boolean>();
  readonly courseContentSaving = input.required<boolean>();
  readonly courseContentError = input.required<string>();
  readonly muxUploadComponentId = input.required<string>();
  readonly muxUploadError = input.required<string>();
  readonly muxUploadProgress = input.required<Record<string, number>>();
  readonly attachmentUploadComponentId = input.required<string>();
  readonly attachmentUploadProgress = input.required<Record<string, number>>();
  readonly attachmentUploadStage = input.required<Record<string, 'uploading' | 'saving'>>();
  readonly attachmentUploadError = input.required<string>();
  readonly quizImageUrls = input<Record<string, string>>({});
  readonly thumbnailUploading = input.required<boolean>();
  readonly thumbnailError = input.required<string>();
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
  readonly careerPathClicked = output<void>();
  readonly courseCanceled = output<void>();
  readonly courseTitleChanged = output<string>();
  readonly courseDescriptionChanged = output<string>();
  readonly courseRequirementsChanged = output<string>();
  readonly courseWhatYoullLearnChanged = output<string>();
  readonly courseAudienceChanged = output<string>();
  readonly courseLevelChanged = output<string>();
  readonly coursePartOfCareerChanged = output<string>();
  readonly courseTeacherChanged = output<string>();
  readonly courseCareerGoalsChanged = output<string>();
  readonly courseStatusChanged = output<string>();
  readonly courseSubmitted = output<void>();
  readonly courseThumbnailSelected = output<File>();
  readonly courseSectionAdded = output<void>();
  readonly courseEditorBufferChanged = output<boolean>();
  readonly courseFocusedBufferChanged = output<CourseEditorBuffer | null>();
  readonly courseSectionRemoved = output<number>();
  readonly courseSectionTitleChanged = output<{ sectionIndex: number; value: string }>();
  readonly courseComponentAdded = output<{ sectionIndex: number; type: CourseComponentType }>();
  readonly courseComponentRemoved = output<{ sectionIndex: number; componentIndex: number }>();
  readonly courseComponentTitleChanged =
    output<{ sectionIndex: number; componentIndex: number; value: string }>();
  readonly courseComponentTypeChanged =
    output<{ sectionIndex: number; componentIndex: number; value: string }>();
  readonly courseComponentDurationChanged =
    output<{ sectionIndex: number; componentIndex: number; value: string }>();
  readonly courseComponentContentChanged =
    output<{ sectionIndex: number; componentIndex: number; value: string }>();
  readonly courseComponentUrlChanged =
    output<{ sectionIndex: number; componentIndex: number; value: string }>();
  readonly courseComponentMuxVideoSelected =
    output<{ sectionIndex: number; componentIndex: number; file: File }>();
  readonly courseComponentMuxVideoRemoved =
    output<{ sectionIndex: number; componentIndex: number }>();
  readonly courseComponentAttachmentSelected =
    output<{ sectionIndex: number; componentIndex: number; file: File; markerId: string }>();
  readonly attachmentErrorDismissed = output<void>();
  readonly courseComponentAttachmentRemoved =
    output<{ sectionIndex: number; componentIndex: number; assetId: string }>();
  readonly courseComponentAttachmentDownloaded =
    output<{ sectionIndex: number; componentIndex: number; assetId: string; fileName: string }>();
  readonly courseComponentQuizQuestionChanged =
    output<{ sectionIndex: number; componentIndex: number; questionIndex: number; value: string }>();
  readonly courseComponentQuizPointsChanged =
    output<{ sectionIndex: number; componentIndex: number; questionIndex: number; value: string }>();
  readonly courseComponentQuizPassPointsChanged =
    output<{ sectionIndex: number; componentIndex: number; value: string }>();
  readonly courseComponentQuizQuestionAdded =
    output<{ sectionIndex: number; componentIndex: number }>();
  readonly courseComponentQuizQuestionRemoved =
    output<{ sectionIndex: number; componentIndex: number; questionIndex: number }>();
  readonly courseComponentQuizAnswerTextChanged =
    output<{ sectionIndex: number; componentIndex: number; questionIndex: number; answerIndex: number; value: string }>();
  readonly courseComponentQuizAnswerDescriptionChanged =
    output<{ sectionIndex: number; componentIndex: number; questionIndex: number; answerIndex: number; value: string }>();
  readonly courseComponentQuizAnswerCorrectChanged =
    output<{ sectionIndex: number; componentIndex: number; questionIndex: number; answerIndex: number; value: boolean }>();
  readonly courseComponentQuizImageSelected = output<{ sectionIndex: number; componentIndex: number; questionId: string; file: File }>();
  readonly courseComponentQuizImageRemoved = output<{ sectionIndex: number; componentIndex: number; questionIndex: number }>();
  readonly courseComponentQuizQuestionEdited =
    output<{ sectionIndex: number; componentIndex: number; questionIndex: number; edit: QuizQuestionEdit }>();
  readonly courseComponentMoved = output<{ sectionIndex: number; fromIndex: number; toIndex: number; toSectionIndex?: number }>();
  readonly feedbackClosed = output<void>();
  readonly feedbackRatingSelected = output<string>();
  readonly feedbackTextChanged = output<string>();
  readonly feedbackSubmittedClicked = output<void>();
  // One step of the form is shown at a time. A new course opens on the first step; a saved
  // course opens on the first step that still needs something.
  protected readonly activeStep = signal<CourseFormStepId>('essentials');
  private openedFor: string | null = null;

  protected readonly steps = computed(() => courseFormSteps(this.courseDraft(), this.courseFormMode() === 'edit',
    !!this.editingCourse()?.thumbnailAssetId, this.totalComponentCount(), this.courseReview()));
  private readonly openSteps = computed(() => this.steps().filter((step) => !step.locked));
  protected readonly previousStep = computed(() => this.openSteps()[this.openSteps().findIndex((step) => step.id === this.activeStep()) - 1] ?? null);
  protected readonly nextStep = computed(() => this.openSteps()[this.openSteps().findIndex((step) => step.id === this.activeStep()) + 1] ?? null);

  // Why the form is read-only, said where the teacher is looking, with the way out when there is one.
  protected readonly lockedReason = computed(() =>
    this.courseFormMode() !== 'edit' || this.courseEditable() || this.courseContentLoading() ? null : courseFormLockedReason(this.courseReview()));

  constructor() {
    effect(() => {
      const courseId = this.courseFormMode() === 'edit' ? this.editingCourse()?.id ?? null : 'new';
      if (!courseId || courseId === this.openedFor || (courseId !== 'new' && this.courseContentLoading())) return;
      this.openedFor = courseId;
      const steps = untracked(() => this.openSteps());
      this.activeStep.set(courseId === 'new' ? 'essentials' : (steps.find((step) => !step.done) ?? steps[0]).id);
    });
  }

  protected goToStep(id: CourseFormStepId): void {
    this.activeStep.set(id);
    // Focus follows the step, so keyboard and screen reader users land on its heading.
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.editor-section:not([hidden]) h3')?.focus());
  }

  // Bullet fields are rewritten while typing; put the cursor back where the teacher was.
  protected bulletValue(event: Event): string {
    const field = event.target as HTMLTextAreaElement;
    const value = normalizeBulletList(field.value);
    if (value !== field.value) {
      const caret = Math.max(0, field.selectionStart + value.length - field.value.length);
      field.value = value;
      field.setSelectionRange(caret, caret);
    }
    return value;
  }

  protected statusLabel(): string {
    switch (this.courseDraft().status) {
      case 'ready-for-review':
        return 'Ready for review';
      case 'published':
        return 'Published';
      case 'archived':
        return 'Archived';
      default:
        return 'Draft';
    }
  }

  protected draftTitle(): string {
    return this.courseDraft().title.trim() || (this.courseFormMode() === 'edit' ? 'Untitled course' : 'New course');
  }

  protected draftDescription(): string {
    return this.courseDraft().description.trim() || 'Add a focused description so learners can understand the course at a glance.';
  }

  protected goalsList(): string[] {
    return this.courseDraft()
      .careerGoals.split(',')
      .map((goal) => goal.trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  protected totalSectionCount(): number {
    return this.courseContent()?.sections.length ?? 0;
  }

  protected totalComponentCount(): number {
    return this.courseContent()?.sections.reduce((total, section) => total + section.components.length, 0) ?? 0;
  }

  protected totalDurationMinutes(): number {
    return (
      this.courseContent()?.sections.reduce(
        (total, section) =>
          total +
          section.components.reduce((sectionTotal, component) => sectionTotal + component.durationMinutes, 0),
        0,
      ) ?? 0
    );
  }

  protected completionPercent(): number {
    const draft = this.courseDraft();
    const values = [
      draft.title,
      draft.teacher,
      draft.level,
      draft.partOfCareer,
      draft.description,
      draft.audience,
      draft.requirements,
      draft.whatYoullLearn,
      draft.careerGoals,
    ];
    const filled = values.filter((value) => value.trim().length > 0).length;

    return Math.round((filled / values.length) * 100);
  }

  protected contentSummary(): string {
    if (this.courseContentLoading()) {
      return 'Loading outline';
    }

    if (this.totalSectionCount() === 0) {
      return 'No sections yet';
    }

    return `${this.totalSectionCount()} sections / ${this.totalComponentCount()} components / ${this.formatDuration(this.totalDurationMinutes())}`;
  }

  protected durationSummary(): string {
    return this.totalDurationMinutes() > 0 ? this.formatDuration(this.totalDurationMinutes()) : '--';
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

  protected selectThumbnail(event: Event): void {
    const control = event.target;

    if (!(control instanceof HTMLInputElement) || !control.files?.[0]) {
      return;
    }

    this.courseThumbnailSelected.emit(control.files[0]);
    control.value = '';
  }

  protected thumbnailUrl(course: CourseListItem | null): string {
    return this.courseService.thumbnailUrl(course);
  }

  private formatDuration(durationMinutes: number): string {
    if (durationMinutes <= 0) {
      return '0 min';
    }

    if (durationMinutes < 60) {
      return `${durationMinutes} min`;
    }

    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
}
