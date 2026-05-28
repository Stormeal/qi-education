import { DOCUMENT } from '@angular/common';
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
import { CourseComponent, CourseComponentType, CourseContentDocument } from '../../app.models';
import { AppButton } from '../app-button/app-button';
import { LoadingSkeleton } from '../loading-skeleton/loading-skeleton';

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
  imports: [AppButton, LoadingSkeleton],
  templateUrl: './course-builder.html',
  styleUrl: './course-builder.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CourseBuilder {
  private readonly document = inject(DOCUMENT);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly collapsedSections = new Set<number>();
  private editingSectionIndex: number | null = null;
  private scrollLockTop = 0;
  private expandedQuizQuestionIndex = signal(0);
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
  private dragSource: { sectionIndex: number; componentIndex: number } | null = null;
  private richTextComponentId = '';
  private richTextDraftHtml = '';

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

  readonly courseSectionAdded = output<void>();
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
  readonly courseComponentMoved = output<{ sectionIndex: number; fromIndex: number; toIndex: number }>();

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

    return `${content.sections.length} sections - ${content.sections.reduce((total, section) => total + section.components.length, 0)} components`;
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
      ? '.zip,.ppt,.pptx,image/*'
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
      ? 'Upload ZIP files, PowerPoint decks, and images. Learners can download them directly from the lesson.'
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
    if (component.type === 'text') {
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

    switch (component.mux.status) {
      case 'waiting':
        return 'The upload slot is ready. Your file upload is about to begin.';
      case 'uploading':
        return `${this.muxUploadProgressValue(component)}% uploaded`;
      case 'processing':
        return 'Mux is processing the video. The preview will appear here when it is ready.';
      case 'ready':
        return 'Students will see this video when they open this component.';
      case 'errored':
        return component.mux.errorMessage || 'Mux could not process this video.';
      default:
        return 'Video status is updating.';
    }
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

    const container = this.document.createElement('div');
    container.innerHTML = this.richTextComponentId === component.id
      ? this.richTextDraftHtml || this.richTextHtml()
      : this.renderRichContent(component.content);

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
    }

    this.expandOutlineHeadingsByDefault();
    this.richTextBlockTag.set(this.detectCurrentTextBlockTag());
  }

  protected richTextBlur(sectionIndex: number, componentIndex: number): void {
    const editor = this.document.querySelector('.rich-text-editor');
    if (editor instanceof HTMLElement) {
      this.richTextDraftHtml = editor.innerHTML;
    }

    this.expandOutlineHeadingsByDefault();
    this.richTextBlockTag.set(this.detectCurrentTextBlockTag());

    this.courseComponentContentChanged.emit({
      sectionIndex,
      componentIndex,
      value: this.normalizeRichTextHtml(this.richTextDraftHtml || this.richTextHtml()),
    });
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
    this.scheduleAttachmentActionHydration();
  }

  private isSelectionInsideHeading(): boolean {
    const selection = this.document.defaultView?.getSelection();
    const anchorNode = selection?.anchorNode;
    const anchorElement =
      anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement ?? null;

    return !!anchorElement?.closest('h1, h2, h3');
  }

  private renderRichContent(content: string): string {
    return this.looksLikeHtml(content) ? content : this.renderMarkdown(content);
  }

  private renderEditorContent(component: Extract<CourseComponent, { type: 'text' }>): string {
    const container = this.document.createElement('div');
    container.innerHTML = this.renderRichContent(component.content);
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
    const container = this.document.createElement('div');
    container.innerHTML = html;

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

    return `${component.quiz.questions.length} questions · Pass at ${component.quiz.passPoints} pts`;
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
    event?.preventDefault();
    this.editingSectionIndex = sectionIndex;
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
    this.expandedQuizQuestionIndex.set(0);
    this.activeEditor.set({ sectionIndex, componentIndex });
  }

  protected closeComponentEditor(): void {
    this.expandedQuizQuestionIndex.set(0);
    this.activeEditor.set(null);
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
  }

  protected closeComponentPicker(): void {
    this.componentPicker.set(null);
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
    this.dragSource = { sectionIndex, componentIndex };
    event.dataTransfer?.setData('text/plain', `${sectionIndex}:${componentIndex}`);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  protected dragComponentAllowed(event: DragEvent): void {
    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  protected dropComponent(sectionIndex: number, componentIndex: number, event: DragEvent): void {
    event.preventDefault();
    const source = this.dragSource;
    this.dragSource = null;

    if (!source || source.sectionIndex !== sectionIndex || source.componentIndex === componentIndex) {
      return;
    }

    this.courseComponentMoved.emit({
      sectionIndex,
      fromIndex: source.componentIndex,
      toIndex: componentIndex,
    });
  }

  protected dragComponentEnded(): void {
    this.dragSource = null;
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
    const activeIndex = this.expandedQuizQuestionIndex();
    if (questionIndex < activeIndex) {
      this.expandedQuizQuestionIndex.set(activeIndex - 1);
    } else if (questionIndex === activeIndex) {
      this.expandedQuizQuestionIndex.set(Math.max(0, activeIndex - 1));
    }
    this.courseComponentQuizQuestionRemoved.emit({ sectionIndex, componentIndex, questionIndex });
  }

  protected isQuizQuestionExpanded(questionIndex: number): boolean {
    return this.expandedQuizQuestionIndex() === questionIndex;
  }

  protected expandQuizQuestion(questionIndex: number): void {
    this.expandedQuizQuestionIndex.set(questionIndex);
    this.scrollQuizQuestionIntoView(questionIndex);
  }

  private scrollQuizQuestionIntoView(questionIndex: number): void {
    const viewport = this.document.defaultView;

    viewport?.setTimeout(() => {
      const question = this.document.querySelectorAll('.quiz-question-card').item(questionIndex);

      if (question instanceof HTMLElement) {
        question.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 0);
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
    const container = this.document.createElement('div');
    container.innerHTML = html;

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
