import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { CourseComponent, CourseComponentType, CourseContentDocument } from '../../app.models';
import { AppButton } from '../app-button/app-button';
import { LoadingSkeleton } from '../loading-skeleton/loading-skeleton';

type ComponentPickerState = {
  sectionIndex: number;
} | null;

@Component({
  selector: 'app-course-builder',
  imports: [AppButton, LoadingSkeleton],
  templateUrl: './course-builder.html',
  styleUrl: './course-builder.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseBuilder {
  private readonly collapsedSections = new Set<number>();
  private editingSectionIndex: number | null = null;
  protected readonly activeEditor = signal<{ sectionIndex: number; componentIndex: number } | null>(null);
  protected readonly componentPicker = signal<ComponentPickerState>(null);
  private dragSource: { sectionIndex: number; componentIndex: number } | null = null;

  readonly courseContent = input.required<CourseContentDocument | null>();
  readonly courseContentLoading = input.required<boolean>();
  readonly courseContentSaving = input.required<boolean>();
  readonly courseSubmitting = input.required<boolean>();
  readonly courseContentError = input.required<string>();

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
  readonly courseComponentMoved = output<{ sectionIndex: number; fromIndex: number; toIndex: number }>();

  protected readonly editingComponent = computed(() => {
    const editor = this.activeEditor();
    const content = this.courseContent();

    if (!editor || !content) {
      return null;
    }

    return content.sections[editor.sectionIndex]?.components[editor.componentIndex] ?? null;
  });

  protected readonly componentChoices: Array<{
    type: CourseComponentType;
    title: string;
    subtitle: string;
    icon: string;
  }> = [
    {
      type: 'text',
      title: 'Text',
      subtitle: 'Reading material, notes, and written instructions',
      icon: '≡',
    },
    {
      type: 'quiz',
      title: 'Quiz',
      subtitle: 'Knowledge checks, prompts, and assessment tasks',
      icon: '✓',
    },
    {
      type: 'video',
      title: 'Video',
      subtitle: 'Embedded lessons and supporting video resources',
      icon: '▶',
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
      default:
        return 'Text';
    }
  }

  protected componentTypeIconGlyph(component: CourseComponent): string {
    switch (component.type) {
      case 'video':
        return '▶';
      case 'quiz':
        return '✓';
      default:
        return '≡';
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
    if (component.type === 'quiz') {
      return 'Quiz instructions';
    }

    if (component.type === 'video') {
      return 'Supporting notes';
    }

    return 'Text content';
  }

  protected hasSupportingUrl(component: CourseComponent): boolean {
    return component.type === 'video';
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
    this.activeEditor.set({ sectionIndex, componentIndex });
  }

  protected closeComponentEditor(): void {
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
}
