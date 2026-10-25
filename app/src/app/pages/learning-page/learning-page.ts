import { PROGRESS_SYNC_NOTICE } from '../progress-sync-notice';
import { DOCUMENT, DatePipe } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  lucideCheck,
  lucideChevronDown,
  lucideChevronLeft,
  lucideChevronRight,
  lucideCircleHelp,
  lucideDownload,
  lucideExternalLink,
  lucideFileText,
  lucideFlag,
  lucidePackage,
  lucidePanelRight,
  lucidePencilLine,
  lucideThumbsDown,
  lucideThumbsUp,
  lucideVideo,
  lucideWrench,
} from '@ng-icons/lucide';
import '@mux/mux-player';
import {
  CourseComponent,
  CourseComponentAttachment,
  CourseComponentType,
  CourseContentDocument,
  CourseListItem,
  FeedbackOption,
  QuizAssessmentResult,
  QuizQuestion,
  StudentSummary,
  canHoldVideo,
} from '../../app.models';
import { CourseService } from '../../services/course.service';
import { LearningProgressService } from '../../services/learning-progress.service';
import { LessonExtrasService, LessonNote } from '../../services/lesson-extras.service';
import { Button } from '../../ui/button/button';
import { Chip } from '../../ui/chip/chip';
import { IconButton } from '../../ui/icon-button/icon-button';
import { LoadingSkeleton } from '../../ui/loading-skeleton/loading-skeleton';
import { PageHeader } from '../../ui/page-header/page-header';
import { ProgressBar } from '../../ui/progress-bar/progress-bar';
import { TabItem, Tabs, tabId, tabPanelId } from '../../ui/tabs/tabs';
import {
  formatDuration,
  formatFileSize,
  formatVideoTime,
  lessonTypeLabel,
  renderLessonMarkdown,
} from '../../utils/lesson-content';

type LessonTab = 'overview' | 'notes' | 'files';
type ProblemCategory = 'video' | 'content-error' | 'unclear' | 'files' | 'other';
type MuxPlayerElement = HTMLElement & { currentTime: number; duration: number };

const UP_NEXT_SECONDS = 5;
const VIDEO_COMPLETE_SHARE = 0.9;

@Component({
  selector: 'app-learning-page',
  imports: [Button, Chip, DatePipe, IconButton, LoadingSkeleton, PageHeader, ProgressBar, Tabs],
  templateUrl: './learning-page.html',
  styleUrl: './learning-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { '(document:keydown.escape)': 'stayHere()' },
})
export class LearningPage {
  private readonly courseService = inject(CourseService);
  private readonly learningProgress = inject(LearningProgressService);
  private readonly lessonExtras = inject(LessonExtrasService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly appVersion = input.required<string>();
  readonly currentYear = input.required<number>();
  readonly student = input.required<StudentSummary>();
  readonly authToken = input.required<string>();
  readonly userEmail = input.required<string>();
  readonly userRoleLabel = input.required<string>();
  readonly canAccessAdmin = input.required<boolean>();
  readonly canEditCourse = input.required<boolean>();
  readonly course = input.required<CourseListItem | null>();
  readonly coursesLoading = input.required<boolean>();
  readonly coursesError = input.required<string>();
  readonly courseContent = input.required<CourseContentDocument | null>();
  readonly courseContentLoading = input.required<boolean>();
  readonly courseContentError = input.required<string>();
  readonly isEnrolled = input.required<boolean>();
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
  readonly courseDetailsClicked = output<string>();
  readonly feedbackClosed = output<void>();
  readonly feedbackRatingSelected = output<string>();
  readonly feedbackTextChanged = output<string>();
  readonly feedbackSubmittedClicked = output<void>();

  protected readonly icons = {
    check: this.icon(lucideCheck),
    chevronDown: this.icon(lucideChevronDown),
    chevronRight: this.icon(lucideChevronRight),
    previous: this.icon(lucideChevronLeft),
    next: this.icon(lucideChevronRight),
    download: this.icon(lucideDownload),
    link: this.icon(lucideExternalLink),
    flag: this.icon(lucideFlag),
    note: this.icon(lucidePencilLine),
    panel: this.icon(lucidePanelRight),
    up: this.icon(lucideThumbsUp),
    down: this.icon(lucideThumbsDown),
  };
  private readonly typeIcons: Record<CourseComponentType, SafeHtml> = {
    video: this.icon(lucideVideo),
    quiz: this.icon(lucideCircleHelp),
    text: this.icon(lucideFileText),
    resources: this.icon(lucidePackage),
    exercise: this.icon(lucideWrench),
  };
  protected readonly problemCategories: { value: ProblemCategory; label: string }[] = [
    { value: 'video', label: 'Video does not play' },
    { value: 'content-error', label: 'Mistake in the content' },
    { value: 'unclear', label: 'Hard to understand' },
    { value: 'files', label: 'Files or links' },
    { value: 'other', label: 'Other' },
  ];
  protected readonly tabId = tabId;
  protected readonly tabPanelId = tabPanelId;
  protected readonly formatDuration = formatDuration;
  protected readonly formatFileSize = formatFileSize;
  protected readonly formatVideoTime = formatVideoTime;
  protected readonly lessonTypeLabel = lessonTypeLabel;
  protected readonly quizImageUrls = this.courseService.quizImageUrls;

  private readonly player = viewChild<ElementRef<MuxPlayerElement>>('player');
  private readonly noteInput = viewChild<ElementRef<HTMLTextAreaElement>>('noteInput');

  // Lesson position and progress
  protected readonly activeComponentId = signal('');
  protected readonly expandedSectionIds = signal<string[]>([]);
  protected readonly sidebarHidden = signal(false);
  protected readonly activeTab = signal<LessonTab>('overview');
  protected readonly orderedComponents = computed(() => this.courseContent()?.sections.flatMap((section) => section.components) ?? []);
  protected readonly activeComponent = computed(() => {
    const components = this.orderedComponents();
    return components.find((component) => component.id === this.activeComponentId()) ?? components[0] ?? null;
  });
  protected readonly activeIndex = computed(() => {
    const active = this.activeComponent();
    return active ? this.orderedComponents().indexOf(active) : -1;
  });
  protected readonly previousComponent = computed(() => this.orderedComponents()[this.activeIndex() - 1] ?? null);
  protected readonly nextComponent = computed(() => {
    const index = this.activeIndex();
    return index >= 0 ? this.orderedComponents()[index + 1] ?? null : null;
  });
  protected readonly activeSection = computed(() =>
    this.courseContent()?.sections.find((section) => section.components.some((component) => component.id === this.activeComponent()?.id)) ?? null);
  protected readonly completedIds = computed(() => this.learningProgress.completedIds(this.userEmail(), this.courseContent()?._id ?? ''));
  protected readonly courseProgress = computed(() => {
    const content = this.courseContent();
    return content ? this.learningProgress.forContent(this.userEmail(), content) : null;
  });
  protected readonly minutesLeft = computed(() => {
    const completed = this.completedIds();
    return this.orderedComponents().filter((component) => !completed.includes(component.id))
      .reduce((total, component) => total + component.durationMinutes, 0);
  });
  protected readonly totalMinutes = computed(() => this.orderedComponents().reduce((total, component) => total + component.durationMinutes, 0));
  protected readonly progressSyncNotice = computed(() => this.learningProgress.accountSyncState() === 'pending' ? PROGRESS_SYNC_NOTICE : '');
  protected readonly captionLanguages = computed(() => [...new Set(this.orderedComponents().flatMap((component) =>
    canHoldVideo(component) ? (component.mux?.captions ?? []).filter((caption) => caption.status === 'ready')
      .map((caption) => caption.name || caption.languageCode) : []))]);
  protected readonly updatedAt = computed(() => this.courseContent()?.updatedAt || this.course()?.createdAt || '');

  // Video
  protected readonly videoSeconds = signal(0);

  // Up next
  protected readonly upNextSeconds = signal<number | null>(null);
  private upNextTimer: ReturnType<typeof setInterval> | undefined;

  // Notes
  protected readonly notes = signal<LessonNote[]>([]);
  protected readonly notesError = signal('');
  protected readonly noteDraft = signal('');
  protected readonly noteDraftSeconds = signal<number | null>(null);
  protected readonly noteSaving = signal(false);
  protected readonly editingNoteId = signal('');
  protected readonly editingNoteText = signal('');
  protected readonly sortedNotes = computed(() => {
    const activeId = this.activeComponent()?.id;
    const order = this.orderedComponents().map((component) => component.id);
    return [...this.notes()].sort((a, b) =>
      Number(b.componentId === activeId) - Number(a.componentId === activeId) ||
      order.indexOf(a.componentId) - order.indexOf(b.componentId) ||
      (a.videoSeconds ?? 0) - (b.videoSeconds ?? 0) ||
      a.createdAt.localeCompare(b.createdAt));
  });

  // Lesson feedback
  protected readonly ratedComponentIds = signal<string[]>([]);
  protected readonly ratingError = signal('');
  protected readonly isProblemFormOpen = signal(false);
  protected readonly problemCategory = signal<ProblemCategory | ''>('');
  protected readonly problemMessage = signal('');
  protected readonly problemSending = signal(false);
  protected readonly problemError = signal('');
  protected readonly problemSentComponentId = signal('');

  // Course facts
  protected readonly enrolledLearners = signal<number | null>(null);

  // Quiz attempt
  protected readonly quizSelectedAnswerIds = signal<Record<string, string[]>>({});
  protected readonly submittedQuizQuestionIds = signal<string[]>([]);
  protected readonly quizSubmitted = signal(false);
  protected readonly quizScoring = signal(false);
  protected readonly quizError = signal('');
  private readonly quizResult = signal<QuizAssessmentResult | null>(null);
  private quizAttemptGeneration = 0;
  protected readonly activeQuizQuestionIndex = signal(0);
  protected readonly activeQuizQuestions = computed(() => {
    const component = this.activeComponent();
    return component?.type === 'quiz' ? component.quiz.questions : [];
  });
  protected readonly activeQuizQuestion = computed(() => this.activeQuizQuestions()[this.activeQuizQuestionIndex()] ?? null);
  protected readonly activeQuizQuestionNumber = computed(() => this.activeQuizQuestions().length > 0 ? this.activeQuizQuestionIndex() + 1 : 0);
  protected readonly activeQuizPositionPercent = computed(() => {
    const total = this.activeQuizQuestions().length;
    return total > 0 ? Math.round((this.activeQuizQuestionNumber() / total) * 100) : 0;
  });
  protected readonly isLastActiveQuizQuestion = computed(() => this.activeQuizQuestionIndex() >= this.activeQuizQuestions().length - 1);
  protected readonly activeQuizScore = computed(() => this.quizResult()?.score ?? 0);
  // Every question counts 1.
  protected readonly activeQuizTotalPoints = computed(() => this.activeQuizQuestions().length);
  protected readonly activeQuizPassed = computed(() => this.quizResult()?.passed ?? false);

  protected readonly lessonTabs = computed((): TabItem[] => [
    { id: 'overview', label: 'Overview' },
    { id: 'notes', label: 'Notes', count: this.notes().length },
    { id: 'files', label: 'Lesson files', count: this.activeComponent()?.attachments.length ?? 0 },
  ]);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopUpNextTimer());
    effect(() => this.courseService.loadQuizImages(this.courseContent(), this.authToken()));
    effect(() => {
      const content = this.courseContent();
      this.cancelUpNext();
      if (!content || content.sections.length === 0) {
        this.expandedSectionIds.set([]);
        this.activeComponentId.set('');
        this.resetQuizAttempt();
        return;
      }
      const startId = untracked(() => this.initialActiveComponentId(content));
      this.activeComponentId.set(startId);
      const startSection = content.sections.find((section) => section.components.some((component) => component.id === startId));
      this.expandedSectionIds.set([startSection?.id ?? content.sections[0].id]);
      this.resetQuizAttempt();
    });
    // Notes and the learner count are extras: the lesson stays usable when they fail.
    effect(() => {
      const courseId = this.courseContent()?._id ?? '';
      const token = this.authToken();
      untracked(() => {
        this.notes.set([]);
        this.notesError.set('');
        this.enrolledLearners.set(null);
      });
      if (!courseId || !token) return;
      this.lessonExtras.listNotes(courseId, token).then(
        (notes) => { if (this.courseContent()?._id === courseId) this.notes.set(notes); },
        (error: unknown) => { if (this.courseContent()?._id === courseId) this.notesError.set(this.message(error, 'Your notes could not be loaded.')); },
      );
      this.lessonExtras.enrolledLearners(courseId, token).then(
        (count) => { if (this.courseContent()?._id === courseId) this.enrolledLearners.set(count); },
        () => undefined,
      );
    });
  }

  // Navigation

  protected selectLesson(componentId: string): void {
    this.cancelUpNext();
    if (this.activeComponent()?.id === componentId) return;
    this.activeComponentId.set(componentId);
    this.videoSeconds.set(0);
    this.isProblemFormOpen.set(false);
    this.problemError.set('');
    this.ratingError.set('');
    this.resetQuizAttempt();
    const section = this.courseContent()?.sections.find((item) => item.components.some((component) => component.id === componentId));
    if (section && !this.expandedSectionIds().includes(section.id)) this.expandedSectionIds.update((ids) => [...ids, section.id]);
  }

  protected goToPrevious(): void {
    const previous = this.previousComponent();
    if (previous) this.selectLesson(previous.id);
    this.keepFocus('#lesson-title');
  }

  protected goToNext(): void {
    const next = this.nextComponent();
    if (next) this.selectLesson(next.id);
    this.keepFocus('#lesson-title');
  }

  protected toggleSection(sectionId: string): void {
    this.expandedSectionIds.update((ids) => ids.includes(sectionId) ? ids.filter((id) => id !== sectionId) : [...ids, sectionId]);
  }

  protected isSectionExpanded(sectionId: string): boolean {
    return this.expandedSectionIds().includes(sectionId);
  }

  protected isCompleted(componentId: string): boolean {
    return this.completedIds().includes(componentId);
  }

  protected sectionCompletedCount(section: CourseContentDocument['sections'][number]): number {
    const completed = this.completedIds();
    return section.components.filter((component) => completed.includes(component.id)).length;
  }

  protected sectionMinutes(section: CourseContentDocument['sections'][number]): number {
    return section.components.reduce((total, component) => total + component.durationMinutes, 0);
  }

  /** Stroke length of a section's progress ring (radius 9). */
  protected ringDash(section: CourseContentDocument['sections'][number]): string {
    const circumference = 2 * Math.PI * 9;
    const share = section.components.length ? this.sectionCompletedCount(section) / section.components.length : 0;
    return `${(share * circumference).toFixed(1)} ${circumference.toFixed(1)}`;
  }

  protected lessonPosition(): string {
    const section = this.activeSection();
    const component = this.activeComponent();
    const content = this.courseContent();
    if (!section || !component || !content) return '';
    const sectionNumber = content.sections.indexOf(section) + 1;
    return `Section ${sectionNumber}, ${section.title}. Lesson ${section.components.indexOf(component) + 1} of ${section.components.length}`;
  }

  protected typeIcon(type: CourseComponentType): SafeHtml {
    return this.typeIcons[type];
  }

  protected lessonMeta(component: CourseComponent): string {
    const length = component.type === 'quiz'
      ? `${component.quiz.questions.length} ${component.quiz.questions.length === 1 ? 'question' : 'questions'}`
      : component.durationMinutes > 0 ? formatDuration(component.durationMinutes) : '';
    return length ? `${lessonTypeLabel(component.type)}, ${length}` : lessonTypeLabel(component.type);
  }

  // Completion and up next

  protected completeActiveLesson(): void {
    const component = this.activeComponent();
    if (!component) return;
    this.markCompleted(component.id);
    this.startUpNext();
    this.keepFocus(this.upNextSeconds() !== null ? '.up-next-start' : '#lesson-title');
  }

  protected videoTimeUpdated(): void {
    const player = this.player()?.nativeElement;
    const component = this.activeComponent();
    if (!player || !component) return;
    this.videoSeconds.set(player.currentTime || 0);
    if (player.duration > 0 && player.currentTime / player.duration >= VIDEO_COMPLETE_SHARE) this.markCompleted(component.id);
  }

  protected videoEnded(): void {
    const component = this.activeComponent();
    if (!component) return;
    this.markCompleted(component.id);
    this.startUpNext();
  }

  // The intro video does not complete the exercise; it hands over to the description.
  protected exerciseIntroEnded(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.exercise-description')?.focus();
  }

  protected startNextNow(): void {
    this.cancelUpNext();
    this.goToNext();
  }

  /** "Stay here" or Escape while the up-next panel shows. */
  protected stayHere(): void {
    if (this.upNextSeconds() === null) return;
    this.cancelUpNext();
    this.keepFocus('#lesson-title');
  }

  protected cancelUpNext(): void {
    this.stopUpNextTimer();
    this.upNextSeconds.set(null);
  }

  /** Stroke length of the up-next countdown ring (radius 20). */
  protected countdownDash(): string {
    const circumference = 2 * Math.PI * 20;
    const share = (this.upNextSeconds() ?? 0) / UP_NEXT_SECONDS;
    return `${(share * circumference).toFixed(1)} ${circumference.toFixed(1)}`;
  }

  private startUpNext(): void {
    if (!this.nextComponent()) return;
    this.stopUpNextTimer();
    this.upNextSeconds.set(UP_NEXT_SECONDS);
    this.upNextTimer = setInterval(() => {
      const left = (this.upNextSeconds() ?? 0) - 1;
      if (left > 0) {
        this.upNextSeconds.set(left);
        return;
      }
      this.startNextNow();
    }, 1000);
  }

  private stopUpNextTimer(): void {
    if (this.upNextTimer !== undefined) clearInterval(this.upNextTimer);
    this.upNextTimer = undefined;
  }

  private markCompleted(componentId: string): void {
    const content = this.courseContent();
    if (content && !this.isCompleted(componentId)) this.learningProgress.complete(this.userEmail(), content, componentId);
  }

  // Notes

  protected startNote(): void {
    const component = this.activeComponent();
    const player = this.player()?.nativeElement;
    this.noteDraftSeconds.set(component?.type === 'video' && player ? Math.floor(player.currentTime || 0) : null);
    this.activeTab.set('notes');
    setTimeout(() => this.noteInput()?.nativeElement.focus());
  }

  protected async saveNote(): Promise<void> {
    const component = this.activeComponent();
    const content = this.courseContent();
    const text = this.noteDraft().trim();
    if (!component || !content || !text || this.noteSaving()) return;
    this.noteSaving.set(true);
    this.notesError.set('');
    try {
      const videoSeconds = component.type === 'video' ? this.noteDraftSeconds() : null;
      const note = await this.lessonExtras.addNote(content._id, { componentId: component.id, text, videoSeconds }, this.authToken());
      this.notes.update((notes) => [...notes, note]);
      this.noteDraft.set('');
      this.noteDraftSeconds.set(null);
      this.keepFocus('#note-input');
    } catch (error) {
      this.notesError.set(this.message(error, 'Your note could not be saved. Please try again.'));
    } finally {
      this.noteSaving.set(false);
    }
  }

  protected editNote(note: LessonNote): void {
    this.editingNoteId.set(note.id);
    this.editingNoteText.set(note.text);
  }

  protected cancelNoteEdit(): void {
    this.keepFocus(`#note-${this.editingNoteId()}`);
    this.editingNoteId.set('');
  }

  protected async saveNoteEdit(note: LessonNote): Promise<void> {
    const text = this.editingNoteText().trim();
    const courseId = this.courseContent()?._id;
    if (!text || !courseId || this.noteSaving()) return;
    this.noteSaving.set(true);
    this.notesError.set('');
    try {
      const saved = await this.lessonExtras.updateNote(courseId, note.id, text, this.authToken());
      this.notes.update((notes) => notes.map((item) => item.id === saved.id ? saved : item));
      this.editingNoteId.set('');
      this.keepFocus(`#note-${saved.id}`);
    } catch (error) {
      this.notesError.set(this.message(error, 'Your note could not be changed. Please try again.'));
    } finally {
      this.noteSaving.set(false);
    }
  }

  protected async deleteNote(note: LessonNote): Promise<void> {
    const courseId = this.courseContent()?._id;
    if (!courseId || this.noteSaving()) return;
    this.noteSaving.set(true);
    this.notesError.set('');
    try {
      await this.lessonExtras.deleteNote(courseId, note.id, this.authToken());
      this.notes.update((notes) => notes.filter((item) => item.id !== note.id));
      this.keepFocus('#note-input');
    } catch (error) {
      this.notesError.set(this.message(error, 'Your note could not be deleted. Please try again.'));
    } finally {
      this.noteSaving.set(false);
    }
  }

  /** A note's time moves the video when it belongs to the open lesson; otherwise its lesson opens. */
  protected openNote(note: LessonNote): void {
    if (note.componentId !== this.activeComponent()?.id) {
      this.selectLesson(note.componentId);
      return;
    }
    const player = this.player()?.nativeElement;
    if (player && note.videoSeconds !== null) player.currentTime = note.videoSeconds;
  }

  protected noteLessonTitle(note: LessonNote): string {
    return this.orderedComponents().find((component) => component.id === note.componentId)?.title ?? 'A removed lesson';
  }

  protected isNoteOnActiveLesson(note: LessonNote): boolean {
    return note.componentId === this.activeComponent()?.id;
  }

  // Lesson feedback

  protected isRated(componentId: string): boolean {
    return this.ratedComponentIds().includes(componentId);
  }

  protected async rateLesson(kind: 'helpful' | 'not-helpful'): Promise<void> {
    const component = this.activeComponent();
    const courseId = this.courseContent()?._id;
    if (!component || !courseId || this.isRated(component.id)) return;
    this.ratedComponentIds.update((ids) => [...ids, component.id]);
    this.ratingError.set('');
    this.keepFocus('#rating-thanks');
    try {
      await this.lessonExtras.sendLessonFeedback(courseId, { componentId: component.id, kind }, this.authToken());
    } catch (error) {
      this.ratedComponentIds.update((ids) => ids.filter((id) => id !== component.id));
      this.ratingError.set(this.message(error, 'Your rating could not be sent. Please try again.'));
    }
  }

  protected toggleProblemForm(): void {
    if (this.isProblemFormOpen()) this.keepFocus('#problem-toggle');
    this.isProblemFormOpen.update((open) => !open);
    this.problemCategory.set('');
    this.problemMessage.set('');
    this.problemError.set('');
    this.problemSentComponentId.set('');
  }

  protected async sendProblem(): Promise<void> {
    const component = this.activeComponent();
    const courseId = this.courseContent()?._id;
    const category = this.problemCategory();
    if (!component || !courseId || this.problemSending()) return;
    if (!category) {
      this.problemError.set('Choose what kind of problem it is.');
      return;
    }
    this.problemSending.set(true);
    this.problemError.set('');
    try {
      await this.lessonExtras.sendLessonFeedback(courseId,
        { componentId: component.id, kind: 'problem', category, message: this.problemMessage().trim() }, this.authToken());
      this.isProblemFormOpen.set(false);
      this.problemSentComponentId.set(component.id);
      this.keepFocus('#problem-toggle');
    } catch (error) {
      this.problemError.set(this.message(error, 'Your report could not be sent. Please try again.'));
    } finally {
      this.problemSending.set(false);
    }
  }

  // Lesson content

  protected renderMarkdown(markdown: string): string {
    return renderLessonMarkdown(this.document, markdown);
  }

  protected downloadAttachment(attachment: CourseComponentAttachment): void {
    const courseId = this.course()?.id;
    if (courseId) void this.courseService.downloadAttachment(courseId, attachment, this.authToken());
  }

  protected muxPlaybackId(component: CourseComponent | null): string {
    return component && canHoldVideo(component) && component.mux?.status === 'ready' ? component.mux.playbackId : '';
  }

  protected videoStatusText(component: CourseComponent): string {
    if (!canHoldVideo(component) || !component.mux) return 'This video is being prepared.';
    switch (component.mux.status) {
      case 'waiting':
      case 'uploading':
        return 'The video upload is still in progress.';
      case 'processing':
        return 'The video is being processed. It will appear here when it is ready.';
      case 'errored':
        return component.mux.errorMessage || 'This video could not be processed.';
      default:
        return 'Video lesson ready.';
    }
  }

  protected controlValue(event: Event): string {
    const control = event.target;
    return control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement ? control.value : '';
  }

  // Quiz

  // One correct answer: choosing replaces the choice. Several: each answer is ticked on or off.
  protected selectQuizAnswer(question: QuizQuestion, answerId: string, checked: boolean): void {
    if (this.quizSubmitted() || this.quizScoring() || this.isQuizQuestionSubmitted(question.id)) return;
    this.quizSelectedAnswerIds.update((selected) => {
      const current = selected[question.id] ?? [];
      const next = !question.multiple ? [answerId] : checked ? [...current, answerId] : current.filter((id) => id !== answerId);
      return { ...selected, [question.id]: [...new Set(next)] };
    });
  }

  protected selectedQuizAnswerIds(questionId: string): string[] {
    return this.quizSelectedAnswerIds()[questionId] ?? [];
  }

  protected activeQuizPassNeeded(passPoints: number): number {
    return Math.max(1, Math.min(passPoints, this.activeQuizTotalPoints()));
  }

  protected activeQuizQuestionAnswered(): boolean {
    const question = this.activeQuizQuestion();
    return question ? this.selectedQuizAnswerIds(question.id).length > 0 : false;
  }

  protected activeQuizQuestionSubmitted(): boolean {
    const question = this.activeQuizQuestion();
    return question ? this.isQuizQuestionSubmitted(question.id) : false;
  }

  protected async submitActiveQuizAnswer(): Promise<void> {
    const question = this.activeQuizQuestion();
    if (!question || this.quizScoring() || !this.activeQuizQuestionAnswered() || this.activeQuizQuestionSubmitted()) return;
    const submitted = [...this.submittedQuizQuestionIds(), question.id];
    if (!await this.scoreActiveQuiz(submitted)) return;
    this.submittedQuizQuestionIds.set(submitted);
    this.keepFocus('.quiz-card .stage-actions button[data-variant=primary]');
  }

  protected goToNextQuizQuestion(): void {
    if (this.quizSubmitted() || this.quizScoring()) return;
    if (this.isLastActiveQuizQuestion()) {
      void this.finishActiveQuiz();
      return;
    }
    this.activeQuizQuestionIndex.update((index) => index + 1);
    this.keepFocus('.quiz-answers input');
  }

  protected async finishActiveQuiz(): Promise<void> {
    if (this.activeQuizQuestions().length === 0 || this.quizScoring()) return;
    if (!await this.scoreActiveQuiz(this.submittedQuizQuestionIds())) return;
    this.quizSubmitted.set(true);
    if (this.activeQuizPassed()) this.completeActiveLesson();
    else this.keepFocus('.quiz-card .stage-actions button');
  }

  protected retryActiveQuiz(): void {
    this.resetQuizAttempt();
    this.keepFocus('.quiz-answers input');
  }

  // The API says only whether the whole question was right. With several correct answers a wrong
  // result does not say which tick was wrong, so single answers are not marked incorrect there.
  protected answerState(question: QuizQuestion, answerId: string): 'correct' | 'incorrect' | '' {
    const feedback = this.quizFeedback(question.id);
    if (!feedback || !this.selectedQuizAnswerIds(question.id).includes(answerId)) return '';
    return feedback.correct ? 'correct' : question.multiple ? '' : 'incorrect';
  }

  protected questionResult(question: QuizQuestion): { correct: boolean; text: string; explanation: string } | null {
    const feedback = this.quizFeedback(question.id);
    if (!feedback) return null;
    return {
      correct: feedback.correct,
      text: feedback.correct ? 'Correct.' : question.multiple ? 'Not correct. Every correct answer must be ticked, and nothing else.' : 'Not correct.',
      explanation: feedback.explanation || feedback.description || '',
    };
  }

  private quizFeedback(questionId: string) {
    return this.isQuizQuestionSubmitted(questionId) ? this.quizResult()?.feedback.find((item) => item.questionId === questionId) ?? null : null;
  }

  private async scoreActiveQuiz(questionIds: string[]): Promise<boolean> {
    const content = this.courseContent();
    const component = this.activeComponent();
    const section = this.activeSection();
    if (!content || component?.type !== 'quiz' || !section) return false;
    const generation = this.quizAttemptGeneration;
    this.quizScoring.set(true);
    this.quizError.set('');
    try {
      const answers = questionIds.map((questionId) => ({ questionId, answerIds: this.selectedQuizAnswerIds(questionId) }));
      const result = await this.courseService.gradeQuiz(content._id, section.id, component.id, answers, this.authToken());
      if (generation !== this.quizAttemptGeneration) return false;
      this.quizResult.set(result);
      return true;
    } catch (error) {
      if (generation === this.quizAttemptGeneration) this.quizError.set(this.message(error, 'Unable to score this quiz. Please try again.'));
      return false;
    } finally {
      if (generation === this.quizAttemptGeneration) this.quizScoring.set(false);
    }
  }

  private resetQuizAttempt(): void {
    this.quizAttemptGeneration++;
    this.quizResult.set(null);
    this.quizScoring.set(false);
    this.quizError.set('');
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
    const completed = this.learningProgress.completedIds(this.userEmail(), content._id);
    return components.find((component) => !completed.includes(component.id))?.id ?? components[0]?.id ?? '';
  }

  /**
   * US-L016-AC09: when the control that had keyboard focus is removed or disabled, move focus to
   * `selector` after the next render instead of letting it fall to the top of the page.
   */
  private keepFocus(selector: string): void {
    afterNextRender(() => {
      const active = this.document.activeElement;
      if (active && active !== this.document.body && !active.matches(':disabled')) return;
      this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus();
    }, { injector: this.injector });
  }

  private message(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  private icon(svg: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }
}
