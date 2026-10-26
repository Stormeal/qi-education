import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MyReview, ReviewerVerdict } from '../../app.models';
import { AppStateService } from '../../services/app-state.service';
import { CourseService } from '../../services/course.service';
import { Chip, type ChipVariant } from '../chip/chip';

const VERDICTS: Record<ReviewerVerdict, { label: string; chip: ChipVariant }> = {
  waiting: { label: 'Waiting for you', chip: 'highlight' },
  approved: { label: 'Approved', chip: 'primary' },
  'changes-requested': { label: 'Changes requested', chip: 'neutral' },
};

/** US-A007: Home lists the courses the signed-in teacher or admin is asked to review. Nothing shows when there are none. */
@Component({ selector: 'app-my-reviews', imports: [RouterLink, Chip], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-reviews.html', styleUrl: './my-reviews.scss' })
export class MyReviews {
  private readonly courses = inject(CourseService);
  private readonly state = inject(AppStateService);
  protected readonly reviews = signal<MyReview[]>([]);
  protected readonly verdicts = VERDICTS;

  constructor() {
    effect(() => {
      const login = this.state.loginState();
      const token = login && login.user.role !== 'student' ? login.token : '';
      untracked(() => void this.load(token));
    });
  }

  private async load(token: string): Promise<void> {
    this.reviews.set(token ? await this.courses.loadMyReviews(token) : []);
  }
}
