import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminCareerPath, CareerPathDraft, CareerPathIssue } from '../../app.models';
import { CareerPathService } from '../../services/career-path.service';
import { ConfirmService } from '../../services/confirm.service';

type EditableStep = CareerPathDraft['steps'][number];

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** Admin-only curation of career paths: edit a draft, then publish it as the next revision. */
@Component({
  selector: 'app-career-path-editor',
  imports: [FormsModule],
  templateUrl: './career-path-editor.html',
  styleUrl: './career-path-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CareerPathEditor {
  protected readonly careerPath = inject(CareerPathService);
  private readonly confirm = inject(ConfirmService);

  protected readonly paths = computed(() =>
    [...this.careerPath.adminPaths()].sort((a, b) => a.id.localeCompare(b.id)));
  protected readonly editingId = signal('');
  // The stored path being edited; null for a new path that has not been saved yet.
  protected readonly editing = computed(() => this.paths().find((path) => path.id === this.editingId()) ?? null);
  // Edited in place by the form; replaced whenever another path is opened.
  protected readonly draft = signal<CareerPathDraft | null>(null);
  protected readonly outcomesText = signal('');
  protected readonly openStep = signal<EditableStep | null>(null);
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly listError = signal('');
  protected readonly conflict = signal(false);
  protected readonly issues = signal<CareerPathIssue[]>([]);
  private savedSnapshot = '';

  constructor() {
    effect(() => {
      if (this.careerPath.token()) void this.careerPath.loadAdmin().then((result) => this.listError.set(result.ok ? '' : result.message));
    });
  }

  protected statusLabel(path: AdminCareerPath): string {
    return path.published ? 'Published' : path.updatedAt ? 'Draft' : 'Starter, not saved';
  }

  protected statusDetail(path: AdminCareerPath): string {
    if (!path.published) return 'Hidden from learners';
    const edits = path.draft && JSON.stringify(path.draft) !== JSON.stringify(path.published) ? ', saved edits not published' : '';
    return `Revision ${path.revision}, ${path.learners} following${edits}`;
  }

  protected stepSummary(step: EditableStep): string {
    const previews = step.courses.filter((course) => !course.courseId).length;
    const courses = `${step.courses.length} ${step.courses.length === 1 ? 'course' : 'courses'}`;
    return `${step.required ? 'Required' : 'Optional'}, ${courses}${previews ? `, ${previews} preview` : ''}`;
  }

  // The form edits the draft object in place, so "changed" is a comparison with what was last loaded or saved.
  protected isDirty(): boolean {
    const draft = this.draft();
    return !!draft && this.snapshot(draft) !== this.savedSnapshot;
  }

  protected async edit(path: AdminCareerPath): Promise<void> {
    if (path.id === this.editingId() || !await this.mayDiscard()) return;
    this.open(path.id, structuredClone(path.draft ?? path.published)!);
  }

  protected async createPath(input: HTMLInputElement): Promise<void> {
    const id = slug(input.value);
    if (id.length < 2 || this.paths().some((path) => path.id === id)) {
      this.listError.set('Enter a new, unique target role.');
      return;
    }
    if (!await this.mayDiscard()) return;
    this.listError.set('');
    this.open(id, { title: input.value.trim(), summary: '', outcomes: [], estimatedHours: 0, steps: [] });
    this.savedSnapshot = ''; // A new path is unsaved from the start.
    input.value = '';
  }

  protected toggleStep(step: EditableStep): void {
    this.openStep.set(this.openStep() === step ? null : step);
  }

  protected addStep(draft: CareerPathDraft): void {
    let index = draft.steps.length + 1;
    while (draft.steps.some((step) => step.id === `step-${index}`)) index++;
    const step: EditableStep = { id: `step-${index}`, title: '', description: '', required: true, courses: [{ courseId: '', title: '' }], prerequisiteStepIds: [] };
    draft.steps.push(step);
    this.openStep.set(step);
  }

  protected removeStep(draft: CareerPathDraft, step: EditableStep): void {
    draft.steps = draft.steps.filter((item) => item !== step);
    for (const other of draft.steps) other.prerequisiteStepIds = other.prerequisiteStepIds.filter((id) => id !== step.id);
  }

  protected moveStep(draft: CareerPathDraft, index: number, offset: -1 | 1): void {
    [draft.steps[index + offset], draft.steps[index]] = [draft.steps[index], draft.steps[index + offset]];
  }

  protected togglePrerequisite(step: EditableStep, id: string, checked: boolean): void {
    step.prerequisiteStepIds = checked ? [...step.prerequisiteStepIds, id] : step.prerequisiteStepIds.filter((item) => item !== id);
  }

  protected stepIssues(stepId: string): CareerPathIssue[] {
    return this.issues().filter((issue) => issue.stepId === stepId);
  }

  protected async save(publish: boolean): Promise<void> {
    const draft = this.draft();
    if (!draft || this.busy()) return;
    draft.outcomes = this.outcomesText().split('\n').map((line) => line.trim()).filter(Boolean);
    draft.estimatedHours = Math.max(0, Math.round(Number(draft.estimatedHours) || 0));
    this.begin();
    const result = await this.careerPath.saveDraft(this.editingId(), draft, publish);
    this.busy.set(false);

    if (result.ok) {
      this.savedSnapshot = this.snapshot(draft);
      this.message.set(publish ? 'Published. Learners now see this revision.' : 'Draft saved. Learners still see the published revision.');
      return;
    }
    this.fail(result, publish && result.issues ? 'Not published. The draft was saved; fix the marked steps.' : result.message);
    if (publish && result.issues) this.savedSnapshot = this.snapshot(draft);
    this.issues.set(result.issues ?? []);
    // Open the first step that needs fixing so the reason is on screen.
    const marked = draft.steps.find((step) => this.stepIssues(step.id).length > 0);
    if (marked) this.openStep.set(marked);
  }

  protected async withdraw(): Promise<void> {
    const path = this.editing();
    if (!path?.published || this.busy()) return;
    const followers = path.learners === 1 ? '1 learner follows' : `${path.learners} learners follow`;
    if (!await this.confirm.ask({ title: `Withdraw "${path.published.title}"?`, confirmLabel: 'Withdraw',
      message: `${followers} it. They are asked to choose another path until you publish it again. Their completed courses are kept.` })) return;
    this.begin();
    const result = await this.careerPath.unpublish(path.id);
    this.busy.set(false);
    if (result.ok) this.message.set('Withdrawn. Learners no longer see this path. It is kept here as a draft.');
    else this.fail(result, result.message);
  }

  // After a conflict: drop the local edits and open what the other admin saved.
  protected async loadLatest(): Promise<void> {
    if (!await this.confirm.ask({ title: 'Load the latest saved version?',
      message: 'Your unsaved edits to this path are discarded.', confirmLabel: 'Load latest version' })) return;
    this.begin();
    const result = await this.careerPath.loadAdmin();
    this.busy.set(false);
    const latest = this.editing();
    if (!result.ok) this.error.set(result.message);
    else if (latest) this.open(latest.id, structuredClone(latest.draft ?? latest.published)!);
  }

  private begin(): void {
    this.busy.set(true);
    this.message.set('');
    this.error.set('');
    this.conflict.set(false);
    this.issues.set([]);
  }

  private fail(result: { code?: string }, message: string): void {
    this.conflict.set(result.code === 'CAREER_PATH_CONFLICT');
    this.error.set(this.conflict()
      ? 'Another admin changed this path after you opened it. Nothing was saved and your edits are still here. Copy what you need, then load the latest version.'
      : message);
  }

  private async mayDiscard(): Promise<boolean> {
    return !this.isDirty() || this.confirm.ask({ title: 'Discard your unsaved changes to this path?',
      message: 'Your edits since the last save are lost.', confirmLabel: 'Discard changes' });
  }

  private snapshot(draft: CareerPathDraft): string {
    return JSON.stringify([draft.title, draft.summary, draft.estimatedHours, draft.steps, this.outcomesText()]);
  }

  private open(id: string, draft: CareerPathDraft): void {
    this.editingId.set(id);
    this.draft.set(draft);
    this.outcomesText.set(draft.outcomes.join('\n'));
    this.openStep.set(null);
    this.savedSnapshot = this.snapshot(draft);
    this.message.set('');
    this.error.set('');
    this.conflict.set(false);
    this.issues.set([]);
  }
}
