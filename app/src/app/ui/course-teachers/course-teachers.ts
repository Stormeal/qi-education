import { afterNextRender, ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, Injector, input, signal, untracked } from '@angular/core';
import { AdminUsersService, type AdminUser } from '../../services/admin-users.service';
import { AppStateService } from '../../services/app-state.service';
import { CourseService, type CourseTeacher } from '../../services/course.service';
import { Button } from '../button/button';
import { Chip } from '../chip/chip';

const COPY = {
  teachers: { title: 'Teachers', hint: 'Assigned teachers can edit this course and submit it for review.',
    none: 'No teachers yet. Only admins can edit this course.', find: 'Find a teacher by name or email',
    noMatch: 'No active teachers match that search.', saving: 'Saving teachers...', saved: 'Teachers saved' },
  reviewers: { title: 'Reviewers', hint: 'Reviewers read the submitted course. It can be published once every reviewer has approved it.',
    none: 'No reviewers. The course publishes without a review by colleagues.', find: 'Find a teacher or admin by name or email',
    noMatch: 'No active teachers or admins match that search.', saving: 'Saving reviewers...', saved: 'Reviewers saved' },
} as const;

/** US-A005: admins assign the teachers who may author a course. US-A007: the same panel assigns its reviewers. Each change saves at once. */
@Component({ selector: 'app-course-teachers', imports: [Button, Chip], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './course-teachers.html', styleUrl: './course-teachers.scss' })
export class CourseTeachers {
  private readonly courses = inject(CourseService);
  private readonly users = inject(AdminUsersService);
  private readonly state = inject(AppStateService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly courseId = input.required<string>();
  readonly kind = input<'teachers' | 'reviewers'>('teachers');
  protected readonly copy = computed(() => COPY[this.kind()]);
  protected readonly teachers = signal<CourseTeacher[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly searching = signal(false);
  protected readonly searched = signal(false);
  protected readonly query = signal('');
  protected readonly error = signal('');
  protected readonly status = signal('');
  private readonly found = signal<AdminUser[]>([]);
  private readonly matches = computed(() => this.found().filter((user) => user.status === 'active' &&
    (user.role === 'teacher' || (this.kind() === 'reviewers' && user.role === 'admin'))));
  protected readonly results = computed(() => {
    const assigned = new Set(this.teachers().map((teacher) => teacher.id));
    return this.matches().filter((user) => !assigned.has(user.id));
  });
  // Matches that are all assigned already are not "no match".
  protected readonly noMatch = computed(() => this.searched() && this.matches().length === 0);
  // Answers for a course the panel no longer shows are dropped.
  private request = 0;

  constructor() {
    effect(() => {
      const courseId = this.courseId();
      untracked(() => void this.load(courseId));
    });
  }

  protected name(teacher: CourseTeacher): string {
    return teacher.displayName || teacher.email || teacher.id;
  }

  protected async search(event: Event): Promise<void> {
    event.preventDefault();
    this.searching.set(true);
    this.error.set('');
    const result = await this.users.search(this.token(), this.query());
    this.searching.set(false);
    this.searched.set(true);
    if (result.ok) this.found.set(result.body.users);
    else this.error.set(result.message);
  }

  protected add(user: AdminUser): void {
    void this.save([...this.teachers().map((teacher) => teacher.id), user.id]);
  }

  protected async remove(index: number): Promise<void> {
    const saved = await this.save(this.teachers().filter((_teacher, position) => position !== index).map((teacher) => teacher.id));
    if (!saved) return;
    afterNextRender(() => {
      const buttons = this.host.nativeElement.querySelectorAll<HTMLButtonElement>('.course-teachers-list button');
      (buttons[index] ?? buttons[index - 1] ?? this.host.nativeElement.querySelector<HTMLInputElement>('input[type="search"]'))?.focus();
    }, { injector: this.injector });
  }

  private async load(courseId: string): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    this.status.set('');
    const result = this.kind() === 'reviewers'
      ? await this.courses.loadCourseReviewers(courseId, this.token())
      : await this.courses.loadCourseTeachers(courseId, this.token());
    if (request !== this.request) return;
    this.loading.set(false);
    if (result.ok) this.teachers.set('reviewers' in result ? result.reviewers : result.teachers);
    else this.error.set(result.message);
  }

  private async save(teacherIds: string[]): Promise<boolean> {
    const request = this.request;
    this.saving.set(true);
    this.error.set('');
    this.status.set('');
    const result = this.kind() === 'reviewers'
      ? await this.courses.saveCourseReviewers(this.courseId(), teacherIds, this.token())
      : await this.courses.saveCourseTeachers(this.courseId(), teacherIds, this.token());
    if (request !== this.request) return false;
    this.saving.set(false);
    if (!result.ok) {
      this.error.set(result.message);
      return false;
    }
    this.teachers.set('reviewers' in result ? result.reviewers : result.teachers);
    this.status.set('reviewers' in result && result.mailWarning ? result.mailWarning : this.copy().saved);
    return true;
  }

  private token(): string {
    return this.state.loginState()?.token ?? '';
  }
}
