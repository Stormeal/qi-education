import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type LoadingSkeletonVariant =
  | 'course-card'
  | 'feedback-card'
  | 'course-detail'
  | 'course-content'
  | 'stat-card';

@Component({
  selector: 'app-loading-skeleton',
  templateUrl: './loading-skeleton.html',
  styleUrls: ['./loading-skeleton.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingSkeleton {
  readonly variant = input<LoadingSkeletonVariant>('course-card');
  readonly count = input(1);

  protected readonly items = computed(() =>
    Array.from({ length: Math.max(1, this.count()) }, (_, index) => index),
  );
}
