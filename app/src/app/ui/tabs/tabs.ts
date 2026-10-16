import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, viewChildren } from '@angular/core';
import { Chip } from '../chip/chip';

export type TabItem = { id: string; label: string; count?: number };

export function tabId(groupId: string, id: string): string {
  return `${groupId}-tab-${id}`;
}

export function tabPanelId(groupId: string, id: string): string {
  return `${groupId}-panel-${id}`;
}

/**
 * Tab row with roving focus and automatic activation. The page renders the panels:
 * give each `role="tabpanel"` the id from `tabPanelId` and `aria-labelledby` from `tabId`.
 */
@Component({
  selector: 'app-tabs',
  imports: [Chip],
  templateUrl: './tabs.html',
  styleUrl: './tabs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tabs {
  readonly groupId = input.required<string>();
  readonly label = input.required<string>();
  readonly tabs = input.required<TabItem[]>();
  readonly selected = input.required<string>();
  readonly selectedChange = output<string>();

  protected readonly tabId = tabId;
  protected readonly tabPanelId = tabPanelId;
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  /** The selected tab, or the first one when `selected` is not in the list, so the row stays reachable by keyboard. */
  protected readonly focusableId = computed(() => {
    const tabs = this.tabs();
    return tabs.some((tab) => tab.id === this.selected()) ? this.selected() : (tabs[0]?.id ?? '');
  });

  protected onKeydown(event: KeyboardEvent, index: number): void {
    // Leave Alt+Arrow (browser Back/Forward) and Ctrl/Meta shortcuts alone.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const count = this.tabs().length;
    let target: number;
    switch (event.key) {
      case 'ArrowRight':
        target = (index + 1) % count;
        break;
      case 'ArrowLeft':
        target = (index - 1 + count) % count;
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.selectedChange.emit(this.tabs()[target].id);
    this.buttons()[target]?.nativeElement.focus();
  }
}
