import { OrganizationPriceField } from '../organization-price-field/organization-price-field';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminCareerPath, CareerPathDraft, CareerPathIssue } from '../../app.models';
import { CareerPathService } from '../../services/career-path.service';
import { ConfirmService } from '../../services/confirm.service';
import { Button } from '../button/button';

type EditableStep = CareerPathDraft['steps'][number];
type EditableAction = NonNullable<EditableStep['actions']>[number];

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** Admin-only curation of career paths: edit a draft, then publish it as the next revision. */
@Component({
  selector: 'app-career-path-editor',
  imports: [OrganizationPriceField, Button, FormsModule],
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
    this.open(id, { schemaVersion: 2, title: input.value.trim(), summary: '', outcomes: [], estimatedHours: 0, steps: [] });
    this.savedSnapshot = ''; // A new path is unsaved from the start.
    input.value = '';
  }

  protected toggleStep(step: EditableStep): void {
    this.openStep.set(this.openStep() === step ? null : step);
  }

  protected addStep(draft: CareerPathDraft): void {
    // Milestone IDs are shared across careers, so a new milestone's ID carries this path's ID.
    const prefix = draft.schemaVersion === 2 ? `${this.editingId().slice(0, 40)}-step-` : 'step-';
    let index = draft.steps.length + 1;
    while (draft.steps.some((step) => step.id === `${prefix}${index}`)) index++;
    const step: EditableStep = { id: `${prefix}${index}`, title: '', description: '', required: true, courses: [{ courseId: '', title: '' }], prerequisiteStepIds: [] };
    if (draft.schemaVersion === 2) {
      // Preparation courses are optional for milestones; the requirement completes them.
      Object.assign(step, { courses: [], stage: '', roleMilestone: false, actions: [], requirementBundles: [] });
      this.addAction(step);
    }
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

  /** Published milestones of other careers that this draft does not contain yet, for prerequisites and reuse. */
  protected otherMilestones(draft: CareerPathDraft) {
    return [...this.sharedMilestones().values()].filter((item) => !draft.steps.some((own) => own.id === item.step.id));
  }

  // Every milestone of the other milestone-format careers, by ID.
  private sharedMilestones() {
    const found = new Map<string, { step: EditableStep; career: string }>();
    for (const path of this.paths()) {
      const content = path.published ?? path.draft;
      if (path.id === this.editingId() || content?.schemaVersion !== 2) continue;
      for (const step of content.steps) if (!found.has(step.id)) found.set(step.id, { step, career: content.title });
    }
    return found;
  }

  /** Careers other than this one that contain the same milestone ID. */
  protected sharedWith(stepId: string): string {
    return this.paths().filter((path) => path.id !== this.editingId()).map((path) => path.published ?? path.draft)
      .flatMap((content) => content?.schemaVersion === 2 && content.steps.some((step) => step.id === stepId) ? [content.title] : [])
      .join(', ');
  }

  // A shared milestone is copied with its ID, actions and rules; publishing refuses copies that differ.
  protected reuseMilestone(draft: CareerPathDraft, select: HTMLSelectElement): void {
    const found = this.otherMilestones(draft).find((item) => item.step.id === select.value);
    if (!found) return;
    const step = structuredClone(found.step);
    draft.steps.push(step);
    this.openStep.set(step);
    select.value = '';
  }

  /**
   * Turns an old-format draft into milestones: a milestone another career already defines (such as Foundation)
   * is reused as it is; otherwise each linked course becomes a course action and any one of them completes it,
   * as before. Nothing reaches learners until the admin checks the draft and publishes it.
   */
  protected async convert(draft: CareerPathDraft): Promise<void> {
    if (!await this.confirm.ask({ title: `Convert "${draft.title}" to the milestone format?`, confirmLabel: 'Convert',
      message: 'Shared milestones are reused and linked courses become course actions. Steps without a course get '
        + 'an activity to check. Learners keep seeing the published version until you publish.' })) return;
    const shared = this.sharedMilestones();
    const courseTitle = (id: string) => this.careerPath.adminCourses().find((course) => course.id === id)?.title ?? id;
    draft.schemaVersion = 2;
    draft.steps = draft.steps.map((step) => {
      const reused = shared.get(step.id)?.step;
      if (reused) return structuredClone(reused);
      const linked = step.courses.filter((course) => course.courseId);
      const actions: EditableAction[] = (linked.length ? linked : [null]).map((course, index) => ({
        id: `${step.id.slice(0, 50)}-a${index + 1}`,
        kind: course ? 'course' : 'activity',
        title: course ? `Completed ${course.title || courseTitle(course.courseId)}` : step.title,
        courseId: course?.courseId ?? '',
      }));
      return { ...step, stage: '', roleMilestone: false, actions, requirementBundles: actions.map((action) => [action.id]) };
    });
    this.openStep.set(null);
    this.message.set('Converted. Check each milestone, then save or publish.');
  }

  protected addAction(step: EditableStep): void {
    const actions = (step.actions ??= []);
    let index = actions.length + 1;
    while (actions.some((action) => action.id === `${step.id.slice(0, 50)}-a${index}`)) index++;
    const action: EditableAction = { id: `${step.id.slice(0, 50)}-a${index}`, kind: 'activity', title: '', courseId: '', cvKeywords: [] };
    actions.push(action);
    const bundles = (step.requirementBundles ??= []);
    if (bundles.length === 0) bundles.push([action.id]);
    else if (bundles.length === 1) bundles[0].push(action.id);
  }

  /** One keyword per line; the API enforces the count and length limits. */
  protected setKeywords(action: EditableAction, value: string): void {
    action.cvKeywords = value.split('\n').map((line) => line.trim()).filter(Boolean);
  }

  protected removeAction(step: EditableStep, action: EditableAction): void {
    step.actions = step.actions?.filter((item) => item !== action);
    step.requirementBundles = step.requirementBundles?.map((bundle) => bundle.filter((id) => id !== action.id))
      .filter((bundle) => bundle.length > 0);
  }

  protected toggleRouteAction(step: EditableStep, route: number, actionId: string, checked: boolean): void {
    const bundles = step.requirementBundles!;
    bundles[route] = checked ? [...bundles[route], actionId] : bundles[route].filter((id) => id !== actionId);
  }

  protected addRoute(step: EditableStep): void {
    (step.requirementBundles ??= []).push([]);
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
    // A route left without actions is unfinished editing, not a requirement; the API refuses empty routes.
    for (const step of draft.steps) step.requirementBundles = step.requirementBundles?.filter((bundle) => bundle.length > 0);
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
