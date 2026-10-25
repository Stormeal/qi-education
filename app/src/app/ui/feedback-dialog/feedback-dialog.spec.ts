import { TestBed } from '@angular/core/testing';
import { FeedbackDialog } from './feedback-dialog';

describe('US-A006 feedback dialog', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); TestBed.configureTestingModule({ imports: [FeedbackDialog] }); });
  function setup(type: 'feedback' | 'defect' | 'change-request' = 'feedback') {
    const fixture = TestBed.createComponent(FeedbackDialog);
    Object.entries({ submitted: false, page: 'Courses', submitting: false, error: '',
      draft: { type, summary: '', message: '', rating: '', reproductionSteps: '', expectedBehavior: '' } }).forEach(([key, value]) => fixture.componentRef.setInput(key, value));
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }
  it('AC11 labels every field, offers three types, and starts without an assumed rating', () => {
    const { host } = setup();
    expect(host.textContent).toContain('Give feedback');
    expect(host.textContent).toContain('Report a defect');
    expect(host.textContent).toContain('Request a change');
    for (const field of host.querySelectorAll('input, textarea')) expect(host.querySelector(`label[for="${field.id}"]`)).not.toBeNull();
    expect(host.querySelectorAll('input[name="rating"]')).toHaveLength(3);
    expect(host.querySelectorAll('input[name="rating"]:checked')).toHaveLength(0);
  });
  it('AC02 shows defect details without rating and AC04 prevents an empty submission', () => {
    const { host, fixture } = setup('defect');
    expect(host.textContent).toContain('Reproduction steps'); expect(host.textContent).toContain('Expected behavior');
    expect(host.querySelector('[name="rating"]')).toBeNull();
    const submitted = vi.fn(); fixture.componentInstance.submittedClicked.subscribe(submitted);
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); fixture.detectChanges();
    expect(submitted).not.toHaveBeenCalled(); expect(host.textContent).toContain('Add a short summary.');
  });
  it('AC11 announces success and restores focus and scroll state on destroy', async () => {
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    const previous = document.body.style.overflow;
    const { fixture, host } = setup('change-request');
    fixture.componentRef.setInput('submitted', true); fixture.detectChanges(); await fixture.whenStable();
    expect(host.textContent).toContain('Change request sent'); expect(host.textContent).toContain('review');
    fixture.destroy(); await Promise.resolve();
    expect(document.activeElement).toBe(opener); expect(document.body.style.overflow).toBe(previous); opener.remove();
  });
});
