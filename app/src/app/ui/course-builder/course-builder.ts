import { DOCUMENT } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  lucideBold,
  lucideCheck,
  lucideChevronDown,
  lucideChevronRight,
  lucideCircleHelp,
  lucideClock3,
  lucideDownload,
  lucideFileUp,
  lucideFileText,
  lucideGripVertical,
  lucideItalic,
  lucideLink,
  lucideList,
  lucidePackage,
  lucidePlus,
  lucideRedo2,
  lucideTrash2,
  lucideUnderline,
  lucideUndo2,
  lucideVideo,
  lucideX,
} from '@ng-icons/lucide';
import '@mux/mux-player';
import { CourseComponent, CourseComponentMoved, CourseComponentType, CourseContentDocument, QUIZ_MAX_ANSWERS, QUIZ_MIN_ANSWERS, QuizQuestion, QuizQuestionEdit } from '../../app.models';
import { Button } from '../button/button';
import { LoadingSkeleton } from '../loading-skeleton/loading-skeleton';
import type { CourseEditorBuffer } from '../../services/course-draft-recovery.service';
import { attachmentProblem } from '../../utils/attachment-rules';
import { inertHtml } from '../../utils/inert-html';
import { plural } from '../../utils/plural';

type ComponentPickerState = {
  sectionIndex: number;
} | null;

type TextOutlineItem = {
  id: string;
  label: string;
  level: number;
  index: number;
  children: TextOutlineItem[];
};

@Component({
  selector: 'app-course-builder',
  imports: [Button, LoadingSkeleton],
  templateUrl: './course-builder.html',
  styleUrl: './course-builder.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CourseBuilder {
  private readonly videoClock = signal(Date.now());
  private readonly videoPendingSince = new Map<string, number>();
  private readonly videoClockTimer = setInterval(() => this.videoClock.set(Date.now()), 5000);
  private readonly stopVideoClock = inject(DestroyRef).onDestroy(() => clearInterval(this.videoClockTimer));
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly collapsedSections = new Set<number>();
  private editingSectionIndex: number | null = null;
  private scrollLockTop = 0;
  private dialogTrigger: HTMLElement | null = null;
  private expandedQuizQuestionIndex = signal<number | null>(0);
  protected readonly activeEditor = signal<{ sectionIndex: number; componentIndex: number } | null>(null);
  protected readonly componentPicker = signal<ComponentPickerState>(null);
  protected readonly richTextHtml = signal('');
  protected readonly richTextBlockTag = signal('<p>');
  protected readonly expandedOutlineIds = signal<string[]>([]);
  protected readonly boldIcon = this.asSafeIcon(lucideBold);
  protected readonly checkIcon = this.asSafeIcon(lucideCheck);
  protected readonly chevronDownIcon = this.asSafeIcon(lucideChevronDown);
  protected readonly chevronRightIcon = this.asSafeIcon(lucideChevronRight);
  protected readonly circleHelpIcon = this.asSafeIcon(lucideCircleHelp);
  protected readonly clockIcon = this.asSafeIcon(lucideClock3);
  protected readonly listIcon = this.asSafeIcon(lucideList);
  protected readonly fileTextIcon = this.asSafeIcon(lucideFileText);
  protected readonly fileUpIcon = this.asSafeIcon(lucideFileUp);
  protected readonly gripIcon = this.asSafeIcon(lucideGripVertical);
  protected readonly italicIcon = this.asSafeIcon(lucideItalic);
  protected readonly linkIcon = this.asSafeIcon(lucideLink);
  protected readonly packageIcon = this.asSafeIcon(lucidePackage);
  protected readonly plusIcon = this.asSafeIcon(lucidePlus);
  protected readonly redoIcon = this.asSafeIcon(lucideRedo2);
  protected readonly downloadIcon = this.asSafeIcon(lucideDownload);
  protected readonly trashIcon = this.asSafeIcon(lucideTrash2);
  protected readonly underlineIcon = this.asSafeIcon(lucideUnderline);
  protected readonly undoIcon = this.asSafeIcon(lucideUndo2);
  protected readonly videoIcon = this.asSafeIcon(lucideVideo);
  protected readonly xIcon = this.asSafeIcon(lucideX);
  private readonly downloadIconSvg = lucideDownload;
  private readonly trashIconSvg = lucideTrash2;
  private dragSource: { sectionIndex: number; componentIndex: number; id: string } | null = null;
  protected readonly draggingLesson = signal(false);
  private richTextComponentId = '';
  private richTextDraftHtml = '';

  readonly readOnly = input(false);
  readonly allowDownloads = input(true);
  readonly courseContent = input.required<CourseContentDocument | null>();
  readonly courseContentLoading = input.required<boolean>();
  readonly courseContentSaving = input.required<boolean>();
  readonly courseSubmitting = input.required<boolean>();
  readonly courseContentError = input.required<string>();
  readonly muxUploadComponentId = input.required<string>();
  readonly muxUploadError = input.required<string>();
  readonly muxUploadProgress = input.required<Record<string, number>>();
  readonly attachmentUploadComponentId = input.required<string>();
  readonly attachmentUploadProgress = input.required<Record<string, number>>();
  readonly attachmentUploadStage = input.required<Record<string, 'uploading' | 'saving'>>();
  readonly attachmentUploadError = input.required<string>();
  readonly quizImageUrls = input<Record<string, string>>({});

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
  readonly courseComponentMoved = output<CourseComponentMoved>();
  protected readonly quizMinAnswers = QUIZ_MIN_ANSWERS;
  protected readonly quizMaxAnswers = QUIZ_MAX_ANSWERS;
  // Questions whose optional explanation field was opened in this session.
  private readonly openQuizExplanations = signal<string[]>([]);

  protected readonly editingComponent = computed(() => {
    const editor = this.activeEditor();
    const content = this.courseContent();

    if (!editor || !content) {
      return null;
    }

    return content.sections[editor.sectionIndex]?.components[editor.componentIndex] ?? null;
  });

  constructor() {
    effect(() => {
      const modalOpen = !!this.activeEditor() || !!this.componentPicker();
      const body = this.document.body;
      const root = this.document.documentElement;
      const viewport = this.document.defaultView;

      if (modalOpen) {
        if (!body.classList.contains('builder-modal-open')) {
          this.scrollLockTop = viewport?.scrollY ?? 0;
          body.style.position = 'fixed';
          body.style.top = `-${this.scrollLockTop}px`;
          body.style.width = '100%';
        }
      } else if (body.classList.contains('builder-modal-open')) {
        body.style.position = '';
        body.style.top = '';
        body.style.width = '';
        viewport?.scrollTo({ top: this.scrollLockTop, behavior: 'auto' });
      }

      body.classList.toggle('builder-modal-open', modalOpen);
      root.classList.toggle('builder-modal-open', modalOpen);
    });

    effect(() => {
      const component = this.editingComponent();

      if (component?.type !== 'text') {
        this.richTextComponentId = '';
        this.richTextDraftHtml = '';
        this.richTextHtml.set('');
        this.richTextBlockTag.set('<p>');
        return;
      }

      const renderedContent = this.renderEditorContent(component);

      if (this.richTextComponentId !== component.id) {
        this.richTextComponentId = component.id;
        this.richTextDraftHtml = renderedContent;
        this.richTextHtml.set(this.richTextDraftHtml);
        this.scheduleAttachmentActionHydration();
        this.expandedOutlineIds.set(this.textOutline(component).map((item) => item.id));
        this.richTextBlockTag.set(this.detectCurrentTextBlockTag());
        return;
      }

      if (renderedContent !== this.richTextDraftHtml) {
        this.richTextDraftHtml = renderedContent;
        this.richTextHtml.set(renderedContent);
        this.scheduleAttachmentActionHydration();
      }
    });

    effect(() => {
      this.syncPendingAttachmentCards(this.attachmentUploadProgress());
    });
  }

  protected readonly componentChoices: Array<{
    type: CourseComponentType;
    title: string;
    subtitle: string;
    icon: SafeHtml;
  }> = [
    {
      type: 'text',
      title: 'Text',
      subtitle: 'Reading material, notes, and written instructions',
      icon: this.fileTextIcon,
    },
    {
      type: 'quiz',
      title: 'Quiz',
      subtitle: 'Knowledge checks, prompts, and assessment tasks',
      icon: this.circleHelpIcon,
    },
    {
      type: 'resources',
      title: 'Resources',
      subtitle: 'Downloadable files and supporting materials',
      icon: this.packageIcon,
    },
    {
      type: 'video',
      title: 'Video',
      subtitle: 'Embedded lessons and supporting video resources',
      icon: this.videoIcon,
    },
  ];

  protected contentSummary(): string {
    const content = this.courseContent();

    if (!content) {
      return 'No content loaded';
    }

    const components = content.sections.reduce((total, section) => total + section.components.length, 0);
    return `${plural(content.sections.length, 'section')} - ${plural(components, 'component')}`;
  }

  protected componentTypeLabel(component: CourseComponent): string {
    switch (component.type) {
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

  protected componentTypeIcon(component: CourseComponent): SafeHtml {
    switch (component.type) {
      case 'video':
        return this.videoIcon;
      case 'quiz':
        return this.circleHelpIcon;
      case 'resources':
        return this.packageIcon;
      default:
        return this.fileTextIcon;
    }
  }

  protected componentTypeClass(component: CourseComponent): string {
    return `component-icon-${component.type}`;
  }

  protected formatDuration(component: CourseComponent): string {
    const minutes = Math.max(0, component.durationMinutes);
    return `${minutes}:00`;
  }

  protected sectionDuration(sectionIndex: number): string {
    const section = this.courseContent()?.sections[sectionIndex];
    const minutes = section?.components.reduce((total, component) => total + component.durationMinutes, 0) ?? 0;
    return `${Math.max(0, minutes)}:00`;
  }

  protected componentEditorLabel(component: CourseComponent): string {
    if (component.type === 'resources') {
      return 'Resource description';
    }

    if (component.type === 'quiz') {
      return 'Quiz notes';
    }

    if (component.type === 'video') {
      return 'Component Overview';
    }

    return 'Text content';
  }

  protected hasSupportingUrl(component: CourseComponent): boolean {
    return component.type === 'video';
  }

  protected hasAttachmentPanel(component: CourseComponent): boolean {
    return component.type === 'resources';
  }

  protected attachmentAccept(component: CourseComponent): string {
    return component.type === 'resources'
      ? '.zip,.pdf,.doc,.docx,.ppt,.pptx,image/*'
      : '.pdf,.txt,.doc,.docx,.ppt,.pptx,image/*';
  }

  protected attachmentInputId(component: CourseComponent): string {
    return `component-attachment-${component.id}`;
  }

  protected attachmentPanelTitle(component: CourseComponent): string {
    return component.type === 'resources' ? 'Resource files' : 'Files';
  }

  protected attachmentPanelDescription(component: CourseComponent): string {
    return component.type === 'resources'
      ? 'Upload ZIP, PDF, Word and PowerPoint files, and images. Learners can download them directly from the lesson.'
      : 'Upload documents, PDFs, images, and PowerPoint decks.';
  }

  protected attachmentUploadLabel(component: CourseComponent): string {
    return this.attachmentUploadComponentId() === component.id
      ? `Uploading ${this.attachmentUploadProgressValue(component)}%`
      : component.type === 'resources'
        ? 'Upload resource'
        : 'Upload documentation';
  }

  protected attachmentUploadProgressValue(component: CourseComponent): number {
    return this.attachmentUploadProgress()[component.id] ?? 0;
  }

  protected isAttachmentUploading(component: CourseComponent): boolean {
    return this.attachmentUploadComponentId() === component.id;
  }

  protected attachmentFileSelected(
    event: Event,
    sectionIndex: number,
    componentIndex: number,
    component: CourseComponent,
  ): void {
    const inputElement = event.target;

    if (!(inputElement instanceof HTMLInputElement) || !inputElement.files?.[0]) {
      return;
    }

    const markerId = `pending-${Math.random().toString(36).slice(2, 10)}`;
    // A file that will be refused gets no pending card; the service still reports why.
    if (component.type === 'text' && !attachmentProblem(component.type, inputElement.files[0])) {
      this.insertPendingAttachmentCard(inputElement.files[0], markerId);
      this.richTextBlur(sectionIndex, componentIndex);
    }
    this.courseComponentAttachmentSelected.emit({
      sectionIndex,
      componentIndex,
      file: inputElement.files[0],
      markerId,
    });
    inputElement.value = '';
  }

  protected removeAttachment(sectionIndex: number, componentIndex: number, assetId: string): void {
    this.courseComponentAttachmentRemoved.emit({ sectionIndex, componentIndex, assetId });
  }

  protected downloadAttachment(
    sectionIndex: number,
    componentIndex: number,
    assetId: string,
    fileName: string,
  ): void {
    this.courseComponentAttachmentDownloaded.emit({ sectionIndex, componentIndex, assetId, fileName });
  }

  protected formatFileSize(sizeBytes: number): string {
    if (sizeBytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
    }

    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected muxStatusLabel(component: CourseComponent): string {
    if (component.type !== 'video' || !component.mux) {
      return 'Ready for upload';
    }

    if (this.muxVideoDelayed(component)) return 'Still processing after 10 minutes';
    switch (component.mux.status) {
      case 'waiting':
        return 'Preparing upload';
      case 'uploading':
        return 'Uploading';
      case 'processing':
        return 'Processing';
      case 'ready':
        return 'Ready to play';
      case 'errored':
        return 'Upload needs attention';
      default:
        return component.mux.status;
    }
  }

  protected muxUploadInputId(component: CourseComponent): string {
    return `mux-video-upload-${component.id}`;
  }

  protected muxUploadProgressValue(component: CourseComponent): number {
    return component.type === 'video' ? (this.muxUploadProgress()[component.id] ?? 0) : 0;
  }

  protected muxPlaybackId(component: CourseComponent): string {
    return component.type === 'video' && component.mux?.status === 'ready'
      ? component.mux.playbackId
      : '';
  }

  protected muxStatusDescription(component: CourseComponent): string {
    if (component.type !== 'video' || !component.mux) {
      return 'Select a video file and QI Education will prepare the Mux upload automatically.';
    }

    if (this.muxVideoDelayed(component)) {
      return 'This video is taking longer than expected. We are still checking. You can wait, or remove the video and upload it again.';
    }
    switch (component.mux.status) {
      case 'waiting':
        return 'Waiting for the file upload. If the upload was interrupted, remove the video and upload it again.';
      case 'uploading':
        return `${this.muxUploadProgressValue(component)}% uploaded`;
      case 'processing':
        return 'Mux is processing the video. The preview will appear here when it is ready.';
      case 'ready':
        return 'Students will see this video when they open this component.';
      case 'errored':
        return `${component.mux.errorMessage || 'Mux could not process this video.'} Remove the video and upload it again.`;
      default:
        return 'Video status is updating.';
    }
  }

  private muxVideoDelayed(component: CourseComponent): boolean {
    if (component.type !== 'video' || !component.mux || !['waiting', 'processing'].includes(component.mux.status)) return false;
    const key = component.mux.uploadId || component.id;
    if (!this.videoPendingSince.has(key)) {
      const updated = Date.parse(this.courseContent()?.updatedAt ?? '');
      this.videoPendingSince.set(key, Math.min(this.videoClock(), Number.isFinite(updated) ? updated : this.videoClock()));
    }
    return this.videoClock() - this.videoPendingSince.get(key)! >= 10 * 60_000;
  }

  protected muxVideoSelected(
    event: Event,
    sectionIndex: number,
    componentIndex: number,
  ): void {
    const inputElement = event.target;

    if (!(inputElement instanceof HTMLInputElement) || !inputElement.files?.[0]) {
      return;
    }

    this.courseComponentMuxVideoSelected.emit({
      sectionIndex,
      componentIndex,
      file: inputElement.files[0],
    });
    inputElement.value = '';
  }

  protected isQuizComponent(component: CourseComponent): component is Extract<CourseComponent, { type: 'quiz' }> {
    return component.type === 'quiz';
  }

  protected isTextComponent(component: CourseComponent): component is Extract<CourseComponent, { type: 'text' }> {
    return component.type === 'text';
  }

  protected textOutline(component: CourseComponent): TextOutlineItem[] {
    if (component.type !== 'text') {
      return [];
    }

    const container = inertHtml(this.document, this.richTextComponentId === component.id
      ? this.richTextDraftHtml || this.richTextHtml()
      : this.renderRichContent(component.content));

    const flatItems = Array.from(container.querySelectorAll('h1, h2, h3'))
      .map((heading, index): TextOutlineItem => ({
        id: `heading-${index}`,
        label: heading.textContent?.trim() || `Section ${index + 1}`,
        level: Number(heading.tagName.slice(1)),
        index,
        children: [],
      }))
      .slice(0, 24);
    const sections: TextOutlineItem[] = [];
    let currentSection: TextOutlineItem | null = null;

    for (const item of flatItems) {
      if (item.level === 1 || !currentSection) {
        currentSection = item.level === 1 ? item : { ...item, level: 1 };
        sections.push(currentSection);
      } else {
        currentSection.children.push(item);
      }
    }

    return sections;
  }

  protected isOutlineExpanded(itemId: string): boolean {
    return this.expandedOutlineIds().includes(itemId);
  }

  protected toggleOutline(itemId: string): void {
    this.expandedOutlineIds.update((ids) =>
      ids.includes(itemId) ? ids.filter((id) => id !== itemId) : [...ids, itemId],
    );
  }

  protected focusTextHeading(index: number): void {
    const editor = this.document.querySelector('.rich-text-editor');
    const heading = editor?.querySelectorAll('h1, h2, h3').item(index);

    if (heading instanceof HTMLElement) {
      heading.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  protected richTextEdited(event: Event): void {
    const editor = event.target;

    if (editor instanceof HTMLElement) {
      this.richTextDraftHtml = editor.innerHTML;
      this.emitRichTextRecovery();
      const component = this.editingComponent();
      this.courseEditorBufferChanged.emit(
        component?.type === 'text' && this.normalizeRichTextHtml(this.richTextDraftHtml) !==
          this.normalizeRichTextHtml(this.renderEditorContent(component)),
      );
    }

    this.expandOutlineHeadingsByDefault();
    this.richTextBlockTag.set(this.detectCurrentTextBlockTag());
  }

  protected richTextBlur(sectionIndex: number, componentIndex: number): void {
    const editor = this.document.querySelector('.rich-text-editor');
    if (editor instanceof HTMLElement) {
      this.richTextDraftHtml = editor.innerHTML;
      this.emitRichTextRecovery();
    }

    this.expandOutlineHeadingsByDefault();
    this.richTextBlockTag.set(this.detectCurrentTextBlockTag());

    const value = this.normalizeRichTextHtml(this.richTextDraftHtml);
    const component = this.editingComponent();
    if (component?.type === 'text' && value !== this.normalizeRichTextHtml(this.renderEditorContent(component))) {
      this.courseComponentContentChanged.emit({ sectionIndex, componentIndex, value });
    }
    this.courseEditorBufferChanged.emit(false);
    this.courseFocusedBufferChanged.emit(null);
  }
  protected sectionTitleEdited(sectionIndex: number, event: Event): void {
    const section = this.courseContent()?.sections[sectionIndex];
    if (!section) return;
    const value = this.editableText(event);
    this.courseEditorBufferChanged.emit(value !== section.title);
    this.courseFocusedBufferChanged.emit({ sectionId: section.id, value });
  }
  private emitRichTextRecovery(): void {
    const editor = this.activeEditor(), component = this.editingComponent();
    const section = editor && this.courseContent()?.sections[editor.sectionIndex];
    if (section && component?.type === 'text') this.courseFocusedBufferChanged.emit({ sectionId: section.id, componentId: component.id, value: this.normalizeRichTextHtml(this.richTextDraftHtml) });
  }

  protected richTextKeydown(event: KeyboardEvent, sectionIndex: number, componentIndex: number): void {
    if (this.selectionTouchesAttachmentCard()) {
      const blockedKeys = ['Backspace', 'Delete', 'Enter'];

      if (blockedKeys.includes(event.key) || event.key.length === 1) {
        event.preventDefault();
        return;
      }
    }

    if (event.key !== 'Enter' || event.shiftKey || !this.isSelectionInsideHeading()) {
      return;
    }

    this.document.defaultView?.setTimeout(() => {
      const editor = this.document.querySelector('.rich-text-editor');

      if (!(editor instanceof HTMLElement)) {
        return;
      }

      editor.focus();
      this.document.execCommand('formatBlock', false, 'p');
      this.richTextDraftHtml = editor.innerHTML;
      this.emitRichTextRecovery();
      this.richTextBlur(sectionIndex, componentIndex);
    }, 0);
  }

  protected richTextClicked(event: MouseEvent, sectionIndex: number, componentIndex: number): void {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const removeButton = target.closest<HTMLElement>('[data-attachment-remove], .rich-attachment-remove');
    const downloadButton = target.closest<HTMLElement>('[data-attachment-download], .rich-attachment-download');

    if (downloadButton) {
      const card = downloadButton.closest<HTMLElement>('.rich-attachment-card');
      const assetId = downloadButton.dataset['attachmentDownload'] ?? this.attachmentAssetIdFromCard(card);
      const fileName = card?.querySelector('strong')?.textContent?.trim() ||
        'attachment';

      event.preventDefault();
      if (
        assetId &&
        !assetId.startsWith('pending-') &&
        !downloadButton.classList.contains('is-disabled') &&
        downloadButton.getAttribute('aria-disabled') !== 'true'
      ) {
        this.courseComponentAttachmentDownloaded.emit({
          sectionIndex,
          componentIndex,
          assetId,
          fileName,
        });
      }
      return;
    }

    if (removeButton) {
      const card = removeButton.closest<HTMLElement>('.rich-attachment-card');
      const assetId = removeButton.dataset['attachmentRemove'] ?? this.attachmentAssetIdFromCard(card);

      if (assetId) {
        event.preventDefault();
        card?.remove();
        const editor = this.document.querySelector('.rich-text-editor');
        if (editor instanceof HTMLElement) {
          this.richTextDraftHtml = editor.innerHTML;
      this.emitRichTextRecovery();
          this.richTextBlur(sectionIndex, componentIndex);
        }
        this.removeAttachment(sectionIndex, componentIndex, assetId);
      }
    }

    this.richTextBlockTag.set(this.detectCurrentTextBlockTag());
  }

  protected richTextSelectionChanged(): void {
    this.richTextBlockTag.set(this.detectCurrentTextBlockTag());
  }

  protected richTextBeforeInput(event: InputEvent): void {
    if (this.selectionTouchesAttachmentCard()) {
      event.preventDefault();
    }
  }

  protected richTextMouseDown(event: MouseEvent): void {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest('[data-attachment-download], [data-attachment-remove], .rich-attachment-download, .rich-attachment-remove')) {
      return;
    }

    if (target.closest('.rich-attachment-card')) {
      event.preventDefault();
    }
  }

  protected preventToolbarMouseDown(event: MouseEvent): void {
    event.preventDefault();
  }

  protected executeRichTextCommand(
    command: string,
    sectionIndex: number,
    componentIndex: number,
    value?: string,
  ): void {
    const editor = this.document.querySelector('.rich-text-editor');

    if (!(editor instanceof HTMLElement)) {
      return;
    }

    editor.focus();

    if (command === 'createLink') {
      const url = this.document.defaultView?.prompt('Link URL', 'https://');

      if (!url?.trim()) {
        return;
      }

      this.document.execCommand(command, false, url.trim());
    } else {
      this.document.execCommand(command, false, value);
    }

    this.richTextDraftHtml = editor.innerHTML;
      this.emitRichTextRecovery();
    this.expandOutlineHeadingsByDefault();
    this.richTextBlockTag.set(this.detectCurrentTextBlockTag());
    this.richTextBlur(sectionIndex, componentIndex);
  }

  protected selectDocumentationFile(component: CourseComponent): void {
    const input = this.document.getElementById(this.attachmentInputId(component));

    if (input instanceof HTMLInputElement) {
      input.click();
    }
  }

  protected insertUnorderedList(sectionIndex: number, componentIndex: number): void {
    this.executeRichTextCommand('insertUnorderedList', sectionIndex, componentIndex);
  }

  protected insertPendingAttachmentCard(file: File, markerId: string): void {
    const editor = this.document.querySelector('.rich-text-editor');

    if (!(editor instanceof HTMLElement)) {
      return;
    }

    editor.focus();
    this.document.execCommand(
      'insertHTML',
      false,
      this.attachmentCardHtml({
        assetId: markerId,
        fileName: file.name,
        sizeBytes: file.size,
        pending: true,
      }),
    );
    this.richTextDraftHtml = editor.innerHTML;
      this.emitRichTextRecovery();
    this.scheduleAttachmentActionHydration();
  }

  private isSelectionInsideHeading(): boolean {
    const selection = this.document.defaultView?.getSelection();
    const anchorNode = selection?.anchorNode;
    const anchorElement =
      anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement ?? null;

    return !!anchorElement?.closest('h1, h2, h3');
  }

  protected renderRichContent(content: string): string {
    return this.looksLikeHtml(content) ? content : this.renderMarkdown(content);
  }

  private renderEditorContent(component: Extract<CourseComponent, { type: 'text' }>): string {
    const container = inertHtml(this.document, this.renderRichContent(component.content));
    const attachments = new Map(component.attachments.map((attachment) => [attachment.assetId, attachment]));

    for (const card of Array.from(container.querySelectorAll<HTMLElement>('.rich-attachment-card'))) {
      card.setAttribute('contenteditable', 'false');
      const assetId = this.attachmentAssetIdFromCard(card);
      const attachment = attachments.get(assetId);
      const isPending = card.dataset['attachmentPending'] === 'true' || assetId.startsWith('pending-');
      const copy = card.querySelector('.rich-attachment-copy');
      const actions = card.querySelector('.rich-attachment-actions');

      if (copy instanceof HTMLElement) {
        copy.setAttribute('contenteditable', 'false');
      }

      if (actions instanceof HTMLElement) {
        actions.setAttribute('contenteditable', 'false');
        actions.innerHTML = this.attachmentActionsHtml({
          assetId,
          fileName: attachment?.fileName ?? card.querySelector('strong')?.textContent?.trim() ?? 'attachment',
          pending: isPending,
        });
      }

      if (attachment && copy instanceof HTMLElement) {
        const meta = copy.querySelector('small');

        if (meta) {
          meta.textContent = this.formatFileSize(attachment.sizeBytes);
        }
      }
    }

    return container.innerHTML;
  }

  private looksLikeHtml(content: string): boolean {
    return /<\/?[a-z][\s\S]*>/i.test(content);
  }

  private normalizeRichTextHtml(html: string): string {
    const container = inertHtml(this.document, html);

    for (const pending of Array.from(container.querySelectorAll('[data-attachment-pending="true"]'))) {
      pending.removeAttribute('data-attachment-pending');
    }

    return container.innerHTML.trim();
  }

  private attachmentCardHtml(input: {
    assetId: string;
    fileName: string;
    sizeBytes: number;
    pending: boolean;
  }): string {
    return `
      <div class="rich-attachment-card rich-attachment-asset-${this.escapeHtml(input.assetId)}${input.pending ? ' is-pending' : ''}" id="rich-attachment-${this.escapeHtml(input.assetId)}" contenteditable="false" data-attachment-id="${this.escapeHtml(input.assetId)}" data-attachment-pending="${input.pending ? 'true' : 'false'}">
        <span class="rich-attachment-copy" contenteditable="false">
          <strong>${this.escapeHtml(input.fileName)}</strong>
          <small>${input.pending ? 'Uploading 0%' : this.formatFileSize(input.sizeBytes)}</small>
          ${input.pending ? '<span class="rich-attachment-progress"><span style="width: 0%"></span></span>' : ''}
        </span>
        <span class="rich-attachment-actions" contenteditable="false">${this.attachmentActionsHtml(input)}</span>
      </div>
    `;
  }

  private attachmentActionsHtml(input: { assetId: string; fileName: string; pending: boolean }): string {
    return `
      <span class="rich-attachment-action rich-attachment-download${input.pending ? ' is-disabled' : ''}" role="button" aria-disabled="${input.pending ? 'true' : 'false'}" data-attachment-download="${this.escapeHtml(input.assetId)}" aria-label="Download ${this.escapeHtml(input.fileName)}">${this.downloadIconSvg}</span>
      <span class="rich-attachment-action rich-attachment-remove rich-attachment-action-danger" role="button" data-attachment-remove="${this.escapeHtml(input.assetId)}" aria-label="Remove ${this.escapeHtml(input.fileName)}">${this.trashIconSvg}</span>
    `;
  }

  private attachmentAssetIdFromCard(card: HTMLElement | null): string {
    if (!card) {
      return '';
    }

    const assetClass = Array.from(card.classList).find((className) =>
      className.startsWith('rich-attachment-asset-'),
    );

    return (
      card.dataset['attachmentId'] ||
      assetClass?.replace(/^rich-attachment-asset-/, '') ||
      card.id.replace(/^rich-attachment-/, '') ||
      ''
    );
  }

  private scheduleAttachmentActionHydration(): void {
    this.document.defaultView?.setTimeout(() => this.hydrateAttachmentActionIcons(), 0);
  }

  private hydrateAttachmentActionIcons(): void {
    for (const action of Array.from(this.document.querySelectorAll<HTMLElement>('.rich-attachment-download'))) {
      if (!action.querySelector('svg')) {
        action.innerHTML = this.downloadIconSvg;
      }
    }

    for (const action of Array.from(this.document.querySelectorAll<HTMLElement>('.rich-attachment-remove'))) {
      if (!action.querySelector('svg')) {
        action.innerHTML = this.trashIconSvg;
      }
    }
  }

  private asSafeIcon(svg: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  private syncPendingAttachmentCards(progressMap: Record<string, number>): void {
    for (const [componentId, progress] of Object.entries(progressMap)) {
      const input = this.document.getElementById(`component-attachment-${componentId}`);
      const editor = input?.closest('.rich-text-shell')?.querySelector('.rich-text-editor');

      if (!(editor instanceof HTMLElement)) {
        continue;
      }

      for (const card of Array.from(editor.querySelectorAll<HTMLElement>('.rich-attachment-card.is-pending'))) {
        const progressLabel = card.querySelector('small');
        const progressBar = card.querySelector<HTMLElement>('.rich-attachment-progress span');

        if (progressLabel) {
          progressLabel.textContent = `Uploading ${progress}%`;
        }

        if (progressBar) {
          progressBar.style.width = `${progress}%`;
        }
      }
    }

    this.hydrateAttachmentActionIcons();
  }

  private expandOutlineHeadingsByDefault(): void {
    const component = this.editingComponent();

    if (!component || component.type !== 'text') {
      return;
    }

    const nextIds = this.textOutline(component).map((item) => item.id);
    this.expandedOutlineIds.update((ids) => Array.from(new Set([...ids, ...nextIds])));
  }

  private detectCurrentTextBlockTag(): '<p>' | '<h1>' | '<h2>' | '<h3>' {
    const selection = this.document.defaultView?.getSelection();
    const anchorNode = selection?.anchorNode;
    const anchorElement =
      anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement ?? null;
    const block = anchorElement?.closest('h1, h2, h3, p, li, div');

    switch (block?.tagName.toLowerCase()) {
      case 'h1':
        return '<h1>';
      case 'h2':
        return '<h2>';
      case 'h3':
        return '<h3>';
      default:
        return '<p>';
    }
  }

  private selectionTouchesAttachmentCard(): boolean {
    const selection = this.document.defaultView?.getSelection();
    const anchorNode = selection?.anchorNode;
    const focusNode = selection?.focusNode;
    const anchorElement =
      anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement ?? null;
    const focusElement =
      focusNode instanceof HTMLElement ? focusNode : focusNode?.parentElement ?? null;

    return !!anchorElement?.closest('.rich-attachment-card') || !!focusElement?.closest('.rich-attachment-card');
  }

  protected quizMetaSummary(component: CourseComponent): string | null {
    if (component.type !== 'quiz') {
      return null;
    }

    return `${plural(component.quiz.questions.length, 'question')} · ${Math.min(component.quiz.passPoints, component.quiz.questions.length)} correct to pass`;
  }

  protected isSectionCollapsed(sectionIndex: number): boolean {
    return this.collapsedSections.has(sectionIndex);
  }

  protected toggleSection(sectionIndex: number): void {
    if (this.collapsedSections.has(sectionIndex)) {
      this.collapsedSections.delete(sectionIndex);
      return;
    }

    this.collapsedSections.add(sectionIndex);
  }

  protected sectionToggleLabel(sectionIndex: number): string {
    return this.isSectionCollapsed(sectionIndex) ? 'Expand section' : 'Collapse section';
  }

  protected isSectionRenaming(sectionIndex: number): boolean {
    return this.editingSectionIndex === sectionIndex;
  }

  protected startSectionRename(sectionIndex: number, event?: MouseEvent): void {
    if (this.courseContentSaving() || this.courseSubmitting()) { event?.preventDefault(); return; }
    event?.preventDefault();
    this.editingSectionIndex = sectionIndex;
    // The title becomes editable on the next render; focus it so typing works without a second click.
    const title = (event?.currentTarget as HTMLElement | null)?.previousElementSibling;
    this.document.defaultView?.setTimeout(() => {
      if (!(title instanceof HTMLElement)) return;
      title.focus();
      this.document.getSelection()?.selectAllChildren(title);
    }, 0);
  }

  protected finishSectionRename(): void {
    this.editingSectionIndex = null;
  }

  protected editableText(event: Event): string {
    const control = event.target;

    if (control instanceof HTMLElement) {
      return control.textContent?.trim() ?? '';
    }

    return '';
  }

  protected renameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLElement | null)?.blur();
    }
  }

  protected openComponentEditor(sectionIndex: number, componentIndex: number): void {
    // An upload error belongs to the lesson it happened in; do not carry it into another editor.
    if (this.attachmentUploadError()) this.attachmentErrorDismissed.emit();
    this.expandedQuizQuestionIndex.set(0);
    this.resetQuizScrollSpace();
    this.activeEditor.set({ sectionIndex, componentIndex });
    this.focusOpenedDialog();
  }

  protected closeComponentEditor(): void {
    this.expandedQuizQuestionIndex.set(0);
    this.activeEditor.set(null);
    this.restoreDialogFocus();
  }

  // DEF-022: same keyboard contract as the feedback dialog (Escape closes, Tab stays inside).
  protected dialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.courseContentSaving() || this.courseSubmitting()) return;
      event.preventDefault();
      if (this.activeEditor()) this.closeComponentEditor(); else this.closeComponentPicker();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = this.dialogFocusable(event.currentTarget as HTMLElement);
    const first = focusable[0], last = focusable[focusable.length - 1];
    const active = this.document.activeElement;
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (active === first || active === event.currentTarget)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }

  private dialogFocusable(dialog: HTMLElement): HTMLElement[] {
    return Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [contenteditable="true"], [tabindex]:not([tabindex="-1"])'));
  }

  private focusOpenedDialog(): void {
    const active = this.document.activeElement;
    this.dialogTrigger = active instanceof HTMLElement ? active : null;
    // The dialog exists after the next render. Its first control is the close button.
    setTimeout(() => {
      const dialog = this.host.nativeElement.querySelector<HTMLElement>('[role="dialog"]');
      if (dialog) (this.dialogFocusable(dialog)[0] ?? dialog).focus();
    });
  }

  private restoreDialogFocus(): void {
    const trigger = this.dialogTrigger;
    this.dialogTrigger = null;
    // A removed lesson's Edit button is gone; then there is nothing to return to.
    setTimeout(() => { if (trigger?.isConnected) trigger.focus(); });
  }

  protected removeComponent(sectionIndex: number, componentIndex: number): void {
    this.courseComponentRemoved.emit({ sectionIndex, componentIndex });

    const editor = this.activeEditor();
    if (editor?.sectionIndex === sectionIndex && editor.componentIndex === componentIndex) {
      this.closeComponentEditor();
    }
  }

  protected openComponentPicker(sectionIndex: number): void {
    this.componentPicker.set({ sectionIndex });
    this.focusOpenedDialog();
  }

  protected closeComponentPicker(): void {
    this.componentPicker.set(null);
    this.restoreDialogFocus();
  }

  protected addComponentOfType(type: CourseComponentType): void {
    const picker = this.componentPicker();

    if (!picker) {
      return;
    }

    this.courseComponentAdded.emit({ sectionIndex: picker.sectionIndex, type });
    this.closeComponentPicker();
  }

  protected dragComponentStarted(sectionIndex: number, componentIndex: number, event: DragEvent): void {
    const component = this.courseContent()?.sections[sectionIndex]?.components[componentIndex];
    if (!component || !this.canMoveComponent(component)) { event.preventDefault(); return; }
    this.dragSource = { sectionIndex, componentIndex, id: component.id };
    this.draggingLesson.set(true);
    event.dataTransfer?.setData('text/plain', `${sectionIndex}:${componentIndex}`);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  protected dragComponentAllowed(event: DragEvent): void {
    if (!this.movableDragSource()) return;
    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  protected dropComponent(sectionIndex: number, componentIndex: number, event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const source = this.movableDragSource();
    this.dragComponentEnded();
    if (!source || (source.sectionIndex === sectionIndex && source.componentIndex === componentIndex)) return;
    this.courseComponentMoved.emit({ sectionIndex: source.sectionIndex, fromIndex: source.componentIndex,
      toIndex: componentIndex, ...(source.sectionIndex === sectionIndex ? {} : { toSectionIndex: sectionIndex }) });
  }

  protected dragComponentEnded(): void {
    this.dragSource = null;
    this.draggingLesson.set(false);
  }

  protected canMoveComponent(component: CourseComponent): boolean {
    return !this.readOnly() && !this.courseContentSaving() && !this.courseSubmitting() &&
      this.muxUploadComponentId() !== component.id && this.attachmentUploadComponentId() !== component.id &&
      !(component.type === 'video' && component.mux?.status === 'uploading');
  }

  private movableDragSource() {
    const source = this.dragSource;
    const component = source && this.courseContent()?.sections[source.sectionIndex]?.components[source.componentIndex];
    return component && component.id === source?.id && this.canMoveComponent(component) ? source : null;
  }

  protected moveComponentToChapter(sectionIndex: number, componentIndex: number, event: Event): void {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    const value = select.value;
    select.value = '';
    if (!value) return;
    const toSectionIndex = Number(value);
    const destination = this.courseContent()?.sections[toSectionIndex];
    const component = this.courseContent()?.sections[sectionIndex]?.components[componentIndex];
    if (!Number.isInteger(toSectionIndex) || toSectionIndex === sectionIndex || !destination || !component || !this.canMoveComponent(component)) return;
    const hadFocus = this.document.activeElement === select;
    this.collapsedSections.delete(toSectionIndex);
    this.courseComponentMoved.emit({ sectionIndex, fromIndex: componentIndex,
      toIndex: destination.components.length, toSectionIndex });
    if (hadFocus) this.document.defaultView?.setTimeout(() => {
      // A cross-chapter move recreates the row. Keep keyboard users on that lesson
      // unless they have deliberately focused another control in the meantime.
      if (this.readOnly() || !this.host.nativeElement.isConnected ||
        (this.document.activeElement !== this.document.body && this.document.activeElement !== select)) return;
      const row = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-component-id]')]
        .find(item => item.dataset['componentId'] === component.id);
      row?.querySelector<HTMLSelectElement>('.lesson-move-select')?.focus();
    }, 0);
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

  protected toggleValue(event: Event): boolean {
    const control = event.target;

    return control instanceof HTMLInputElement ? control.checked : false;
  }

  protected updateQuizQuestion(
    sectionIndex: number,
    componentIndex: number,
    questionIndex: number,
    value: string,
  ): void {
    this.courseComponentQuizQuestionChanged.emit({ sectionIndex, componentIndex, questionIndex, value });
  }

  protected updateQuizPoints(
    sectionIndex: number,
    componentIndex: number,
    questionIndex: number,
    value: string,
  ): void {
    this.courseComponentQuizPointsChanged.emit({ sectionIndex, componentIndex, questionIndex, value });
  }

  protected updateQuizPassPoints(sectionIndex: number, componentIndex: number, value: string): void {
    this.courseComponentQuizPassPointsChanged.emit({ sectionIndex, componentIndex, value });
  }

  protected addQuizQuestion(sectionIndex: number, componentIndex: number): void {
    const component = this.editingComponent();
    const questionCount = component?.type === 'quiz' ? component.quiz.questions.length : 0;
    this.expandedQuizQuestionIndex.set(questionCount);
    this.courseComponentQuizQuestionAdded.emit({ sectionIndex, componentIndex });
    this.scrollQuizQuestionIntoView(questionCount);
  }

  protected removeQuizQuestion(sectionIndex: number, componentIndex: number, questionIndex: number): void {
    this.resetQuizScrollSpace();
    const activeIndex = this.expandedQuizQuestionIndex();
    if (activeIndex !== null && questionIndex < activeIndex) {
      this.expandedQuizQuestionIndex.set(activeIndex - 1);
    } else if (questionIndex === activeIndex) {
      this.expandedQuizQuestionIndex.set(Math.max(0, activeIndex - 1));
    }
    this.courseComponentQuizQuestionRemoved.emit({ sectionIndex, componentIndex, questionIndex });
    // The removed question's button is gone; keep keyboard focus in the quiz.
    setTimeout(() => this.host.nativeElement.querySelectorAll<HTMLButtonElement>('.quiz-question-trigger').item(this.expandedQuizQuestionIndex() ?? 0)?.focus());
  }

  protected isQuizQuestionExpanded(questionIndex: number): boolean {
    return this.expandedQuizQuestionIndex() === questionIndex;
  }

  protected expandQuizQuestion(questionIndex: number): void {
    this.resetQuizScrollSpace();
    this.expandedQuizQuestionIndex.update(active => active === questionIndex ? null : questionIndex);
  }

  protected quizQuestionSummary(question: QuizQuestion): string {
    const correct = question.answers.filter(answer => answer.isCorrect).length;
    return `${question.question.trim() || 'Untitled question'} · ${plural(question.answers.length, 'answer')} · ${correct === 0 ? 'No correct answer' : plural(correct, 'correct answer')}`;
  }

  protected quizQuestionIssues(question: QuizQuestion, questions: QuizQuestion[]): string[] {
    const issues: string[] = [];
    if (questions.filter(item => item.id === question.id).length > 1) issues.push('Question IDs must be unique.');
    if (new Set(question.answers.map(answer => answer.id)).size !== question.answers.length) issues.push('Answer IDs must be unique within the question.');
    if (!question.question.trim()) issues.push('Write the question.');
    if (question.answers.some(answer => !answer.text.trim())) issues.push('Fill in every answer, or delete the empty ones.');
    if (!question.answers.some(answer => answer.isCorrect)) issues.push('Tick at least one correct answer.');
    return issues;
  }

  protected addQuizAnswer(sectionIndex: number, componentIndex: number, questionIndex: number): void {
    this.courseComponentQuizQuestionEdited.emit({ sectionIndex, componentIndex, questionIndex, edit: { kind: 'add-answer' } });
    // The new row does not exist until the state has re-rendered.
    setTimeout(() => {
      const inputs = this.host.nativeElement.querySelectorAll<HTMLInputElement>('.quiz-question-card:not(.is-collapsed) .quiz-answer-input');
      inputs.item(inputs.length - 1)?.focus();
    });
  }

  protected removeQuizAnswer(sectionIndex: number, componentIndex: number, questionIndex: number, answerIndex: number): void {
    this.courseComponentQuizQuestionEdited.emit({ sectionIndex, componentIndex, questionIndex, edit: { kind: 'remove-answer', answerIndex } });
    // The deleted row's button is gone (or disabled at two answers); move focus to the answer that took its place.
    setTimeout(() => {
      const inputs = this.host.nativeElement.querySelectorAll<HTMLInputElement>('.quiz-question-card:not(.is-collapsed) .quiz-answer-input');
      inputs.item(Math.min(answerIndex, inputs.length - 1))?.focus();
    });
  }

  protected quizImageSelected(sectionIndex: number, componentIndex: number, questionId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.quizImageFocusPending = true;
    this.courseComponentQuizImageSelected.emit({ sectionIndex, componentIndex, questionId, file });
  }

  protected updateQuizImageAlt(sectionIndex: number, componentIndex: number, questionIndex: number, value: string): void {
    this.courseComponentQuizQuestionEdited.emit({ sectionIndex, componentIndex, questionIndex, edit: { kind: 'image-alt', value } });
  }

  protected removeQuizImage(sectionIndex: number, componentIndex: number, questionIndex: number): void {
    this.quizImageFocusPending = true;
    this.courseComponentQuizImageRemoved.emit({ sectionIndex, componentIndex, questionIndex });
  }

  // The Add and Remove image buttons replace each other, and both are disabled while the upload or removal runs
  // (seconds), so focus is lost. Put it back in the block once the editor is idle again.
  private quizImageFocusPending = false;
  private readonly quizImageFocus = effect(() => {
    const busy = !!this.attachmentUploadComponentId() || this.courseContentSaving();
    if (busy || !this.quizImageFocusPending) return;
    this.quizImageFocusPending = false;
    setTimeout(() => {
      if (this.document.activeElement !== this.document.body) return;
      this.host.nativeElement.querySelector<HTMLElement>('.quiz-question-card:not(.is-collapsed) .quiz-question-image :is(input[type="text"], button)')?.focus();
    });
  });

  protected updateQuizExplanation(sectionIndex: number, componentIndex: number, questionIndex: number, value: string): void {
    this.courseComponentQuizQuestionEdited.emit({ sectionIndex, componentIndex, questionIndex, edit: { kind: 'explanation', value } });
  }

  protected isQuizExplanationOpen(question: QuizQuestion): boolean {
    return !!question.explanation || this.openQuizExplanations().includes(question.id);
  }

  protected openQuizExplanation(question: QuizQuestion): void {
    this.openQuizExplanations.update(ids => [...ids, question.id]);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLTextAreaElement>('.quiz-question-card:not(.is-collapsed) .quiz-explanation textarea')?.focus());
  }

  private scrollQuizQuestionIntoView(questionIndex: number): void {
    const viewport = this.document.defaultView;
    const editor = this.activeEditor();
    const componentId = this.editingComponent()?.id;

    viewport?.setTimeout(() => {
      if (this.activeEditor() !== editor || this.editingComponent()?.id !== componentId ||
        !this.isQuizQuestionExpanded(questionIndex)) return;
      const body = this.host.nativeElement.querySelector<HTMLElement>('.builder-modal-body');
      const question = this.host.nativeElement.querySelectorAll<HTMLElement>('.quiz-question-card').item(questionIndex);
      if (!body || !question) return;
      const space = this.host.nativeElement.querySelector<HTMLElement>('.quiz-scroll-space');
      if (space) {
        // The final question may be shorter than the visible editor. Reserve its
        // maximum visible height so the browser does not clamp header alignment.
        const maximumHeight = viewport.getComputedStyle(body).maxHeight;
        space.style.height = maximumHeight && maximumHeight !== 'none' ? maximumHeight : `${body.clientHeight}px`;
      }
      // One scroll container keeps the header visible when focus moves to the field.
      body.scrollTo({ top: body.scrollTop + question.getBoundingClientRect().top - body.getBoundingClientRect().top, behavior: 'auto' });
      question.querySelector<HTMLInputElement>('.quiz-question-field input')?.focus({ preventScroll: true });
    }, 0);
  }

  private resetQuizScrollSpace(): void {
    const space = this.host.nativeElement.querySelector<HTMLElement>('.quiz-scroll-space');
    if (space) space.style.height = '0px';
  }

  protected updateQuizAnswerText(
    sectionIndex: number,
    componentIndex: number,
    questionIndex: number,
    answerIndex: number,
    value: string,
  ): void {
    this.courseComponentQuizAnswerTextChanged.emit({
      sectionIndex,
      componentIndex,
      questionIndex,
      answerIndex,
      value,
    });
  }

  protected updateQuizAnswerDescription(
    sectionIndex: number,
    componentIndex: number,
    questionIndex: number,
    answerIndex: number,
    value: string,
  ): void {
    this.courseComponentQuizAnswerDescriptionChanged.emit({
      sectionIndex,
      componentIndex,
      questionIndex,
      answerIndex,
      value,
    });
  }

  protected updateQuizAnswerCorrectness(
    sectionIndex: number,
    componentIndex: number,
    questionIndex: number,
    answerIndex: number,
    value: boolean,
  ): void {
    this.courseComponentQuizAnswerCorrectChanged.emit({
      sectionIndex,
      componentIndex,
      questionIndex,
      answerIndex,
      value,
    });
  }

  protected renderMarkdown(markdown: string): string {
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

  private renderInlineMarkdown(value: string): string {
    return this.escapeHtml(value)
      .replace(/\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
      .replace(/\+\+(.+?)\+\+/g, '<u>$1</u>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }

  private htmlToMarkdown(html: string): string {
    const container = inertHtml(this.document, html);

    return Array.from(container.childNodes)
      .map((node) => this.nodeToMarkdown(node).trim())
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  private nodeToMarkdown(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? '';
    }

    if (!(node instanceof HTMLElement)) {
      return '';
    }

    const children = Array.from(node.childNodes).map((child) => this.nodeToMarkdown(child)).join('');

    switch (node.tagName.toLowerCase()) {
      case 'h1':
        return `# ${children}`;
      case 'h2':
        return `## ${children}`;
      case 'h3':
        return `### ${children}`;
      case 'strong':
      case 'b':
        return `**${children}**`;
      case 'em':
      case 'i':
        return `*${children}*`;
      case 'u':
        return `++${children}++`;
      case 'a':
        return `[${children}](${node.getAttribute('href') ?? ''})`;
      case 'li':
        return `- ${children}`;
      case 'ul':
        return Array.from(node.children).map((child) => this.nodeToMarkdown(child)).join('\n');
      case 'br':
        return '\n';
      case 'div':
      case 'p':
        return children;
      default:
        return children;
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
