import { DatePipe } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { lucideBanknote, lucidePencil, lucideSlidersHorizontal } from '@ng-icons/lucide';
import '@mux/mux-player';
import {
  CourseComponent,
  CourseCatalogMetadataDraft,
  CourseContentDocument,
  CourseListItem,
  FeedbackOption,
  StudentSummary,
} from '../../app.models';
import { ApiClientService } from '../../services/api-client.service';
import { AppButton } from '../../ui/app-button/app-button';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { LoadingSkeleton } from '../../ui/loading-skeleton/loading-skeleton';
import { PageHeader } from '../../ui/page-header/page-header';

type CourseViewMode = 'details' | 'learning';

@Component({
  selector: 'app-course-view-page',
  imports: [AppButton, DatePipe, FeedbackDialog, LoadingSkeleton, PageHeader],
  templateUrl: './course-view-page.html',
  styleUrls: ['../../app.scss', './course-view-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CourseViewPage {
  private readonly apiClient = inject(ApiClientService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly editCourseIcon = this.asSafeIcon(lucidePencil);
  protected readonly setPriceIcon = this.asSafeIcon(lucideBanknote);
  protected readonly catalogSettingsIcon = this.asSafeIcon(lucideSlidersHorizontal);

  protected readonly priceDraft = signal('');
  protected readonly isPriceModalOpen = signal(false);
  protected readonly pendingPriceSave = signal(false);
  protected readonly isCatalogModalOpen = signal(false);
  protected readonly pendingCatalogSave = signal(false);
  protected readonly catalogPremiumDraft = signal(false);
  protected readonly catalogBestsellerDraft = signal(false);
  protected readonly catalogRatingDraft = signal('0');
  protected readonly catalogRatingCountDraft = signal('0');
  protected readonly isEnrollDialogOpen = signal(false);
  protected readonly pendingEnrollment = signal(false);
  protected readonly expandedSectionIds = signal<string[]>([]);
  protected readonly expandedComponentIds = signal<string[]>([]);
  protected readonly allSectionsExpanded = computed(() => {
    const content = this.courseContent();
    return !!content && content.sections.length > 0 && this.expandedSectionIds().length === content.sections.length;
  });

  readonly appVersion = input.required<string>();
  readonly currentYear = input.required<number>();
  readonly student = input.required<StudentSummary>();
  readonly userEmail = input.required<string>();
  readonly userRoleLabel = input.required<string>();
  readonly canAccessAdmin = input.required<boolean>();
  readonly canCreateCourses = input.required<boolean>();
  readonly course = input.required<CourseListItem | null>();
  readonly coursesLoading = input.required<boolean>();
  readonly coursesError = input.required<string>();
  readonly courseContent = input.required<CourseContentDocument | null>();
  readonly courseContentLoading = input.required<boolean>();
  readonly courseContentError = input.required<string>();
  readonly priceSaving = input.required<boolean>();
  readonly priceSaveNotice = input.required<string>();
  readonly priceSaveNoticeError = input.required<boolean>();
  readonly catalogSaving = input.required<boolean>();
  readonly catalogSaveNotice = input.required<string>();
  readonly catalogSaveNoticeError = input.required<boolean>();
  readonly viewMode = input.required<CourseViewMode>();
  readonly isEnrolled = input.required<boolean>();
  readonly enrollmentSubmitting = input.required<boolean>();
  readonly enrollmentError = input.required<string>();
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
  readonly courseEdited = output<string>();
  readonly courseLearningOpened = output<string>();
  readonly coursePriceSaved = output<{ courseId: string; priceDkk: number | null }>();
  readonly courseCatalogSaved = output<{ courseId: string; metadata: CourseCatalogMetadataDraft }>();
  readonly courseEnrollmentConfirmed = output<string>();
  readonly feedbackClosed = output<void>();
  readonly feedbackRatingSelected = output<string>();
  readonly feedbackTextChanged = output<string>();
  readonly feedbackSubmittedClicked = output<void>();

  constructor() {
    effect(() => {
      const content = this.courseContent();

      if (!content || content.sections.length === 0) {
        this.expandedSectionIds.set([]);
        this.expandedComponentIds.set([]);
        return;
      }

      this.expandedSectionIds.set([content.sections[0].id]);
      this.expandedComponentIds.set([]);
    });

    effect(() => {
      if (!this.pendingPriceSave() || this.priceSaving() || !this.priceSaveNotice()) {
        return;
      }

      if (!this.priceSaveNoticeError()) {
        this.isPriceModalOpen.set(false);
      }

      this.pendingPriceSave.set(false);
    });

    effect(() => {
      if (!this.pendingCatalogSave() || this.catalogSaving() || !this.catalogSaveNotice()) {
        return;
      }

      if (!this.catalogSaveNoticeError()) {
        this.isCatalogModalOpen.set(false);
      }

      this.pendingCatalogSave.set(false);
    });

    effect(() => {
      if (!this.pendingEnrollment() || this.enrollmentSubmitting()) {
        return;
      }

      if (this.isEnrolled()) {
        this.isEnrollDialogOpen.set(false);
      }

      if (this.isEnrolled() || this.enrollmentError()) {
        this.pendingEnrollment.set(false);
      }
    });
  }

  protected openPriceModal(course: CourseListItem): void {
    this.priceDraft.set(course.priceDkk === null ? '' : String(course.priceDkk));
    this.pendingPriceSave.set(false);
    this.isPriceModalOpen.set(true);
  }

  protected closePriceModal(): void {
    if (this.priceSaving()) {
      return;
    }

    this.isPriceModalOpen.set(false);
  }

  protected openCatalogModal(course: CourseListItem): void {
    this.catalogPremiumDraft.set(course.isPremium);
    this.catalogBestsellerDraft.set(course.isBestseller);
    this.catalogRatingDraft.set(String(course.rating));
    this.catalogRatingCountDraft.set(String(course.ratingCount));
    this.pendingCatalogSave.set(false);
    this.isCatalogModalOpen.set(true);
  }

  protected closeCatalogModal(): void {
    if (this.catalogSaving()) {
      return;
    }

    this.isCatalogModalOpen.set(false);
  }

  protected updatePriceDraft(value: string): void {
    this.priceDraft.set(value);
  }

  protected applyPriceDraft(courseId: string): void {
    const value = this.priceDraft().trim();
    const parsed = value ? Number.parseInt(value, 10) : null;

    this.pendingPriceSave.set(true);
    this.coursePriceSaved.emit({
      courseId,
      priceDkk: parsed !== null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null,
    });
  }

  protected updateCatalogPremium(value: boolean): void {
    this.catalogPremiumDraft.set(value);
  }

  protected updateCatalogBestseller(value: boolean): void {
    this.catalogBestsellerDraft.set(value);
  }

  protected updateCatalogRating(value: string): void {
    this.catalogRatingDraft.set(value);
  }

  protected updateCatalogRatingCount(value: string): void {
    this.catalogRatingCountDraft.set(value);
  }

  protected applyCatalogDraft(courseId: string): void {
    const parsedRating = Number.parseFloat(this.catalogRatingDraft().trim());
    const parsedRatingCount = Number.parseInt(this.catalogRatingCountDraft().trim(), 10);

    this.pendingCatalogSave.set(true);
    this.courseCatalogSaved.emit({
      courseId,
      metadata: {
        isPremium: this.catalogPremiumDraft(),
        isBestseller: this.catalogBestsellerDraft(),
        rating:
          Number.isFinite(parsedRating) && parsedRating >= 0
            ? Math.min(5, Math.round(parsedRating * 10) / 10)
            : 0,
        ratingCount: Number.isFinite(parsedRatingCount) && parsedRatingCount >= 0 ? parsedRatingCount : 0,
      },
    });
  }

  protected openEnrollDialog(): void {
    this.pendingEnrollment.set(false);
    this.isEnrollDialogOpen.set(true);
  }

  protected openLearningWorkspace(courseId: string): void {
    this.courseLearningOpened.emit(courseId);
  }

  protected closeEnrollDialog(): void {
    if (this.enrollmentSubmitting()) {
      return;
    }

    this.isEnrollDialogOpen.set(false);
  }

  protected confirmEnrollment(courseId: string): void {
    if (this.enrollmentSubmitting()) {
      return;
    }

    this.pendingEnrollment.set(true);
    this.courseEnrollmentConfirmed.emit(courseId);
  }

  protected controlValue(event: Event): string {
    const control = event.target;

    return control instanceof HTMLInputElement ? control.value : '';
  }

  protected controlChecked(event: Event): boolean {
    const control = event.target;

    return control instanceof HTMLInputElement ? control.checked : false;
  }

  protected learningOutcomes(course: CourseListItem): string[] {
    if (course.whatYoullLearn.length > 0) {
      return course.whatYoullLearn.slice(0, 6);
    }

    const outcomes = [
      course.description,
      ...course.careerGoals.map((goal) => `Apply the course work toward ${goal.toLowerCase()}.`),
      `Understand the ${course.level.toLowerCase()}-level concepts covered by ${course.teacher}.`,
    ];

    return outcomes.filter(Boolean).slice(0, 6);
  }

  protected courseStatusLabel(status: CourseListItem['status']): string {
    switch (status) {
      case 'ready-for-review':
        return 'Ready for review';
      default:
        return status;
    }
  }

  protected totalLessonCount(): number {
    return this.courseContent()?.sections.reduce((total, section) => total + section.components.length, 0) ?? 0;
  }

  protected totalContentDurationMinutes(): number {
    return (
      this.courseContent()?.sections.reduce(
        (total, section) =>
          total +
          section.components.reduce((sectionTotal, component) => sectionTotal + component.durationMinutes, 0),
        0,
      ) ?? 0
    );
  }

  protected firstCourseComponent(): CourseContentDocument['sections'][number]['components'][number] | null {
    for (const section of this.courseContent()?.sections ?? []) {
      const component = section.components[0];

      if (component) {
        return component;
      }
    }

    return null;
  }

  protected muxPlaybackId(component: CourseComponent | null): string {
    return component?.type === 'video' && component.mux?.status === 'ready'
      ? component.mux.playbackId
      : '';
  }

  protected videoStatusText(component: CourseComponent | null): string {
    if (component?.type !== 'video' || !component.mux) {
      return 'Course material is being prepared. Use the course content panel to review the available outline.';
    }

    switch (component.mux.status) {
      case 'waiting':
      case 'uploading':
        return 'The video upload is still in progress.';
      case 'processing':
        return 'Mux is processing this video. It will appear here when it is ready.';
      case 'errored':
        return component.mux.errorMessage || 'This video could not be processed.';
      default:
        return component.content || 'Video lesson ready.';
    }
  }

  protected contentSummary(): string {
    if (this.courseContentLoading()) {
      return 'Loading content...';
    }

    const content = this.courseContent();

    if (!content || content.sections.length === 0) {
      return 'Content outline coming soon';
    }

    return `${content.sections.length} sections • ${this.totalLessonCount()} components • ${this.formatDurationLong(this.totalContentDurationMinutes())} total length`;
  }

  protected curriculumSections(course: CourseListItem): Array<{ title: string; meta: string; lessons: string[] }> {
    return [
      {
        title: 'Getting started',
        meta: '3 lessons',
        lessons: ['Course overview', 'Learning path setup', 'How to use the materials'],
      },
      {
        title: `${course.level} concepts`,
        meta: '4 lessons',
        lessons: ['Core terminology', 'Worked examples', 'Practice activity', 'Knowledge check'],
      },
      {
        title: 'Apply it at work',
        meta: '3 lessons',
        lessons: ['Scenario walkthrough', 'Reflection prompts', 'Next steps'],
      },
    ];
  }

  protected hasRealCurriculum(): boolean {
    return (this.courseContent()?.sections.length ?? 0) > 0;
  }

  protected sectionLectureMeta(componentCount: number, durationMinutes: number): string {
    const label = componentCount === 1 ? 'component' : 'components';
    return `${componentCount} ${label} • ${this.formatDurationLong(durationMinutes)}`;
  }

  protected sectionDurationMinutes(section: CourseContentDocument['sections'][number]): number {
    return section.components.reduce((total, component) => total + component.durationMinutes, 0);
  }

  protected toggleAllSections(): void {
    const content = this.courseContent();

    if (!content) {
      return;
    }

    this.expandedSectionIds.set(
      this.allSectionsExpanded() ? [] : content.sections.map((section) => section.id),
    );
  }

  protected toggleSection(sectionId: string): void {
    this.expandedSectionIds.update((expanded) =>
      expanded.includes(sectionId) ? expanded.filter((id) => id !== sectionId) : [...expanded, sectionId],
    );
  }

  protected isSectionExpanded(sectionId: string): boolean {
    return this.expandedSectionIds().includes(sectionId);
  }

  protected toggleComponent(componentId: string): void {
    this.expandedComponentIds.update((expanded) =>
      expanded.includes(componentId) ? expanded.filter((id) => id !== componentId) : [...expanded, componentId],
    );
  }

  protected isComponentExpanded(componentId: string): boolean {
    return this.expandedComponentIds().includes(componentId);
  }

  protected componentTypeLabel(type: string): string {
    switch (type) {
      case 'video':
        return 'Video';
      case 'quiz':
        return 'Quiz';
      case 'text':
        return 'Text';
      default:
        return type;
    }
  }

  protected componentIconGlyph(type: string): string {
    switch (type) {
      case 'video':
        return '▶';
      case 'quiz':
        return '✓';
      default:
        return '≡';
    }
  }

  protected componentDurationLabel(durationMinutes: number): string {
    return durationMinutes > 0 ? this.formatDurationShort(durationMinutes) : 'No duration';
  }

  protected componentHasDetails(component: CourseContentDocument['sections'][number]['components'][number]): boolean {
    if (component.type === 'quiz') {
      return (
        component.quiz.questions.some(
          (question) =>
            !!question.question.trim() ||
            question.answers.some((answer) => answer.text.trim() || answer.description.trim()),
        )
      );
    }

    return !!component.content.trim() || !!component.resourceUrl.trim();
  }

  protected componentPreviewText(component: CourseContentDocument['sections'][number]['components'][number]): string {
    if (component.type === 'quiz') {
      return component.quiz.questions[0]?.question.trim() || 'Quiz question coming soon.';
    }

    return component.content.trim() || 'No preview text available yet.';
  }

  protected teacherInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  protected coursePriceLabel(priceDkk: number | null): string {
    if (priceDkk === null) {
      return 'Free';
    }

    return `${new Intl.NumberFormat('da-DK').format(priceDkk)} DKK`;
  }

  protected ratingLabel(rating: number): string {
    return rating.toFixed(1);
  }

  protected ratingCountLabel(value: number): string {
    return `${new Intl.NumberFormat('en-US').format(value)} ratings`;
  }

  protected thumbnailUrl(course: CourseListItem): string {
    if (!course.thumbnailAssetId) {
      return '';
    }

    return this.apiClient.resourceUrl(
      `/courses/${encodeURIComponent(course.id)}/thumbnail?v=${encodeURIComponent(course.thumbnailAssetId)}`,
    );
  }

  private formatDurationShort(durationMinutes: number): string {
    if (durationMinutes < 60) {
      return `${durationMinutes} min`;
    }

    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  protected formatDurationLong(durationMinutes: number): string {
    if (durationMinutes <= 0) {
      return '0 min';
    }

    return this.formatDurationShort(durationMinutes);
  }

  private asSafeIcon(svg: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }
}
