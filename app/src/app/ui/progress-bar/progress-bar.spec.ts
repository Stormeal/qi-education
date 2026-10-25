import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProgressBar } from './progress-bar';

@Component({
  imports: [ProgressBar],
  template: `<app-progress-bar [value]="value" label="Upload progress" [valueText]="valueText" />`,
})
class Host {
  value = 42.4;
  valueText: string | undefined;
}

describe('ProgressBar', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ imports: [Host] });
  });
  afterEach(() => TestBed.resetTestingModule());

  function setup() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const bar = fixture.nativeElement.querySelector('app-progress-bar') as HTMLElement;
    const update = (value: number, valueText?: string) => {
      fixture.componentInstance.value = value;
      fixture.componentInstance.valueText = valueText;
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
    };
    return { fixture, bar, update, fill: () => bar.querySelector('.fill') as HTMLElement };
  }

  it('exposes a rounded value, its text, the label and the fill width', () => {
    const { bar, fill } = setup();
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(bar.getAttribute('aria-valuetext')).toBe('42%');
    expect(bar.getAttribute('aria-label')).toBe('Upload progress');
    expect(bar.getAttribute('data-size')).toBe('md');
    expect(fill().style.width).toBe('42%');
  });

  it('clamps to 0-100 and treats NaN as 0', () => {
    const { bar, update, fill } = setup();
    update(140);
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    expect(fill().style.width).toBe('100%');
    update(-5);
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(fill().style.width).toBe('0%');
    update(NaN);
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(bar.getAttribute('aria-valuetext')).toBe('0%');
    expect(fill().style.width).toBe('0%');
  });

  it('prefers the given value text', () => {
    const { bar, update } = setup();
    update(40, 'Question 2 of 5');
    expect(bar.getAttribute('aria-valuetext')).toBe('Question 2 of 5');
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
  });
});

@Component({
  imports: [ProgressBar],
  template: `<app-progress-bar [value]="0" label="Video processing" valueText="Processing" indeterminate />`,
})
class IndeterminateHost {}

describe('ProgressBar without a known amount', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ imports: [IndeterminateHost] });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('announces no number and moves without a width', () => {
    const fixture = TestBed.createComponent(IndeterminateHost);
    fixture.detectChanges();
    const bar = fixture.nativeElement.querySelector('app-progress-bar') as HTMLElement;
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    expect(bar.getAttribute('aria-valuetext')).toBe('Processing');
    expect(bar.hasAttribute('data-indeterminate')).toBe(true);
    expect((bar.querySelector('.fill') as HTMLElement).style.width).toBe('');
  });
});
