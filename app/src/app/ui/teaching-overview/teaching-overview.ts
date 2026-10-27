import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CourseStatus, TeachingCourse } from '../../app.models';
import { AppStateService } from '../../services/app-state.service';
import { CourseService } from '../../services/course.service';
import { Button } from '../button/button';
import { Chip, type ChipVariant } from '../chip/chip';
import { ProgressBar } from '../progress-bar/progress-bar';

type Feedback = TeachingCourse['recentFeedback'][number];

const STATUS: Record<CourseStatus, { label: string; chip: ChipVariant }> = {
  draft: { label: 'Draft', chip: 'neutral' },
  'ready-for-review': { label: 'Ready for review', chip: 'highlight' },
  published: { label: 'Published', chip: 'primary' },
  archived: { label: 'Archived', chip: 'neutral' },
};
const KIND = { helpful: 'Helpful', 'not-helpful': 'Not helpful', problem: 'Problem' };
// Same wording as the learner's Report a problem choices on the learning page.
const CATEGORY = { video: 'Video does not play', 'content-error': 'Mistake in the content', unclear: 'Hard to understand',
  files: 'Files or links', other: 'Other' };

/** US-T016: Home shows a teacher the courses they teach, learners as counts and the newest lesson feedback. Nothing shows without courses. */
@Component({
  selector: 'app-teaching-overview',
  imports: [Button, Chip, DatePipe, ProgressBar, RouterLink],
  templateUrl: './teaching-overview.html',
  styleUrl: './teaching-overview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeachingOverview {
  private readonly state = inject(AppStateService);
  private readonly courseService = inject(CourseService);
  protected readonly courses = signal<TeachingCourse[] | null>(null);
  protected readonly error = signal('');

  constructor() { void this.load(); }

  protected async load(): Promise<void> {
    const token = this.state.loginState()?.token;
    if (!token) return;
    this.error.set('');
    this.courses.set(null);
    try { this.courses.set(await this.courseService.teachingOverview(token)); }
    catch (error) { this.error.set(error instanceof Error ? error.message : 'Unable to load your courses.'); }
  }

  protected status(course: TeachingCourse) { return STATUS[course.status] ?? STATUS.draft; }
  protected feedbackLabel(item: Feedback): string {
    return item.category ? `${KIND[item.kind]}: ${CATEGORY[item.category]}` : KIND[item.kind];
  }
}
