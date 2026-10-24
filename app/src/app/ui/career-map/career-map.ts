import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, computed, inject, input, output, signal, viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CareerPath, MilestoneState } from '../../app.models';
import { CareerMapNode, buildCareerMap } from '../../utils/career-map';
import { Button } from '../button/button';

const STATE_LABEL: Record<MilestoneState, string> = { achieved: 'Achieved', ready: 'Ready to start', locked: 'Locked' };

/** US-L026: every published milestone-format career in one full-screen map. Looking and jumping only; nothing is recorded here. */
@Component({
  selector: 'app-career-map',
  imports: [Button, NgTemplateOutlet],
  templateUrl: './career-map.html',
  styleUrl: './career-map.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CareerMap {
  readonly paths = input.required<CareerPath[]>();
  readonly states = input.required<Record<string, MilestoneState>>();
  readonly followedIds = input<string[]>([]);
  readonly initialCareerId = input('');
  readonly openCareer = output<string>();
  readonly closed = output<void>();

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly mapElement = viewChild<ElementRef<HTMLElement>>('map');
  private readonly lines = viewChild<ElementRef<SVGSVGElement>>('lines');

  protected readonly layout = computed(() => buildCareerMap(this.paths()));
  private readonly nodesById = computed(() => new Map(this.layout().columns.flat().map((node) => [node.id, node])));
  private readonly chosenCareer = signal<string | null>(null);
  protected readonly highlight = computed(() => this.chosenCareer() ?? this.initialCareerId());
  protected readonly selectedId = signal('');
  protected readonly selected = computed(() => this.nodesById().get(this.selectedId()) ?? null);

  constructor() {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.cm-close')?.focus());
    afterRenderEffect(() => {
      this.layout();
      this.highlight();
      this.states();
      this.draw();
    });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.draw());
    afterNextRender(() => { const map = this.mapElement()?.nativeElement; if (map) observer?.observe(map); });
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      document.body.style.overflow = overflow;
      setTimeout(() => { if (opener?.isConnected) opener.focus(); });
    });
  }

  protected state(id: string): MilestoneState {
    return this.states()[id] ?? 'locked';
  }

  protected stateLabel(id: string): string {
    return STATE_LABEL[this.state(id)];
  }

  protected faded(node: CareerMapNode): boolean {
    return !!this.highlight() && !node.careerIds.includes(this.highlight());
  }

  protected nodeLabel(node: CareerMapNode): string {
    const count = node.careerIds.length;
    return `${node.title}, ${this.stateLabel(node.id).toLowerCase()}, part of ${count} career${count === 1 ? '' : 's'}`;
  }

  protected select(id: string): void {
    this.selectedId.set(id);
    // On phones the details sit below the whole list; bring them into view.
    if (window.matchMedia?.('(max-width: 767px)').matches) {
      setTimeout(() => this.host.nativeElement.querySelector('.cm-detail')?.scrollIntoView({ block: 'start' }));
    }
  }

  protected toggle(careerId: string): void {
    this.chosenCareer.set(this.highlight() === careerId ? '' : careerId);
  }

  protected careerTitle(id: string): string {
    return this.layout().careers.find((career) => career.id === id)?.title ?? id;
  }

  protected followed(id: string): boolean {
    return this.followedIds().includes(id);
  }

  protected notOnMapTitles(): string {
    return this.layout().notOnMap.map((career) => career.title).join(', ');
  }

  protected missingTitles(node: CareerMapNode): string {
    return (node.step?.prerequisiteStepIds ?? []).filter((id) => this.state(id) !== 'achieved')
      .map((id) => this.nodesById().get(id)?.step ? this.nodesById().get(id)!.title : 'a milestone that is not published').join(' and ');
  }

  protected routes(node: CareerMapNode): string[] {
    const actions = new Map((node.step?.actions ?? []).map((action) => [action.id, action.title]));
    return (node.step?.requirementBundles ?? []).map((bundle) => bundle.flatMap((id) => actions.get(id) ?? []).join(' and '))
      .filter(Boolean);
  }

  protected keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.closed.emit(); return; }
    if (event.key !== 'Tab') return;
    const all = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('button:not([disabled])'));
    const visible = all.filter((element) => element.getClientRects().length > 0);
    const focusable = visible.length ? visible : all;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  // Elbow lines from each prerequisite to its milestone, as on the career tree; none on phones, where the list shows instead.
  private draw(): void {
    const map = this.mapElement()?.nativeElement;
    const svg = this.lines()?.nativeElement;
    if (!map || !svg) return;
    const base = map.getBoundingClientRect();
    const box = (id: string) => map.querySelector(`[data-node="${CSS.escape(id)}"]`)?.getBoundingClientRect();
    const highlight = this.highlight();
    svg.innerHTML = this.layout().edges.flatMap(({ from, to }) => {
      const start = box(from), end = box(to);
      if (!start || !end || start.right > end.left) return [];
      const x1 = start.right - base.left, y1 = start.top + start.height / 2 - base.top;
      const x2 = end.left - base.left, y2 = end.top + end.height / 2 - base.top;
      const mid = (x1 + x2) / 2;
      const inCareer = (id: string) => this.nodesById().get(id)?.careerIds.includes(highlight) ?? false;
      const faded = highlight && !(inCareer(from) && inCareer(to)) ? ' data-faded=""' : '';
      return [`<path data-state="${this.state(to)}"${faded} d="M${x1},${y1} H${mid} V${y2} H${x2}" />`];
    }).join('');
  }
}
