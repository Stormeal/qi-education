import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ApiClientService } from '../../services/api-client.service';
import { PasswordResetPage } from './password-reset-page';

type Call = { url: string; body: Record<string, string> };

describe('US-L004 forgot password and reset page', () => {
  let calls: Call[];
  let replies: Record<string, Response>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    calls = [];
    replies = {};
    const fetch = async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      return replies[url] ?? new Response(null, { status: 204 });
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApiClientService, useValue: { fetch } }] });
  });
  afterEach(() => { window.history.replaceState(null, '', '/'); vi.restoreAllMocks(); });

  function open(hash = '') {
    window.history.replaceState(null, '', `/reset-password${hash}`);
    const fixture = TestBed.createComponent(PasswordResetPage);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const type = (selector: string, value: string) => {
      const input = host.querySelector<HTMLInputElement>(selector)!;
      input.value = value; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    };
    // The link check and each submit answer asynchronously; wait until the page has left its waiting state.
    const settle = (): Promise<void> => vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.querySelector('h1')!.textContent).not.toContain('Checking');
      expect(host.textContent).not.toMatch(/Sending…|Saving…/);
    });
    const submit = async () => {
      host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve)); await settle();
    };
    return { fixture, host, type, submit, settle, heading: () => host.querySelector('h1')!.textContent!.trim() };
  }
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it('AC01 asks for an address and shows the same reply whether or not the account exists', async () => {
    replies['/auth/password-reset/request'] = json(202, { message: 'If an account exists for this address, we have sent a reset link.' });
    const page = open();
    expect(page.heading()).toBe('Forgot your password?');
    page.type('#reset-email', '  someone@example.test ');
    await page.submit();
    expect(calls).toEqual([{ url: '/auth/password-reset/request', body: { email: 'someone@example.test' } }]);
    expect(page.heading()).toBe('Check your email');
    expect(page.host.textContent).toContain('If an account exists for this address, we have sent a reset link.');
    expect(page.host.textContent).toContain('spam folder');
  });

  it('AC05 says to try again later when the mail cannot be sent and keeps the form', async () => {
    replies['/auth/password-reset/request'] = json(503, { message: 'We could not send email right now. Please try again later.' });
    const page = open();
    page.type('#reset-email', 'someone@example.test');
    await page.submit();
    expect(page.heading()).toBe('Forgot your password?');
    expect(page.host.querySelector('[role="alert"]')!.textContent).toContain('try again later');
    expect(page.host.querySelector<HTMLInputElement>('#reset-email')!.value).toBe('someone@example.test');
  });

  it('AC03 opened from the mail: checks the link, hides it from the address bar and changes the password', async () => {
    const page = open('#token=secret-token');
    expect(window.location.hash).toBe('');
    await page.settle();
    expect(calls[0]).toEqual({ url: '/auth/password-reset/check', body: { token: 'secret-token' } });
    expect(page.heading()).toBe('Choose a new password');

    page.type('#reset-password', 'NewPassword1'); page.type('#reset-confirmation', 'NewPassword2');
    await page.submit();
    expect(page.host.querySelector('[role="alert"]')!.textContent).toContain('not the same');
    expect(calls).toHaveLength(1);

    page.type('#reset-confirmation', 'NewPassword1');
    await page.submit();
    expect(calls[1]).toEqual({ url: '/auth/password-reset/confirm', body: { token: 'secret-token', password: 'NewPassword1' } });
    expect(page.heading()).toBe('Your password is changed');
    expect([...page.host.querySelectorAll('a')].at(-1)!.textContent).toContain('Go to log in');
  });

  it('AC03 a link pasted into a tab that already shows the page is read as a fresh visit', () => {
    const page = open();
    const reload = vi.spyOn(page.fixture.componentInstance as unknown as { reloadPage(): void }, 'reloadPage').mockImplementation(() => {});
    window.history.replaceState(null, '', '/reset-password#token=secret-token');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(reload).toHaveBeenCalledTimes(1);
    window.history.replaceState(null, '', '/reset-password#other');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('AC03 an expired, used or malformed link offers a new one', async () => {
    replies['/auth/password-reset/check'] = json(410, { message: 'This reset link is no longer valid. Request a new one.', code: 'reset-link-invalid' });
    const page = open('#token=old');
    await page.settle();
    expect(page.heading()).toBe('This link no longer works');
    page.host.querySelector<HTMLButtonElement>('button')!.click(); page.fixture.detectChanges();
    expect(page.heading()).toBe('Forgot your password?');
  });

  it('AC02 shows the password rule from the API and keeps the link usable', async () => {
    replies['/auth/password-reset/confirm'] = json(400, { message: 'Password must include at least one number' });
    const page = open('#token=secret-token');
    await page.settle();
    page.type('#reset-password', 'NoNumberHere'); page.type('#reset-confirmation', 'NoNumberHere');
    await page.submit();
    expect(page.heading()).toBe('Choose a new password');
    expect(page.host.querySelector('[role="alert"]')!.textContent).toContain('at least one number');
  });

  it('AC02 a link that stopped working while the form was open says so', async () => {
    const page = open('#token=secret-token');
    await page.settle();
    replies['/auth/password-reset/confirm'] = json(410, { message: 'gone', code: 'reset-link-invalid' });
    page.type('#reset-password', 'NewPassword1'); page.type('#reset-confirmation', 'NewPassword1');
    await page.submit();
    expect(page.heading()).toBe('This link no longer works');
  });
});
