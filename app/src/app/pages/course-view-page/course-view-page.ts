import { OrganizationPriceField } from '../../ui/organization-price-field/organization-price-field';
import { DatePipe, DOCUMENT } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { plural } from '../../utils/plural';
import { formatDuration, formatFileSize, lessonTypeLabel, renderLessonMarkdown } from '../../utils/lesson-content';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  lucideBanknote,
  lucideChevronDown,
  lucideChevronRight,
  lucideCircleHelp,
  lucideFileText,
  lucidePackage,
  lucidePencil,
  lucideSlidersHorizontal,
  lucideVideo,
  lucideWrench,
  lucideX,
} from '@ng-icons/lucide';
import {
  COURSE_CATEGORIES,
  COURSE_LANGUAGES,
  CourseCategory,
  CourseComponentAttachment,
  CourseComponentType,
  CourseCatalogMetadataDraft,
  CourseContentDocument,
  CourseLanguage,
  CourseListItem,
  CoursePurchaseStatus,
  FeedbackOption,
  StudentSummary,
} from '../../app.models';
import { CourseService } from '../../services/course.service';
import { InstructorProfileService } from '../../services/instructor-profile.service';
import { Button } from '../../ui/button/button';
import { IconButton } from '../../ui/icon-button/icon-button';
import { LoadingSkeleton } from '../../ui/loading-skeleton/loading-skeleton';
import { PageHeader } from '../../ui/page-header/page-header';

@Component({
  selector: 'app-course-view-page',
  imports: [OrganizationPriceField, Button, DatePipe, IconButton, LoadingSkeleton, PageHeader],
  templateUrl: './course-view-page.html',
  styleUrls: ['./course-view-page.scss', './course-view-page-learning.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseViewPage {
  private readonly courseService = inject(CourseService);
  private readonly instructorProfiles = inject(InstructorProfileService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly document = inject(DOCUMENT);

  protected readonly editCourseIcon = this.asSafeIcon(lucidePencil);
  protected readonly setPriceIcon = this.asSafeIcon(lucideBanknote);
  protected readonly catalogSettingsIcon = this.asSafeIcon(lucideSlidersHorizontal);
  protected readonly chevronDownIcon = this.asSafeIcon(lucideChevronDown);
  protected readonly chevronRightIcon = this.asSafeIcon(lucideChevronRight);
  protected readonly closeIcon = this.asSafeIcon(lucideX);
  protected readonly videoIcon = this.asSafeIcon(lucideVideo);
  protected readonly quizIcon = this.asSafeIcon(lucideCircleHelp);
  protected readonly textIcon = this.asSafeIcon(lucideFileText);
  protected readonly resourcesIcon = this.asSafeIcon(lucidePackage);
  protected readonly exerciseIcon = this.asSafeIcon(lucideWrench);
  protected readonly formatFileSize = formatFileSize;

  protected readonly priceDraft = signal('');
  protected readonly priceDraftError = signal('');
  protected readonly isPriceModalOpen = signal(false);
  protected readonly pendingPriceSave = signal(false);
  protected readonly isCatalogModalOpen = signal(false);
  protected readonly pendingCatalogSave = signal(false);
  protected readonly catalogPremiumDraft = signal(false);
  protected readonly catalogBestsellerDraft = signal(false);
  protected readonly catalogRatingDraft = signal('0');
  protected readonly catalogRatingCountDraft = signal('0');
  protected readonly catalogCategoryDraft = signal<CourseCategory>('Uncategorized');
  protected readonly catalogLanguagesDraft = signal<CourseLanguage[]>([]);
  protected readonly catalogCategoryOptions = COURSE_CATEGORIES;
  protected readonly catalogLanguageOptions = COURSE_LANGUAGES;
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
  readonly authToken = input.required<string>();
  /** US-O001: courses the user's organization opens for free. */
  readonly organizationAccess = input<{ name: string; openCourseIds: string[] } | null>(null);
  protected readonly includedBy = computed(() => {
    const access = this.organizationAccess();
    const id = this.course()?.id;
    return access && id && access.openCourseIds.includes(id) ? access.name : null;
  });
  readonly userEmail = input.required<string>();
  readonly userRoleLabel = input.required<string>();
  readonly canAccessAdmin = input.required<boolean>();
  readonly canEditCourse = input.required<boolean>();
  readonly course = input.required<CourseListItem | null>();
  protected readonly instructorDescription = computed(() => this.instructorProfiles.descriptionFor([this.course()?.id ?? '']));
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
  readonly isEnrolled = input.required<boolean>();
  readonly enrollmentSubmitting = input.required<boolean>();
  readonly enrollmentError = input.required<string>();
  readonly purchaseStatus = input<CoursePurchaseStatus>('idle');
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
  readonly courseEdited = output<string>();
  readonly courseLearningOpened = output<string>();
  readonly coursePriceSaved = output<{ courseId: string; priceDkk: number | null }>();
  readonly courseCatalogSaved = output<{ courseId: string; metadata: CourseCatalogMetadataDraft }>();
  readonly courseEnrollmentConfirmed = output<string>();
  readonly coursePurchaseStarted = output<string>();
  readonly feedbackClosed = output<void>();
  readonly feedbackRatingSelected = output<string>();
  readonly feedbackTextChanged = output<string>();
  readonly feedbackSubmittedClicked = output<void>();

  constructor() {
    void this.instructorProfiles.loadPublic();
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
    this.priceDraftError.set('');
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
    this.catalogCategoryDraft.set(course.category ?? 'Uncategorized');
    this.catalogLanguagesDraft.set([...(course.languages ?? [])]);
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
    this.priceDraftError.set('');
    this.priceDraft.set(value);
  }

  protected applyPriceDraft(courseId: string): void {
    const value = this.priceDraft().trim();
    const amount = Number(value);
    // An invalid amount used to be saved silently as free. Stripe cannot charge below 2.50 DKK.
    if (value && (!/^\d+$/.test(value) || (amount !== 0 && (amount < 3 || amount > 999_999)))) {
      this.priceDraftError.set('Enter 0 for free, or a whole number of DKK from 3 to 999,999.');
      return;
    }

    this.priceDraftError.set('');
    this.pendingPriceSave.set(true);
    this.coursePriceSaved.emit({ courseId, priceDkk: value ? Number.parseInt(value, 10) : null });
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

  protected updateCatalogCategory(value: string): void {
    const parsed = COURSE_CATEGORIES.find((category) => category === value);
    this.catalogCategoryDraft.set(parsed ?? 'Uncategorized');
  }

  protected isCatalogLanguageSelected(language: CourseLanguage): boolean {
    return this.catalogLanguagesDraft().includes(language);
  }

  protected toggleCatalogLanguage(language: CourseLanguage, selected: boolean): void {
    this.catalogLanguagesDraft.update((languages) => {
      if (selected) {
        return languages.includes(language) ? languages : [...languages, language];
      }

      return languages.filter((entry) => entry !== language);
    });
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
        category: this.catalogCategoryDraft(),
        languages: [...this.catalogLanguagesDraft()],
      },
    });
  }

  protected openEnrollDialog(): void {
    if (this.course()?.status !== 'published') return;
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
    if (this.enrollmentSubmitting() || this.course()?.status !== 'published') {
      return;
    }

    this.pendingEnrollment.set(true);
    this.courseEnrollmentConfirmed.emit(courseId);
  }

  protected controlValue(event: Event): string {
    const control = event.target;

    return control instanceof HTMLInputElement || control instanceof HTMLSelectElement
      ? control.value
      : '';
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





















  protected contentSummary(): string {
    if (this.courseContentLoading()) {
      return 'Loading content...';
    }

    const content = this.courseContent();

    if (!content || content.sections.length === 0) {
      return 'No course content';
    }

    return `${plural(content.sections.length, 'section')} - ${plural(this.totalLessonCount(), 'component')} - ${this.formatDurationLong(this.totalContentDurationMinutes())} total length`;
  }

  protected emptyCourseContentMessage(): string {
    return "This course doesn't have any course content yet.";
  }

  protected hasRealCurriculum(): boolean {
    return (this.courseContent()?.sections.length ?? 0) > 0;
  }

  protected sectionLectureMeta(componentCount: number, durationMinutes: number): string {
    const label = componentCount === 1 ? 'component' : 'components';
    return `${componentCount} ${label} - ${this.formatDurationLong(durationMinutes)}`;
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

  protected componentTypeLabel(type: CourseComponentType): string {
    return lessonTypeLabel(type);
  }

  protected componentIcon(type: CourseComponentType): SafeHtml {
    switch (type) {
      case 'video':
        return this.videoIcon;
      case 'quiz':
        return this.quizIcon;
      case 'resources':
        return this.resourcesIcon;
      case 'exercise':
        return this.exerciseIcon;
      default:
        return this.textIcon;
    }
  }

  protected componentDurationLabel(durationMinutes: number): string {
    return durationMinutes > 0 ? formatDuration(durationMinutes) : 'No duration';
  }

  protected componentHasDetails(component: CourseContentDocument['sections'][number]['components'][number]): boolean {
    if (component.type === 'quiz') {
      return (
        component.quiz.questions.some(
          (question) =>
            !!question.question.trim() ||
          question.answers.some((answer) => answer.text.trim() || answer.description?.trim()),
        )
      );
    }

    return !!component.content.trim() || !!component.resourceUrl.trim() || component.attachments.length > 0;
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

  protected isPriced(priceDkk: number | null): boolean {
    return (priceDkk ?? 0) > 0;
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
    return this.courseService.thumbnailUrl(course);
  }





  protected formatDurationLong(durationMinutes: number): string {
    return formatDuration(durationMinutes);
  }

  protected renderMarkdown(markdown: string): string {
    return renderLessonMarkdown(this.document, markdown);
  }

  protected downloadAttachment(courseId: string, attachment: CourseComponentAttachment): void {
    void this.courseService.downloadAttachment(courseId, attachment, this.authToken());
  }

  private asSafeIcon(svg: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }






}
