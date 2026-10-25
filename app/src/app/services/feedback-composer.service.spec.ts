import { TestBed } from '@angular/core/testing';
import { FeedbackComposerService } from './feedback-composer.service';
import { FeedbackService, FeedbackSubmitResult } from './feedback.service';

describe('US-A006 feedback composer', () => {
  let composer: FeedbackComposerService;
  let requests: Array<{ resolve: (value: FeedbackSubmitResult) => void }>;
  let submit: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear(); requests = [];
    submit = vi.fn(() => new Promise<FeedbackSubmitResult>(resolve => requests.push({ resolve })));
    TestBed.configureTestingModule({ providers: [{ provide: FeedbackService, useValue: { submitTypedFeedback: submit } }] });
    composer = TestBed.inject(FeedbackComposerService);
    composer.setSession('student-token'); composer.open('Courses', '/courses?token=private#secret');
  });
  const fill = (value: FeedbackComposerService) => value.change({ type: 'defect', summary: 'Search resets', message: 'The category disappears', reproductionSteps: 'Choose a category, then search', expectedBehavior: 'Keep the category' });

  it('AC02 sends the typed details and query-free context without inventing a rating', async () => {
    fill(composer); const pending = composer.submit();
    expect(submit.mock.calls[0][1]).toMatchObject({ type: 'defect', path: '/courses', summary: 'Search resets', expectedBehavior: 'Keep the category' });
    expect(submit.mock.calls[0][1].rating).toBeUndefined();
    requests[0].resolve({ ok: true }); await pending;
    expect(composer.submitted()).toBe(true);
    expect(composer.summary()).toBe('');
  });
  it('AC05 close and reopen while sending retains the busy guard and sends only once', async () => {
    fill(composer); const pending = composer.submit(); composer.close(); composer.open('Home', '/');
    await composer.submit(); expect(composer.submitting()).toBe(true); expect(submit).toHaveBeenCalledTimes(1);
    expect(composer.page()).toBe('Courses');
    requests[0].resolve({ ok: true }); await pending;
    expect(composer.submitting()).toBe(false);
  });
  it('AC05 preserves draft on failure and close/reopen, and allows a retry', async () => {
    fill(composer); const pending = composer.submit(); requests[0].resolve({ ok: false, message: 'Storage unavailable' }); await pending;
    expect(composer.error()).toBe('Storage unavailable');
    composer.close(); composer.open('Courses', '/courses'); expect(composer.summary()).toBe('Search resets');
    const retry = composer.submit(); requests[1].resolve({ ok: true }); await retry;
    expect(composer.submitted()).toBe(true);
  });
  it('AC05 discards the old account draft and ignores stale results without clearing a new send', async () => {
    fill(composer); const old = composer.submit(); composer.setSession('other-token');
    expect(composer.message()).toBe(''); expect(composer.isOpen()).toBe(false);
    composer.open('Home', '/'); fill(composer); const current = composer.submit();
    requests[0].resolve({ ok: false, message: 'Old error' }); await old;
    expect(composer.error()).toBe(''); expect(composer.submitting()).toBe(true);
    requests[1].resolve({ ok: true }); await current; expect(composer.submitted()).toBe(true);
  });
  it('AC04 validates meaningful fields and AC03 omits retained defect-only fields after switching type', async () => {
    await composer.submit(); expect(submit).not.toHaveBeenCalled(); expect(composer.error()).toBeTruthy();
    fill(composer); composer.change({ type: 'change-request' }); const pending = composer.submit();
    expect(submit.mock.calls[0][1].reproductionSteps).toBeUndefined();
    requests[0].resolve({ ok: true }); await pending;
  });
});
