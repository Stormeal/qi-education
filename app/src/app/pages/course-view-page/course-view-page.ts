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
import {
  lucideBanknote,
  lucideCheck,
  lucideCircle,
  lucideCircleCheck,
  lucideChevronDown,
  lucideChevronRight,
  lucideCircleHelp,
  lucideFileText,
  lucidePencil,
  lucideSlidersHorizontal,
  lucideVideo,
  lucideX,
} from '@ng-icons/lucide';
import '@mux/mux-player';
import {
  CourseComponent,
  CourseComponentAttachment,
  CourseCatalogMetadataDraft,
  CourseContentDocument,
  CourseListItem,
  FeedbackOption,
  QuizQuestion,
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
  styleUrls: ['./course-view-page.scss', './course-view-page-learning.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CourseViewPage {
  private readonly apiClient = inject(ApiClientService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly editCourseIcon = this.asSafeIcon(lucidePencil);
  protected readonly setPriceIcon = this.asSafeIcon(lucideBanknote);
  protected readonly catalogSettingsIcon = this.asSafeIcon(lucideSlidersHorizontal);
  protected readonly chevronDownIcon = this.asSafeIcon(lucideChevronDown);
  protected readonly chevronRightIcon = this.asSafeIcon(lucideChevronRight);
  protected readonly closeIcon = this.asSafeIcon(lucideX);
  protected readonly videoIcon = this.asSafeIcon(lucideVideo);
  protected readonly quizIcon = this.asSafeIcon(lucideCircleHelp);
  protected readonly textIcon = this.asSafeIcon(lucideFileText);
  protected readonly checkIcon = this.asSafeIcon(lucideCheck);
  protected readonly incompleteIcon = this.asSafeIcon(lucideCircle);
  protected readonly completedIcon = this.asSafeIcon(lucideCircleCheck);

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
  protected readonly activeComponentId = signal('');
  protected readonly completedComponentIds = signal<string[]>([]);
  protected readonly quizSelectedAnswerIds = signal<Record<string, string>>({});
  protected readonly submittedQuizQuestionIds = signal<string[]>([]);
  protected readonly quizSubmitted = signal(false);
  protected readonly activeQuizQuestionIndex = signal(0);
  protected readonly allSectionsExpanded = computed(() => {
    const content = this.courseContent();
    return !!content && content.sections.length > 0 && this.expandedSectionIds().length === content.sections.length;
  });
  protected readonly orderedComponents = computed(() =>
    this.courseContent()?.sections.flatMap((section) => section.components) ?? [],
  );
  protected readonly activeComponent = computed(() => {
    const components = this.orderedComponents();
    const activeId = this.activeComponentId();

    return components.find((component) => component.id === activeId) ?? components[0] ?? null;
  });
  protected readonly activeComponentIndex = computed(() => {
    const activeId = this.activeComponent()?.id;

    return activeId ? this.orderedComponents().findIndex((component) => component.id === activeId) : -1;
  });
  protected readonly activeQuizQuestions = computed(() => {
    const component = this.activeComponent();

    return component?.type === 'quiz' ? component.quiz.questions : [];
  });
  protected readonly activeQuizQuestion = computed(
    () => this.activeQuizQuestions()[this.activeQuizQuestionIndex()] ?? null,
  );
  protected readonly activeQuizQuestionNumber = computed(() =>
    this.activeQuizQuestions().length > 0 ? this.activeQuizQuestionIndex() + 1 : 0,
  );
  protected readonly activeQuizProgressPercent = computed(() => {
    const totalQuestions = this.activeQuizQuestions().length;

    return totalQuestions > 0
      ? Math.round((this.activeQuizQuestionNumber() / totalQuestions) * 100)
      : 0;
  });
  protected readonly isLastActiveQuizQuestion = computed(
    () => this.activeQuizQuestionIndex() >= this.activeQuizQuestions().length - 1,
  );
  protected readonly activeQuizScore = computed(() =>
    this.activeQuizQuestions().reduce((score, question) => {
      const selectedAnswer = question.answers.find(
        (answer) => answer.id === this.quizSelectedAnswerIds()[question.id],
      );

      return selectedAnswer?.isCorrect ? score + question.points : score;
    }, 0),
  );
  protected readonly activeQuizTotalPoints = computed(() =>
    this.activeQuizQuestions().reduce((total, question) => total + question.points, 0),
  );
  protected readonly activeQuizPassed = computed(() => {
    const component = this.activeComponent();

    return component?.type === 'quiz' && this.activeQuizScore() >= component.quiz.passPoints;
  });
  protected readonly canSubmitActiveQuiz = computed(
    () => this.activeQuizQuestions().length > 0,
  );

  readonly appVersion = input.required<string>();
  readonly currentYear = input.required<number>();
  readonly student = input.required<StudentSummary>();
  readonly authToken = input.required<string>();
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
  readonly careerPathClicked = output<void>();
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
        this.activeComponentId.set('');
        this.completedComponentIds.set([]);
        this.resetQuizAttempt();
        return;
      }

      this.expandedSectionIds.set([content.sections[0].id]);
      this.expandedComponentIds.set([]);
      this.completedComponentIds.set(this.loadCompletedComponentIds(content._id));
      this.activeComponentId.set(this.initialActiveComponentId(content));
      this.resetQuizAttempt();
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

  protected selectLearningComponent(componentId: string): void {
    if (this.activeComponentId() === componentId) {
      return;
    }

    this.activeComponentId.set(componentId);
    this.resetQuizAttempt();
  }

  protected completeActiveComponent(): void {
    const component = this.activeComponent();

    if (!component) {
      return;
    }

    this.markComponentCompleted(component.id);
    this.goToNextComponent();
  }

  protected isComponentCompleted(componentId: string): boolean {
    return this.completedComponentIds().includes(componentId);
  }

  protected isActiveComponent(componentId: string): boolean {
    return this.activeComponent()?.id === componentId;
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

  protected selectQuizAnswer(questionId: string, answerId: string): void {
    if (this.quizSubmitted() || this.isQuizQuestionSubmitted(questionId)) {
      return;
    }

    this.quizSelectedAnswerIds.update((selected) => ({
      ...selected,
      [questionId]: answerId,
    }));
  }

  protected selectedQuizAnswerId(questionId: string): string {
    return this.quizSelectedAnswerIds()[questionId] ?? '';
  }

  protected activeQuizQuestionAnswered(): boolean {
    const question = this.activeQuizQuestion();

    return question ? !!this.selectedQuizAnswerId(question.id) : false;
  }

  protected activeQuizQuestionSubmitted(): boolean {
    const question = this.activeQuizQuestion();

    return question ? this.isQuizQuestionSubmitted(question.id) : false;
  }

  protected submitActiveQuizAnswer(): void {
    const question = this.activeQuizQuestion();

    if (!question || !this.activeQuizQuestionAnswered() || this.activeQuizQuestionSubmitted()) {
      return;
    }

    this.submittedQuizQuestionIds.update((submitted) => [...submitted, question.id]);
  }

  protected goToNextQuizQuestion(): void {
    if (this.quizSubmitted()) {
      return;
    }

    if (this.isLastActiveQuizQuestion()) {
      this.finishActiveQuiz();
      return;
    }

    this.activeQuizQuestionIndex.update((index) => index + 1);
  }

  protected skipActiveQuizQuestion(): void {
    if (this.quizSubmitted()) {
      return;
    }

    this.goToNextQuizQuestion();
  }

  protected finishActiveQuiz(): void {
    if (!this.canSubmitActiveQuiz()) {
      return;
    }

    this.quizSubmitted.set(true);

    if (this.activeQuizPassed()) {
      this.completeActiveComponent();
    }
  }

  protected retryActiveQuiz(): void {
    this.resetQuizAttempt();
  }

  protected answerState(question: QuizQuestion, answerId: string): 'correct' | 'incorrect' | '' {
    if (!this.isQuizQuestionSubmitted(question.id) || this.selectedQuizAnswerId(question.id) !== answerId) {
      return '';
    }

    const answer = question.answers.find((item) => item.id === answerId);

    return answer?.isCorrect ? 'correct' : 'incorrect';
  }

  protected shouldShowAnswerDescription(question: QuizQuestion, answerId: string): boolean {
    return (
      this.isQuizQuestionSubmitted(question.id) &&
      this.selectedQuizAnswerId(question.id) === answerId &&
      !!question.answers.find((answer) => answer.id === answerId)?.description
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

    return `${content.sections.length} sections - ${this.totalLessonCount()} components - ${this.formatDurationLong(this.totalContentDurationMinutes())} total length`;
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

  protected componentTypeLabel(type: string): string {
    switch (type) {
      case 'video':
        return 'Video';
      case 'quiz':
        return 'Quiz';
      case 'resources':
        return 'Resources';
      default:
        return 'Text';
    }
  }

  protected componentIcon(type: string): SafeHtml {
    switch (type) {
      case 'video':
        return this.videoIcon;
      case 'quiz':
        return this.quizIcon;
      case 'resources':
        return this.textIcon;
      default:
        return this.textIcon;
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

    return !!component.content.trim() || !!component.resourceUrl.trim() || component.attachments.length > 0;
  }

  protected componentPreviewText(component: CourseContentDocument['sections'][number]['components'][number]): string {
    if (component.type === 'quiz') {
      return component.quiz.questions[0]?.question.trim() || 'Quiz question coming soon.';
    }

    return component.content.trim() || 'No preview text available yet.';
  }

  protected renderMarkdown(markdown: string): string {
    if (this.looksLikeHtml(markdown)) {
      return markdown;
    }

    const lines = markdown.split(/\r?\n/);
    const html: string[] = [];
    let listItems: string[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        html.push(`<ul>${listItems.join('')}</ul>`);
        listItems = [];
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        flushList();
        continue;
      }

      const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        flushList();
        const level = heading[1].length;
        html.push(`<h${level}>${this.renderInlineMarkdown(heading[2])}</h${level}>`);
        continue;
      }

      const listItem = trimmed.match(/^[-*]\s+(.+)$/);
      if (listItem) {
        listItems.push(`<li>${this.renderInlineMarkdown(listItem[1])}</li>`);
        continue;
      }

      flushList();
      html.push(`<p>${this.renderInlineMarkdown(trimmed)}</p>`);
    }

    flushList();
    return html.join('');
  }

  protected async downloadAttachment(courseId: string, attachment: CourseComponentAttachment): Promise<void> {
    if (!this.authToken()) {
      return;
    }

    const response = await this.apiClient.fetch(
      `/courses/${encodeURIComponent(courseId)}/content/attachments/${encodeURIComponent(attachment.assetId)}`,
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${this.authToken()}`,
        },
      },
    );

    if (!response.ok) {
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected formatFileSize(sizeBytes: number): string {
    if (sizeBytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
    }

    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
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

  private renderInlineMarkdown(value: string): string {
    return this.escapeHtml(value)
      .replace(/\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
      .replace(/\+\+(.+?)\+\+/g, '<u>$1</u>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }

  private looksLikeHtml(content: string): boolean {
    return /<\/?[a-z][\s\S]*>/i.test(content);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

  private markComponentCompleted(componentId: string): void {
    if (this.isComponentCompleted(componentId)) {
      return;
    }

    const completed = [...this.completedComponentIds(), componentId];
    this.completedComponentIds.set(completed);
    this.storeCompletedComponentIds(completed);
  }

  private goToNextComponent(): void {
    const components = this.orderedComponents();
    const currentIndex = this.activeComponentIndex();
    const nextComponent = currentIndex >= 0 ? components[currentIndex + 1] : null;

    if (!nextComponent) {
      return;
    }

    this.activeComponentId.set(nextComponent.id);
    this.resetQuizAttempt();
  }

  private resetQuizAttempt(): void {
    this.quizSelectedAnswerIds.set({});
    this.submittedQuizQuestionIds.set([]);
    this.quizSubmitted.set(false);
    this.activeQuizQuestionIndex.set(0);
  }

  private isQuizQuestionSubmitted(questionId: string): boolean {
    return this.submittedQuizQuestionIds().includes(questionId);
  }

  private initialActiveComponentId(content: CourseContentDocument): string {
    const components = content.sections.flatMap((section) => section.components);
    const completed = this.loadCompletedComponentIds(content._id);

    return components.find((component) => !completed.includes(component.id))?.id ?? components[0]?.id ?? '';
  }

  private completedStorageKey(): string {
    const userId = this.userEmail() || 'anonymous';
    const courseId = this.courseContent()?._id ?? this.course()?.id ?? 'course';

    return `qi-education:course-progress:${userId}:${courseId}`;
  }

  private loadCompletedComponentIds(courseId: string): string[] {
    try {
      const userId = this.userEmail() || 'anonymous';
      const rawValue = window.localStorage.getItem(`qi-education:course-progress:${userId}:${courseId}`);
      const parsedValue: unknown = rawValue ? JSON.parse(rawValue) : [];

      return Array.isArray(parsedValue)
        ? parsedValue.filter((value): value is string => typeof value === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private storeCompletedComponentIds(completed: string[]): void {
    try {
      window.localStorage.setItem(this.completedStorageKey(), JSON.stringify(completed));
    } catch {
      return;
    }
  }
}
