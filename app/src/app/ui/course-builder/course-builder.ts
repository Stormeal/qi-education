import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CourseComponent, CourseContentDocument } from '../../app.models';
import { AppButton } from '../app-button/app-button';
import { LoadingSkeleton } from '../loading-skeleton/loading-skeleton';

@Component({
  selector: 'app-course-builder',
  imports: [AppButton, LoadingSkeleton],
  templateUrl: './course-builder.html',
  styleUrls: ['../../app.scss', './course-builder.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseBuilder {
  private readonly collapsedSections = new Set<number>();
  private readonly collapsedComponents = new Set<string>();
  private editingSectionIndex: number | null = null;
  private editingComponentKey: string | null = null;
  private dragSource: { sectionIndex: number; componentIndex: number } | null = null;

  readonly courseContent = input.required<CourseContentDocument | null>();
  readonly courseContentLoading = input.required<boolean>();
  readonly courseContentSaving = input.required<boolean>();
  readonly courseSubmitting = input.required<boolean>();
  readonly courseContentError = input.required<string>();

  readonly courseSectionAdded = output<void>();
  readonly courseSectionRemoved = output<number>();
  readonly courseSectionTitleChanged = output<{ sectionIndex: number; value: string }>();
  readonly courseComponentAdded = output<{ sectionIndex: number }>();
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

  protected componentTypeDescription(component: CourseComponent): string {
    const duration = component.durationMinutes > 0 ? `${component.durationMinutes} min` : 'No duration';
    return `${this.componentTypeLabel(component)} - ${duration}`;
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

  protected isComponentCollapsed(sectionIndex: number, componentIndex: number): boolean {
    return this.collapsedComponents.has(this.componentKey(sectionIndex, componentIndex));
  }

  protected toggleComponent(sectionIndex: number, componentIndex: number): void {
    const key = this.componentKey(sectionIndex, componentIndex);

    if (this.collapsedComponents.has(key)) {
      this.collapsedComponents.delete(key);
      return;
    }

    this.collapsedComponents.add(key);
  }

  protected sectionToggleLabel(sectionIndex: number): string {
    return this.isSectionCollapsed(sectionIndex) ? 'Expand section' : 'Collapse section';
  }

  protected componentToggleLabel(sectionIndex: number, componentIndex: number): string {
    return this.isComponentCollapsed(sectionIndex, componentIndex)
      ? 'Expand component'
      : 'Collapse component';
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

  protected isComponentRenaming(sectionIndex: number, componentIndex: number): boolean {
    return this.editingComponentKey === this.componentKey(sectionIndex, componentIndex);
  }

  protected startComponentRename(sectionIndex: number, componentIndex: number, event?: MouseEvent): void {
    event?.preventDefault();
    this.editingComponentKey = this.componentKey(sectionIndex, componentIndex);
  }

  protected finishComponentRename(): void {
    this.editingComponentKey = null;
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

  private componentKey(sectionIndex: number, componentIndex: number): string {
    return `${sectionIndex}:${componentIndex}`;
  }
}
