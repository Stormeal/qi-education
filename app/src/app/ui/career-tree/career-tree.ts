import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CareerPath, CareerPathAction, CareerPathStep, MilestoneState } from '../../app.models';
import { CareerPathService } from '../../services/career-path.service';
import { Button } from '../button/button';
import { Chip } from '../chip/chip';

const STATE_LABEL: Record<MilestoneState, string> = { achieved: 'Achieved', ready: 'Ready to start', locked: 'Locked' };
const DECLARE_LABEL: Record<CareerPathAction['kind'], string> = {
  exam: 'Mark exam as passed', course: 'Mark course as completed', activity: 'Mark as done',
};

/** A career's milestones by stage, with the selected milestone's requirements, learning options and declarations. */
@Component({
  selector: 'app-career-tree',
  imports: [Button, Chip, RouterLink],
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
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  protected readonly stateLabel = STATE_LABEL;
  protected readonly declareLabel = DECLARE_LABEL;

  // Home links to a milestone with ?milestone=<id>; the tree opens on it.
  private readonly selectedId = signal(inject(ActivatedRoute, { optional: true })?.snapshot.queryParamMap.get('milestone') ?? '');
  protected readonly confirmingActionId = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly announcement = signal('');

  protected state(stepId: string): MilestoneState {
    return this.careerPath.careers()?.milestoneStates[stepId] ?? 'locked';
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
      const label = step.stage || 'Milestones';
      const stage = stages.find((item) => item.label === label);
      if (stage) stage.steps.push(step);
      else stages.push({ label, steps: [step] });
    }
    return stages;
  });

  protected readonly achievedCount = computed(() =>
    this.path().steps.filter((step) => this.state(step.id) === 'achieved').length);

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
    const declared = careers?.achievements.some((item) => item.actionId === actionId) ?? false;
    const satisfied = careers?.satisfiedActionIds.includes(actionId) ?? false;
    return { satisfied, source: !satisfied ? '' : declared ? 'Self-reported' : 'From your course progress' };
  }

  protected select(step: CareerPathStep): void {
    if (step.id === this.selected()?.id) return;
    this.selectedId.set(step.id);
    this.announcement.set('');
    this.confirmingActionId.set('');
    this.saveError.set('');
  }

  protected askToDeclare(action: CareerPathAction): void {
    this.saveError.set('');
    this.confirmingActionId.set(action.id);
    this.focusAfterRender('.ct-confirm');
  }

  protected cancelDeclare(): void {
    const actionId = this.confirmingActionId();
    this.confirmingActionId.set('');
    this.saveError.set('');
    this.focusAfterRender(`[data-action="${actionId}"]`);
  }

  protected async declare(action: CareerPathAction): Promise<void> {
    if (this.saving()) return;
    const step = this.selected();
    const before = new Map(this.path().steps.map((item) => [item.id, this.state(item.id)]));
    this.saving.set(true);
    this.saveError.set('');
    const result = await this.careerPath.declare(action.id);
    this.saving.set(false);
    if (!result.ok) {
      // The choice stays open so the learner can retry; nothing is shown as saved.
      this.saveError.set(result.code === 'milestone-locked'
        ? 'Not saved. This milestone is locked until its prerequisites are achieved.'
        : `Not saved. ${result.message}`);
      return;
    }
    this.confirmingActionId.set('');
    const unlocked = this.path().steps.filter((item) => before.get(item.id) === 'locked' && this.state(item.id) === 'ready');
    const achieved = step && before.get(step.id) !== 'achieved' && this.state(step.id) === 'achieved';
    this.announcement.set([
      `Saved: ${action.title}.`,
      achieved ? `${step.title} achieved.` : '',
      unlocked.length ? `Now ready: ${unlocked.map((item) => item.title).join(', ')}.` : '',
    ].filter(Boolean).join(' '));
    this.focusAfterRender('.ct-announcement');
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
