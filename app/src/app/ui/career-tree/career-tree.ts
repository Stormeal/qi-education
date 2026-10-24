import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, computed, effect, inject, input, output, signal, viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CareerPath, CareerPathAction, CareerPathStep, MilestoneState } from '../../app.models';
import { CareerPathService } from '../../services/career-path.service';
import { ConfirmService } from '../../services/confirm.service';
import { Button } from '../button/button';

const STATE_LABEL: Record<MilestoneState, string> = { achieved: 'Achieved', ready: 'Ready to start', locked: 'Locked' };
// Old-format paths: prerequisites only suggest an order, so a later step is never called locked.
const OLD_FORMAT_LABEL: Record<MilestoneState, string> = { achieved: 'Completed', ready: 'Ready to start', locked: 'Recommended later' };
// Stage names for steps without one, by how many prerequisites deep they sit.
const DEPTH_STAGES = ['Start here', 'Build your base', 'Develop further', 'Keep developing'];
const DECLARE_LABEL: Record<CareerPathAction['kind'], string> = {
  exam: 'Mark exam as passed', course: 'Mark course as completed', activity: 'Mark as done',
};

/** A career's milestones by stage, with the selected milestone's requirements, learning options and declarations. */
@Component({
  selector: 'app-career-tree',
  imports: [Button, DatePipe, RouterLink],
  templateUrl: './career-tree.html',
  styleUrl: './career-tree.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CareerTree {
  readonly path = input.required<CareerPath>();
  /** False while previewing a career the account does not follow: inspecting is allowed, recording is not. */
  readonly canDeclare = input(false);
  readonly explore = output<string>();

  protected readonly careerPath = inject(CareerPathService);
  private readonly confirm = inject(ConfirmService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly map = viewChild<ElementRef<HTMLElement>>('map');
  private readonly lines = viewChild<ElementRef<SVGSVGElement>>('lines');
  protected readonly milestoneFormat = computed(() => this.path().schemaVersion === 2);
  protected readonly declareLabel = DECLARE_LABEL;

  // Home links to a milestone with ?milestone=<id>; the tree opens on it.
  private readonly selectedId = signal(inject(ActivatedRoute, { optional: true })?.snapshot.queryParamMap.get('milestone') ?? '');
  protected readonly failedActionId = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly announcement = signal('');

  constructor() {
    // Connector lines follow the rendered nodes, so they are redrawn after each render and on resize.
    afterRenderEffect(() => {
      this.path();
      this.careerPath.careers();
      this.selected();
      this.draw();
    });
    // Old-format states need the course outlines behind the learner's progress.
    effect(() => { if (!this.milestoneFormat()) void this.careerPath.loadOutlines(this.path()); });
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => this.draw());
    afterNextRender(() => { const map = this.map()?.nativeElement; if (map) observer.observe(map); });
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  // Old-format states come from course completion; milestone states come from the API.
  private readonly oldFormatStates = computed(() => {
    if (this.milestoneFormat()) return null;
    const done = this.careerPath.progressFor(this.path()).doneStepIds;
    return Object.fromEntries(this.path().steps.map((step): [string, MilestoneState] => [step.id, done.has(step.id) ? 'achieved'
      : step.prerequisiteStepIds.every((id) => done.has(id)) ? 'ready' : 'locked']));
  });

  protected state(stepId: string): MilestoneState {
    return this.oldFormatStates()?.[stepId] ?? this.careerPath.careers()?.milestoneStates[stepId] ?? 'locked';
  }

  protected earlierMet(stepId: string): boolean {
    return this.careerPath.careers()?.earlierCriteriaMet?.includes(stepId) ?? false;
  }

  protected label(state: MilestoneState): string {
    return (this.milestoneFormat() ? STATE_LABEL : OLD_FORMAT_LABEL)[state];
  }

  // Every published milestone by ID, with the career that defines it, so cross-career prerequisites can be named.
  private readonly milestoneIndex = computed(() => {
    const index = new Map<string, { step: CareerPathStep; path: CareerPath }>();
    for (const path of this.careerPath.paths()) {
      for (const step of path.steps) if (!index.has(step.id)) index.set(step.id, { step, path });
    }
    for (const step of this.path().steps) index.set(step.id, { step, path: this.path() });
    return index;
  });

  protected readonly stages = computed(() => {
    const stages: { label: string; steps: CareerPathStep[] }[] = [];
    for (const step of this.path().steps) {
      const label = step.stage || DEPTH_STAGES[Math.min(this.depth(step.id), DEPTH_STAGES.length - 1)];
      const stage = stages.find((item) => item.label === label);
      if (stage) stage.steps.push(step);
      else stages.push({ label, steps: [step] });
    }
    return stages;
  });

  protected readonly selected = computed((): CareerPathStep | null => {
    const steps = this.path().steps;
    return steps.find((step) => step.id === this.selectedId())
      ?? steps.find((step) => this.state(step.id) === 'ready') ?? steps[0] ?? null;
  });

  /** Prerequisites of a milestone that are not achieved yet, and which career defines each one. */
  protected missing(step: CareerPathStep) {
    return step.prerequisiteStepIds.filter((id) => this.state(id) !== 'achieved').map((id) => {
      const found = this.milestoneIndex().get(id);
      const otherPath = found && found.path.id !== this.path().id ? found.path : null;
      return { id, title: found?.step.title ?? 'A milestone that is no longer published', otherPath };
    });
  }

  protected stageOf(step: CareerPathStep): string {
    return this.stages().find((stage) => stage.steps.includes(step))?.label ?? '';
  }

  // Longest prerequisite chain inside this path; a loop or unknown ID counts as no further depth.
  private depth(stepId: string, seen = new Set<string>()): number {
    const step = this.path().steps.find((item) => item.id === stepId);
    if (!step || seen.has(stepId)) return 0;
    seen.add(stepId);
    const inPath = step.prerequisiteStepIds.filter((id) => this.path().steps.some((item) => item.id === id));
    return inPath.length ? 1 + Math.max(...inPath.map((id) => this.depth(id, new Set(seen)))) : 0;
  }

  protected missingTitles(step: CareerPathStep): string {
    return this.missing(step).map((item) => item.title).join(' and ');
  }

  protected prerequisiteTitles(step: CareerPathStep): string {
    return step.prerequisiteStepIds.map((id) => this.milestoneIndex().get(id)?.step.title ?? id).join(', ');
  }

  protected bundles(step: CareerPathStep) {
    const actions = new Map((step.actions ?? []).map((action) => [action.id, action]));
    return (step.requirementBundles ?? []).map((bundle) =>
      bundle.flatMap((id) => actions.get(id) ?? []).map((action) => ({ action, ...this.evidence(action.id) })));
  }

  private evidence(actionId: string) {
    const careers = this.careerPath.careers();
    const declared = careers?.achievements.find((item) => item.actionId === actionId);
    const satisfied = careers?.satisfiedActionIds.includes(actionId) ?? false;
    const source = declared?.provenance === 'cv' ? 'From your CV' : declared ? 'Self-reported' : 'From your course progress';
    return { satisfied, source: satisfied ? source : '' };
  }

  protected select(step: CareerPathStep): void {
    if (step.id === this.selected()?.id) return;
    this.selectedId.set(step.id);
    this.announcement.set('');
    this.failedActionId.set('');
    this.saveError.set('');
  }

  protected async askToDeclare(action: CareerPathAction): Promise<void> {
    if (!await this.confirm.ask({
      title: 'Record your achievement',
      message: `I confirm that I have met this requirement: ${action.title}. This is self-reported. It is saved to your account `
        + 'and does not mark lessons complete or enroll you in a course.',
      confirmLabel: 'Confirm achievement',
    })) return;
    await this.declare(action);
  }

  protected async declare(action: CareerPathAction): Promise<void> {
    if (this.saving()) return;
    const step = this.selected();
    // Keep this milestone open after saving; the default would move on to the next ready one.
    if (step) this.selectedId.set(step.id);
    const before = new Map(this.path().steps.map((item) => [item.id, this.state(item.id)]));
    this.saving.set(true);
    this.saveError.set('');
    const result = await this.careerPath.declare(action.id);
    this.saving.set(false);
    if (!result.ok) {
      // The choice stays offered as a retry; nothing is shown as saved.
      this.failedActionId.set(action.id);
      this.saveError.set(result.code === 'milestone-locked'
        ? 'Not saved. This milestone is locked until its prerequisites are achieved.'
        : `Not saved. ${result.message}`);
      return;
    }
    this.failedActionId.set('');
    const unlocked = this.path().steps.filter((item) => before.get(item.id) === 'locked' && this.state(item.id) === 'ready');
    const achieved = step && before.get(step.id) !== 'achieved' && this.state(step.id) === 'achieved';
    this.announcement.set([
      `Saved: ${action.title}.`,
      achieved ? `${step.title} achieved.` : '',
      unlocked.length ? `Now ready: ${unlocked.map((item) => item.title).join(', ')}.` : '',
    ].filter(Boolean).join(' '));
    this.focusAfterRender('.ct-announcement');
  }

  // Elbow lines from each prerequisite to its milestone; none when stages stack on a narrow screen.
  private draw(): void {
    const map = this.map()?.nativeElement;
    const svg = this.lines()?.nativeElement;
    if (!map || !svg) return;
    const base = map.getBoundingClientRect();
    const box = (id: string) => map.querySelector(`[data-step="${id}"]`)?.getBoundingClientRect();
    svg.innerHTML = this.path().steps.flatMap((step) => step.prerequisiteStepIds.flatMap((id) => {
      const from = box(id);
      const to = box(step.id);
      if (!from || !to || from.right > to.left) return [];
      const x1 = from.right - base.left;
      const y1 = from.top + from.height / 2 - base.top;
      const x2 = to.left - base.left;
      const y2 = to.top + to.height / 2 - base.top;
      const mid = (x1 + x2) / 2;
      return [`<path data-state="${this.state(step.id)}" d="M${x1},${y1} H${mid} V${y2} H${x2}" />`];
    })).join('');
  }

  // A replaced control drops keyboard focus to the top of the page; move it to what replaced it.
  private focusAfterRender(selector: string): void {
    setTimeout(() => {
      const target = this.host.nativeElement.querySelector<HTMLElement>(selector);
      if (!target) return;
      if (!target.matches('a, button')) target.tabIndex = -1;
      target.focus();
    });
  }
}
