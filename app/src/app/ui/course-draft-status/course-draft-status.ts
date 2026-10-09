import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { CourseContentDocument } from '../../app.models';
import { CourseBuilder } from '../course-builder/course-builder';
import type { RecoverableCourseDraft } from '../../services/course-draft-recovery.service';

@Component({
  selector: 'app-course-draft-status', imports: [CourseBuilder], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './course-draft-status.html', styleUrl: './course-draft-status.scss',
})
export class CourseDraftStatus {
  readonly recoveryAvailable = input(false);
  readonly drafts = input<RecoverableCourseDraft[]>([]);
  readonly selectedKey = input('');
  readonly selected = output<string>();
  protected selectDraft(event: Event): void {
    if (event.target instanceof HTMLSelectElement) this.selected.emit(event.target.value);
  }
  protected draftDate(timestamp: number): string { return new Date(timestamp).toLocaleString(); }
  readonly editable = input(false);
  readonly recoveryError = input('');
  readonly conflict = input(false);
  readonly latest = input<CourseContentDocument | null>(null);
  readonly loading = input(false);
  readonly pending = input(false);
  readonly revisionId = input<string | null>(null);
  readonly restored = output<void>();
  readonly discarded = output<void>();
  readonly compared = output<void>();
  readonly reconciled = output<void>();
  readonly latestAccepted = output<void>();
  readonly canReconcile = computed(() => this.latest()?.review?.editable && this.latest()?.review?.revisionId === this.revisionId());
  readonly metadata = computed(() => {
    const course = this.latest()?.review?.course;
    return course ? [
      ['Title', course.title], ['Description', course.description], ['Teacher', course.teacher], ['Level', course.level],
      ['Audience', course.audience], ['Requirements', course.requirements.join('\n')], ['Learning outcomes', course.whatYoullLearn.join('\n')],
      ['Career path', course.partOfCareer], ['Career goals', course.careerGoals.join(', ')],
      ['Status', course.status], ['Thumbnail', course.thumbnailAssetId ? 'Saved thumbnail reference: ' + course.thumbnailAssetId : 'None'],
    ] : [];
  });
}
