import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ConfirmService } from '../../services/confirm.service';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  const question = { title: 'Deactivate Ann?', message: 'She cannot log in until reactivated.', confirmLabel: 'Deactivate' };
  function setup() {
    TestBed.configureTestingModule({ imports: [ConfirmDialog] });
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const fixture = TestBed.createComponent(ConfirmDialog);
    document.body.append(fixture.nativeElement);
    const service = TestBed.inject(ConfirmService);
    const host = fixture.nativeElement as HTMLElement;
    const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('button')];
    const render = () => { fixture.detectChanges(); return host.querySelector('[role="alertdialog"]'); };
    render();
    return { fixture, service, host, buttons, render, opener, cleanup: () => { opener.remove(); host.remove(); } };
  }
  afterEach(() => TestBed.resetTestingModule());

  it('shows the question, starts on Cancel and answers yes or no', async () => {
    const page = setup();
    expect(page.render()).toBeNull();
    const first = page.service.ask(question);
    const dialog = page.render()!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Deactivate Ann?');
    expect(dialog.textContent).toContain('She cannot log in until reactivated.');
    expect(page.buttons().map((button) => button.textContent!.trim())).toEqual(['Cancel', 'Deactivate']);
    await vi.waitFor(() => expect(document.activeElement).toBe(page.buttons()[0]));
    page.buttons()[1].click();
    expect(await first).toBe(true);
    expect(page.render()).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(page.opener));

    const second = page.service.ask(question);
    page.render();
    page.buttons()[0].click();
    expect(await second).toBe(false);
    page.cleanup();
  });

  it('declines on Escape and on a click outside, and keeps Tab between its two buttons', async () => {
    const page = setup();
    const key = (target: Element, init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event); return event;
    };
    const escaped = page.service.ask(question);
    page.render();
    const [cancel, confirm] = page.buttons();
    confirm.focus();
    expect(key(confirm, { key: 'Tab' }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cancel);
    expect(key(cancel, { key: 'Tab', shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(confirm);
    key(confirm, { key: 'Escape' });
    expect(await escaped).toBe(false);

    const outside = page.service.ask(question);
    page.render();
    page.host.querySelector<HTMLElement>('.confirm-overlay')!.click();
    expect(await outside).toBe(false);
    page.cleanup();
  });

  it('declines an open question when a new one is asked', async () => {
    const page = setup();
    const first = page.service.ask(question);
    const second = page.service.ask({ ...question, title: 'Second?' });
    expect(await first).toBe(false);
    expect(page.render()!.textContent).toContain('Second?');
    page.service.answer(true);
    expect(await second).toBe(true);
    page.cleanup();
  });
});
