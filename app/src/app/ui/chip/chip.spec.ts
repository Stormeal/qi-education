import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Chip } from './chip';

@Component({
  imports: [Chip],
  template: `
    <span appChip id="plain">New</span>
    <span appChip="primary" id="primary">4</span>
  `,
})
class Host {}

describe('Chip', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ imports: [Host] });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('defaults to neutral and reflects the variant', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = (id: string) => fixture.nativeElement.querySelector('#' + id) as HTMLElement;
    expect(el('plain').getAttribute('data-variant')).toBe('neutral');
    expect(el('primary').getAttribute('data-variant')).toBe('primary');
  });
});
