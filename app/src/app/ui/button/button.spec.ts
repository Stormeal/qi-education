import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Button } from './button';

@Component({
  imports: [Button],
  template: `
    <button appButton id="plain">Save</button>
    <form (submit)="$event.preventDefault(); submitted = true">
      <button appButton="primary" size="lg" fullWidth type="submit" id="submit">Send</button>
    </form>
    <a appButton="ghost" href="/x" id="link">Go</a>
    <button appButton id="loading" [loading]="loading" (click)="clicks = clicks + 1">Busy</button>
    <button appButton id="disabled" [disabled]="true" (click)="clicks = clicks + 1">Off</button>
    <label appButton for="f" id="label">Choose file</label>
    <input type="file" id="f" class="visually-hidden" />
  `,
  styles: [
    '.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }',
  ],
})
class Host {
  submitted = false;
  loading = true;
  clicks = 0;
}

describe('Button', () => {
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
    const el = (id: string) => fixture.nativeElement.querySelector('#' + id) as HTMLElement;
    return { fixture, host: fixture.componentInstance, el, cleanup: () => fixture.nativeElement.remove() };
  }

  it('defaults to a secondary, medium, non-submitting button', () => {
    const page = setup();
    const button = page.el('plain');
    expect(button.getAttribute('data-variant')).toBe('secondary');
    expect(button.getAttribute('data-size')).toBe('md');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.hasAttribute('data-full-width')).toBe(false);
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(button.hasAttribute('aria-disabled')).toBe(false);
    page.cleanup();
  });

  it('reflects variant, size, full width and type, and submits its form', () => {
    const page = setup();
    const button = page.el('submit');
    expect(button.getAttribute('data-variant')).toBe('primary');
    expect(button.getAttribute('data-size')).toBe('lg');
    expect(button.hasAttribute('data-full-width')).toBe(true);
    expect(button.getAttribute('type')).toBe('submit');
    button.click();
    expect(page.host.submitted).toBe(true);
    page.cleanup();
  });

  it('puts no type attribute on an anchor', () => {
    const page = setup();
    const link = page.el('link');
    expect(link.getAttribute('data-variant')).toBe('ghost');
    expect(link.hasAttribute('type')).toBe(false);
    page.cleanup();
  });

  it('shows a spinner, marks itself busy and swallows clicks while loading', () => {
    const page = setup();
    const button = page.el('loading');
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.querySelector('.btn-spinner')).not.toBeNull();
    expect(button.querySelector('.btn-spinner')!.getAttribute('aria-hidden')).toBe('true');
    button.click();
    expect(page.host.clicks).toBe(0);

    page.host.loading = false;
    page.fixture.changeDetectorRef.markForCheck();
    page.fixture.detectChanges();
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(button.querySelector('.btn-spinner')).toBeNull();
    button.click();
    expect(page.host.clicks).toBe(1);
    page.cleanup();
  });

  it('does not call a click handler when disabled', () => {
    const page = setup();
    page.el('disabled').click();
    expect(page.host.clicks).toBe(0);
    page.cleanup();
  });

  it('works as a label for a visually hidden file input that stays focusable', () => {
    const page = setup();
    const label = page.el('label');
    const input = page.el('f');
    expect(label.hasAttribute('type')).toBe(false);
    expect(getComputedStyle(input).display).not.toBe('none');
    input.focus();
    expect(document.activeElement).toBe(input);
    page.cleanup();
  });
});

@Component({
  imports: [Button],
  template: `<button [appButton]="variant" id="bound">Next</button>`,
})
class BoundHost {
  variant: 'primary' | 'secondary' = 'primary';
}

describe('Button bound variant', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ imports: [BoundHost] });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('still carries the appbutton attribute so attribute selectors match it', () => {
    const fixture = TestBed.createComponent(BoundHost);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('#bound') as HTMLElement;
    expect(el.hasAttribute('appbutton')).toBe(true);
    expect(el.getAttribute('data-variant')).toBe('primary');
  });
});
