import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { LoginState } from '../../app.models';
import { ApiClientService } from '../../services/api-client.service';
import { AppStateService } from '../../services/app-state.service';
import { ConfirmEmailPage } from './confirm-email-page';

type Call = { url: string; body: unknown; authorization?: string };
const token = 'a'.repeat(43);

describe('US-L014 confirm email page', () => {
  let calls: Call[];
  let replies: Record<string, Response[]>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    calls = [];
    replies = {};
    const fetch = async (url: string, init: RequestInit = {}) => {
      if (init.method !== 'POST') return new Response(JSON.stringify({ message: 'Not part of this test' }), { status: 404 });
      calls.push({ url, body: JSON.parse(init.body as string), authorization: (init.headers as Record<string, string>)['authorization'] });
      return replies[url]?.shift() ?? new Response(null, { status: 204 });
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApiClientService, useValue: { fetch, onUnauthorized: () => {}, setSessionContextProvider: () => {} } }] });
  });
  afterEach(() => { window.history.replaceState(null, '', '/'); vi.restoreAllMocks(); });

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  function signIn(emailConfirmed: boolean): AppStateService {
    const state = TestBed.inject(AppStateService);
    state.loginState.set({ token: 'session', permissions: { canCreateCourses: false, hasAdminAccess: false },
      user: { id: 'u', email: 'new@example.test', displayName: 'New learner', role: 'student', status: 'active', createdAt: '', enrolledCourseIds: [], emailConfirmed } } as LoginState);
    return state;
  }
  async function open(hash = `#token=${token}`) {
    window.history.replaceState(null, '', `/confirm-email${hash}`);
    const fixture = TestBed.createComponent(ConfirmEmailPage);
    const host = fixture.nativeElement as HTMLElement;
    const heading = () => host.querySelector('h1')!.textContent!.trim();
    await vi.waitFor(() => { fixture.detectChanges(); expect(heading()).not.toContain('Confirming'); });
    return { fixture, host, heading };
  }

  it('AC01 confirms from the link without sign-in and removes the token from the address bar', async () => {
    const page = await open();
    expect(calls).toEqual([{ url: '/auth/email-confirmation/confirm', body: { token }, authorization: undefined }]);
    expect(page.heading()).toBe('Your email address is confirmed');
    expect(window.location.hash).toBe('');
    expect(page.host.textContent).toContain('Go to log in');
  });

  it('AC01 hides the Home notice in this tab once confirmed', async () => {
    const state = signIn(false);
    expect(state.emailNeedsConfirmation()).toBe(true);
    await open();
    expect(state.emailNeedsConfirmation()).toBe(false);
  });

  it('AC01 a used link offers a new one to the signed-in, unconfirmed account', async () => {
    replies['/auth/email-confirmation/confirm'] = [json(410, { message: 'This confirmation link is no longer valid. Request a new one.', code: 'confirm-link-invalid' })];
    replies['/auth/email-confirmation/resend'] = [json(202, { message: 'We have sent a new link to new@example.test. It works for 24 hours.' })];
    signIn(false);
    const page = await open();
    expect(page.heading()).toBe('This link no longer works');
    const send = [...page.host.querySelectorAll('button')].find((button) => button.textContent!.includes('Send a new link'))!;
    send.click();
    await vi.waitFor(() => { page.fixture.detectChanges(); expect(page.host.textContent).toContain('We have sent a new link to new@example.test.'); });
    expect(calls[1]).toEqual({ url: '/auth/email-confirmation/resend', body: {}, authorization: 'Bearer session' });
  });

  it('AC01 without a token or sign-in, explains how to get a new link', async () => {
    const page = await open('');
    expect(calls).toEqual([]);
    expect(page.heading()).toBe('This link no longer works');
    expect(page.host.textContent).toContain('Log in, then choose Send a new link on your Home page.');
  });

  it('keeps the link usable after a temporary failure and retries it', async () => {
    replies['/auth/email-confirmation/confirm'] = [json(503, { message: 'The service is briefly unavailable.' })];
    const page = await open();
    expect(page.heading()).toBe('We could not confirm your address');
    expect(page.host.textContent).toContain('The service is briefly unavailable.');
    [...page.host.querySelectorAll('button')].find((button) => button.textContent!.includes('Try again'))!.click();
    await vi.waitFor(() => { page.fixture.detectChanges(); expect(page.heading()).toBe('Your email address is confirmed'); });
    expect(calls).toHaveLength(2);
  });

  it('AC02 a fourth link within the hour shows the wait', async () => {
    replies['/auth/email-confirmation/confirm'] = [json(410, { message: 'gone', code: 'confirm-link-invalid' })];
    replies['/auth/email-confirmation/resend'] = [json(429, { message: 'You have asked for several links in a short time. Try again in 40 minutes.', code: 'too-many-requests' })];
    signIn(false);
    const page = await open();
    [...page.host.querySelectorAll('button')].find((button) => button.textContent!.includes('Send a new link'))!.click();
    await vi.waitFor(() => { page.fixture.detectChanges(); expect(page.host.textContent).toContain('Try again in 40 minutes.'); });
  });
});
