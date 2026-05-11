import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBadgeDollarSign,
  lucideChevronDown,
  lucideChevronRight,
  lucideClipboardCheck,
  lucideClock3,
  lucideFileText,
  lucidePencil,
  lucidePlayCircle,
  lucideX,
} from '@ng-icons/lucide';
import { CourseContentDocument, CourseListItem, FeedbackOption, StudentSummary } from '../../app.models';
import { AppButton } from '../../ui/app-button/app-button';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { LoadingSkeleton } from '../../ui/loading-skeleton/loading-skeleton';
import { PageHeader } from '../../ui/page-header/page-header';

@Component({
  selector: 'app-course-view-page',
  imports: [AppButton, DatePipe, FeedbackDialog, LoadingSkeleton, NgIcon, PageHeader],
  providers: [
    provideIcons({
      lucideBadgeDollarSign,
      lucideChevronDown,
      lucideChevronRight,
      lucideClipboardCheck,
      lucideClock3,
      lucideFileText,
      lucidePencil,
      lucidePlayCircle,
      lucideX,
    }),
  ],
  templateUrl: './course-view-page.html',
  styleUrls: ['../../app.scss', './course-view-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseViewPage {
  protected readonly priceDraft = signal('');
  protected readonly isPriceModalOpen = signal(false);
  protected readonly pendingPriceSave = signal(false);
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
  readonly feedbackOpened = output<void>();
  readonly loggedOut = output<void>();
  readonly adminClicked = output<void>();
  readonly courseEdited = output<string>();
  readonly coursePriceSaved = output<{ courseId: string; priceDkk: number | null }>();
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

  protected controlValue(event: Event): string {
    const control = event.target;

    return control instanceof HTMLInputElement ? control.value : '';
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

  protected componentIconName(type: string): string {
    switch (type) {
      case 'video':
        return 'lucidePlayCircle';
      case 'quiz':
        return 'lucideClipboardCheck';
      default:
        return 'lucideFileText';
    }
  }

  protected componentDurationLabel(durationMinutes: number): string {
    return durationMinutes > 0 ? this.formatDurationShort(durationMinutes) : 'No duration';
  }

  protected componentHasDetails(component: CourseContentDocument['sections'][number]['components'][number]): boolean {
    return !!component.content.trim() || !!component.resourceUrl.trim();
  }

  protected componentPreviewText(component: CourseContentDocument['sections'][number]['components'][number]): string {
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

  private formatDurationShort(durationMinutes: number): string {
    if (durationMinutes < 60) {
      return `${durationMinutes} min`;
    }

    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  private formatDurationLong(durationMinutes: number): string {
    if (durationMinutes <= 0) {
      return '0 min';
    }

    return this.formatDurationShort(durationMinutes);
  }
}
