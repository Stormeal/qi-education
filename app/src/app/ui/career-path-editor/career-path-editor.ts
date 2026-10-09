import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminCareerPath, CareerPathDraft, CareerPathIssue } from '../../app.models';
import { CareerPathService } from '../../services/career-path.service';

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

  protected readonly paths = computed(() =>
    [...this.careerPath.adminPaths()].sort((a, b) => a.id.localeCompare(b.id)));
  protected readonly editingId = signal('');
  // Edited in place by the form; replaced whenever another path is opened.
  protected readonly draft = signal<CareerPathDraft | null>(null);
  protected readonly outcomesText = signal('');
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly issues = signal<CareerPathIssue[]>([]);

  constructor() {
    effect(() => {
      if (this.careerPath.token()) void this.careerPath.loadAdmin().then((result) => this.error.set(result.ok ? '' : result.message));
    });
  }

  protected statusLabel(path: AdminCareerPath): string {
    return path.published ? `Published · revision ${path.revision} · ${path.learners} following` : 'Draft · not visible to learners';
  }

  protected edit(path: AdminCareerPath): void {
    this.open(path.id, structuredClone(path.draft ?? path.published)!);
  }

  protected createPath(title: string): void {
    const id = slug(title);
    if (id.length < 2 || this.paths().some((path) => path.id === id)) {
      this.error.set('Enter a new, unique target role.');
      return;
    }
    this.open(id, { title: title.trim(), summary: '', outcomes: [], estimatedHours: 0, steps: [] });
  }

  protected addStep(draft: CareerPathDraft): void {
    let index = draft.steps.length + 1;
    while (draft.steps.some((step) => step.id === `step-${index}`)) index++;
    draft.steps.push({ id: `step-${index}`, title: '', description: '', required: true, courses: [{ courseId: '', title: '' }], prerequisiteStepIds: [] });
  }

  protected removeStep(draft: CareerPathDraft, step: EditableStep): void {
    draft.steps = draft.steps.filter((item) => item !== step);
    for (const other of draft.steps) other.prerequisiteStepIds = other.prerequisiteStepIds.filter((id) => id !== step.id);
  }

  protected moveStepUp(draft: CareerPathDraft, index: number): void {
    [draft.steps[index - 1], draft.steps[index]] = [draft.steps[index], draft.steps[index - 1]];
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
    this.busy.set(true);
    this.message.set('');
    this.error.set('');
    this.issues.set([]);
    const result = await this.careerPath.saveDraft(this.editingId(), draft, publish);
    this.busy.set(false);

    if (result.ok) {
      this.message.set(publish ? 'Published. Learners now see this revision.' : 'Draft saved. Learners still see the published revision.');
    } else {
      this.error.set(publish && result.issues ? 'Not published. The draft was saved; fix the marked steps.' : result.message);
      this.issues.set(result.issues ?? []);
    }
  }

  private open(id: string, draft: CareerPathDraft): void {
    this.editingId.set(id);
    this.draft.set(draft);
    this.outcomesText.set(draft.outcomes.join('\n'));
    this.message.set('');
    this.error.set('');
    this.issues.set([]);
  }
}
