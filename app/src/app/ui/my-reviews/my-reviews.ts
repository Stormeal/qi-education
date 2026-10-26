import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MyReview } from '../../app.models';
import { AppStateService } from '../../services/app-state.service';
import { Chip, type ChipVariant } from '../chip/chip';

/** US-A007: Home lists the courses the signed-in teacher or admin is asked to review. Nothing shows when there are none. */
@Component({ selector: 'app-my-reviews', imports: [RouterLink, Chip], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-reviews.html', styleUrl: './my-reviews.scss' })
export class MyReviews {
  protected readonly reviews = inject(AppStateService).myReviews;

  /** The viewer's verdict counts only while the revision waits for review; otherwise the course's state is what matters. */
  protected badge(review: MyReview): { label: string; chip: ChipVariant } {
    if (review.status === 'draft') return { label: 'Back with its teachers', chip: 'neutral' };
    if (review.status === 'published') return { label: 'Published', chip: 'neutral' };
    if (review.status === 'archived') return { label: 'Archived', chip: 'neutral' };
    if (review.verdict === 'approved') return { label: 'Approved', chip: 'primary' };
    if (review.verdict === 'changes-requested') return { label: 'Changes requested', chip: 'neutral' };
    return { label: 'Waiting for you', chip: 'highlight' };
  }
}
