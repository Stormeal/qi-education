import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IconButton } from './icon-button';

@Component({
  imports: [IconButton],
  template: `
    <button appIconButton label="Remove section" id="plain"><svg width="16" height="16"></svg></button>
    <button appIconButton [label]="'Move step ' + n + ' up'" id="dynamic"></button>
    <button appIconButton="danger" size="sm" label="Delete" id="danger"></button>
    <button appIconButton label="Delete answer 1" hint="Needs two answers" id="hinted"></button>
    <a appIconButton="ghost" label="Open" href="/x" id="link"></a>
  `,
})
class Host {
  n = 2;
}

describe('IconButton', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ imports: [Host] });
  });
  afterEach(() => TestBed.resetTestingModule());

  function setup() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return (id: string) => fixture.nativeElement.querySelector('#' + id) as HTMLElement;
  }

  it('names itself from the label and defaults to a medium, non-submitting button', () => {
    const el = setup();
    const button = el('plain');
    expect(button.getAttribute('aria-label')).toBe('Remove section');
    expect(button.getAttribute('title')).toBe('Remove section');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('data-variant')).toBe('default');
    expect(button.getAttribute('data-size')).toBe('md');
  });

  it('accepts a bound label', () => {
    const el = setup();
    expect(el('dynamic').getAttribute('aria-label')).toBe('Move step 2 up');
    expect(el('dynamic').getAttribute('title')).toBe('Move step 2 up');
  });

  it('shows a hint as the tooltip while the label stays the accessible name', () => {
    const el = setup();
    expect(el('hinted').getAttribute('aria-label')).toBe('Delete answer 1');
    expect(el('hinted').getAttribute('title')).toBe('Needs two answers');
  });

  it('reflects variant and size', () => {
    const el = setup();
    expect(el('danger').getAttribute('data-variant')).toBe('danger');
    expect(el('danger').getAttribute('data-size')).toBe('sm');
  });

  it('puts no type attribute on an anchor', () => {
    const el = setup();
    expect(el('link').hasAttribute('type')).toBe(false);
    expect(el('link').getAttribute('data-variant')).toBe('ghost');
  });
});

@Component({
  imports: [IconButton],
  template: `<button [appIconButton]="variant" label="Close" id="bound"></button>`,
})
class BoundHost {
  variant: 'ghost' | 'danger' = 'ghost';
}

describe('IconButton bound variant', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ imports: [BoundHost] });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('still carries the appiconbutton attribute so attribute selectors match it', () => {
    const fixture = TestBed.createComponent(BoundHost);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('#bound') as HTMLElement;
    expect(el.hasAttribute('appiconbutton')).toBe(true);
    expect(el.getAttribute('data-variant')).toBe('ghost');
  });
});
