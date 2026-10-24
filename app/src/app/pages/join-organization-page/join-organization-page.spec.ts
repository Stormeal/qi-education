import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OrganizationService } from '../../services/organization.service';
import { JoinOrganizationPage, PENDING_INVITATION_KEY } from './join-organization-page';

const consent = 'Joining shares your career and course progress with QA Team';

describe('join organization page (US-O001 release 1)', () => {
  let fixture: ComponentFixture<JoinOrganizationPage>;
  let check: { ok: boolean; status?: number; message?: string; body?: unknown };
  let accept: { ok: boolean; status?: number; message?: string; body?: unknown };
  let accepted: string[];

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    accepted = [];
    check = { ok: true, body: { organizationName: 'QA Team', email: 'mads@acme.test', consentText: consent } };
    accept = { ok: true, body: { organization: { displayName: 'QA Team' } } };
    history.replaceState(null, '', '/join-organization#token=secret-123');
    await TestBed.configureTestingModule({ imports: [JoinOrganizationPage], providers: [provideRouter([]),
      { provide: OrganizationService, useValue: {
        checkInvitation: async () => check,
        acceptInvitation: async (_t: string, token: string) => { accepted.push(token); return accept; },
      } },
    ] }).compileComponents();
  });

  async function render(signedInEmail: string | null): Promise<HTMLElement> {
    fixture = TestBed.createComponent(JoinOrganizationPage);
    fixture.componentRef.setInput('authToken', signedInEmail ? 'token' : '');
    fixture.componentRef.setInput('signedInEmail', signedInEmail ?? '');
    fixture.detectChanges();
    for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r)); fixture.detectChanges(); }
    return fixture.nativeElement as HTMLElement;
  }
  const button = (page: HTMLElement, text: string) => [...page.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

  it('reads the token from the fragment, removes it from the address and keeps it for after sign-in', async () => {
    const page = await render(null);
    expect(location.hash).toBe('');
    expect(sessionStorage.getItem(PENDING_INVITATION_KEY)).toBe('secret-123');
    expect(page.querySelector('h1')?.textContent).toContain('QA Team');
    expect(page.textContent).toContain(consent);
  });

  it('US-O001-AC05 lets the invited account accept', async () => {
    const page = await render('mads@acme.test');
    button(page, 'Accept and join')!.click();
    for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r)); fixture.detectChanges(); }
    expect(accepted).toEqual(['secret-123']);
    expect(page.textContent).toContain('You joined QA Team.');
    expect(sessionStorage.getItem(PENDING_INVITATION_KEY)).toBeNull();
  });

  it('reads a second invitation link opened in the same tab', async () => {
    const page = await render('mads@acme.test');
    button(page, 'Accept and join')!.click();
    for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r)); fixture.detectChanges(); }
    check = { ok: true, body: { organizationName: 'Test Crew', email: 'mads@acme.test', consentText: consent } };
    history.replaceState(null, '', '/join-organization#token=secret-456');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r)); fixture.detectChanges(); }
    expect(location.hash).toBe('');
    expect(page.querySelector('h1')?.textContent).toContain('Test Crew');
    button(page, 'Accept and join')!.click();
    for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r)); fixture.detectChanges(); }
    expect(accepted).toEqual(['secret-123', 'secret-456']);
  });

  it('DEF-061 ignores a stale check, so the shown invitation is the one accepted', async () => {
    const answers: ((value: unknown) => void)[] = [];
    TestBed.inject(OrganizationService).checkInvitation = (() => new Promise((resolve) => answers.push(resolve))) as never;
    const page = await render('mads@acme.test');
    history.replaceState(null, '', '/join-organization#token=secret-456');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    answers[1]({ ok: true, body: { organizationName: 'Test Crew', email: 'mads@acme.test', consentText: consent } });
    answers[0]({ ok: true, body: { organizationName: 'QA Team', email: 'mads@acme.test', consentText: consent } });
    for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r)); fixture.detectChanges(); }
    expect(page.querySelector('h1')?.textContent).toContain('Test Crew');
    button(page, 'Accept and join')!.click();
    for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r)); fixture.detectChanges(); }
    expect(accepted).toEqual(['secret-456']);
  });

  it('refuses another signed-in account without calling accept', async () => {
    const page = await render('someone@else.test');
    expect(page.textContent).toContain('This invitation is for mads@acme.test. Sign in with that address.');
    expect(button(page, 'Accept and join')).toBeUndefined();
  });

  it('US-O001-AC04 offers sign-up with the invited email when signed out', async () => {
    const page = await render(null);
    const requested: unknown[] = [];
    fixture.componentInstance.authRequested.subscribe((value) => requested.push(value));
    button(page, 'Create an account')!.click();
    button(page, 'Sign in')!.click();
    expect(requested).toEqual([{ mode: 'signup', email: 'mads@acme.test' }, { mode: 'login', email: 'mads@acme.test' }]);
  });

  it('tells a new account to confirm its email to finish joining', async () => {
    accept = { ok: true, body: { state: 'pending-email' } };
    const page = await render('mads@acme.test');
    button(page, 'Accept and join')!.click();
    for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r)); fixture.detectChanges(); }
    expect(page.textContent).toContain('Confirm your email to finish joining.');
  });

  it('US-O001-AC06 explains an invalid invitation without showing the organization', async () => {
    check = { ok: false, status: 410, message: 'gone' };
    const page = await render('mads@acme.test');
    expect(page.textContent).toContain('This invitation is no longer valid. Ask the owner for a new one.');
    expect(page.textContent).not.toContain('QA Team');
    expect(sessionStorage.getItem(PENDING_INVITATION_KEY)).toBeNull();
  });

  it('shows the refusal for someone already in another organization', async () => {
    accept = { ok: false, status: 409, message: 'You are already in another organization. Leave it first, then open this link again.' };
    const page = await render('mads@acme.test');
    button(page, 'Accept and join')!.click();
    for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r)); fixture.detectChanges(); }
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('already in another organization');
  });
});
