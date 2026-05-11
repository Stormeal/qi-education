import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CourseContentDocument, CourseListItem, FeedbackOption, StudentSummary } from '../../app.models';
import { AppButton } from '../../ui/app-button/app-button';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { LoadingSkeleton } from '../../ui/loading-skeleton/loading-skeleton';
import { PageHeader } from '../../ui/page-header/page-header';

@Component({
  selector: 'app-course-view-page',
  imports: [AppButton, DatePipe, FeedbackDialog, LoadingSkeleton, PageHeader],
  templateUrl: './course-view-page.html',
  styleUrls: ['../../app.scss', './course-view-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseViewPage {
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
  readonly feedbackClosed = output<void>();
  readonly feedbackRatingSelected = output<string>();
  readonly feedbackTextChanged = output<string>();
  readonly feedbackSubmittedClicked = output<void>();

  protected learningOutcomes(course: CourseListItem): string[] {
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

  protected contentSummary(): string {
    if (this.courseContentLoading()) {
      return 'Loading content...';
    }

    const content = this.courseContent();

    if (!content || content.sections.length === 0) {
      return 'Content outline coming soon';
    }

    return `${content.sections.length} sections • ${this.totalLessonCount()} components • Self-paced`;
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

  protected componentMeta(durationMinutes: number, type: string): string {
    const duration = durationMinutes > 0 ? `${durationMinutes} min` : 'No duration';
    return `${type} - ${duration}`;
  }

  protected teacherInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }
}
