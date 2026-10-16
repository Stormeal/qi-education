import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TabItem, Tabs, tabId, tabPanelId } from './tabs';

@Component({
  imports: [Tabs],
  template: `<app-tabs groupId="feedback" label="Feedback" [tabs]="tabs" [selected]="selected" (selectedChange)="emitted.push($event)" />`,
})
class Host {
  tabs: TabItem[] = [{ id: 'current', label: 'Current', count: 4 }, { id: 'archived', label: 'Archived' }];
  selected = 'current';
  emitted: string[] = [];
}

describe('Tabs', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ imports: [Host] });
  });
  afterEach(() => TestBed.resetTestingModule());

  function setup() {
    const fixture = TestBed.createComponent(Host);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const tab = (id: string) => root.querySelector('#feedback-tab-' + id) as HTMLButtonElement;
    const key = (id: string, name: string) =>
      tab(id).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
    return { fixture, host: fixture.componentInstance, root, tab, key, cleanup: () => root.remove() };
  }

  it('renders an accessible tablist', () => {
    const page = setup();
    expect(page.root.querySelector('[role="tablist"]')!.getAttribute('aria-label')).toBe('Feedback');
    const current = page.tab('current');
    const archived = page.tab('archived');
    expect(current.getAttribute('role')).toBe('tab');
    expect(current.getAttribute('type')).toBe('button');
    expect(current.getAttribute('aria-controls')).toBe('feedback-panel-current');
    expect(archived.getAttribute('aria-controls')).toBe('feedback-panel-archived');
    expect(current.getAttribute('aria-selected')).toBe('true');
    expect(archived.getAttribute('aria-selected')).toBe('false');
    expect(current.getAttribute('tabindex')).toBe('0');
    expect(archived.getAttribute('tabindex')).toBe('-1');
    expect(current.textContent).toContain('4');
    expect(current.querySelector('span[appChip]')!.textContent!.trim()).toBe('4');
    expect(archived.querySelector('span[appChip]')).toBeNull();
    page.cleanup();
  });

  it('emits the clicked tab', () => {
    const page = setup();
    page.tab('archived').click();
    expect(page.host.emitted).toEqual(['archived']);
    page.cleanup();
  });

  it('moves with arrow keys, wrapping, and focuses the target at once', () => {
    const page = setup();
    page.key('current', 'ArrowRight');
    expect(page.host.emitted).toEqual(['archived']);
    expect(document.activeElement).toBe(page.tab('archived'));
    page.key('archived', 'ArrowRight');
    expect(page.host.emitted.at(-1)).toBe('current');
    expect(document.activeElement).toBe(page.tab('current'));
    page.key('current', 'ArrowLeft');
    expect(page.host.emitted.at(-1)).toBe('archived');
    expect(document.activeElement).toBe(page.tab('archived'));
    page.cleanup();
  });

  it('jumps to the first and last tab with Home and End', () => {
    const page = setup();
    page.key('current', 'End');
    expect(page.host.emitted.at(-1)).toBe('archived');
    expect(document.activeElement).toBe(page.tab('archived'));
    page.key('archived', 'Home');
    expect(page.host.emitted.at(-1)).toBe('current');
    expect(document.activeElement).toBe(page.tab('current'));
    page.cleanup();
  });

  it('leaves modified arrow keys to the browser', () => {
    const page = setup();
    for (const mod of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true, ...mod });
      page.tab('current').dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(page.host.emitted).toEqual([]);
    page.cleanup();
  });

  it('keeps the first tab focusable when selected is not in the list', () => {
    const page = setup();
    page.host.selected = 'drafts';
    page.fixture.changeDetectorRef.markForCheck();
    page.fixture.detectChanges();
    expect(page.tab('current').getAttribute('tabindex')).toBe('0');
    expect(page.tab('archived').getAttribute('tabindex')).toBe('-1');
    expect(page.tab('current').getAttribute('aria-selected')).toBe('false');
    page.cleanup();
  });

  it('builds ids', () => {
    expect(tabId('a', 'b')).toBe('a-tab-b');
    expect(tabPanelId('a', 'b')).toBe('a-panel-b');
  });
});
