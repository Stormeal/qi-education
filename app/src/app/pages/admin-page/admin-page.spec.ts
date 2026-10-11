import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ApiClientService } from '../../services/api-client.service';
import { AdminPage } from './admin-page';

const user = (id: string, role: string, status = 'active') =>
  ({ id, email: `${id}@example.test`, displayName: `User ${id}`, role, status, createdAt: '2026-10-01T00:00:00.000Z' });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe('US-A001 user management on the Admin page', () => {
  let calls: { url: string; method: string; authorization?: string; body?: unknown }[];
  let replies: Record<string, () => Response>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('qi-education:admin-section', 'users');
    calls = [];
    replies = {
      'GET /admin/users': () => json(200, { users: [user('admin', 'admin'), user('ann', 'student'), user('old', 'student', 'inactive')], total: 3 }),
    };
    const fetch = async (url: string, init: RequestInit) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, authorization: (init.headers as Record<string, string>)['authorization'],
        body: init.body ? JSON.parse(init.body as string) : undefined });
      return (replies[`${method} ${url}`] ?? replies[`${method} ${url.split('?')[0]}`] ?? (() => json(404, { message: 'Not found' })))();
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApiClientService, useValue: { fetch } }] });
  });
  afterEach(() => vi.restoreAllMocks());

  async function setup() {
    const fixture = TestBed.createComponent(AdminPage);
    const inputs = { appVersion: 'test', currentYear: 2026, student: { name: 'Admin', currentRole: 'Admin', targetRole: '', pathProgress: null },
      userEmail: 'admin@example.test', userRoleLabel: 'Admin', feedback: [], feedbackLoading: false, feedbackError: '', isFeedbackOpen: false,
      feedbackSubmitted: false, feedbackPage: '', feedbackRating: '', feedbackText: '', feedbackSubmitting: false, feedbackSubmitError: '',
      feedbackOptions: [], authToken: 'admin-token', currentUserId: 'admin' };
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    const host = fixture.nativeElement as HTMLElement;
    const settle = (): Promise<void> => vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.querySelector('.admin-user-list, .admin-user-error, .admin-user-status span')).not.toBeNull();
      expect(host.textContent).not.toContain('Working…');
    });
    await settle();
    const rows = () => [...host.querySelectorAll<HTMLElement>('.admin-user-list li')];
    return { fixture, host, settle, rows, status: () => host.querySelector('.admin-user-status')!.textContent!.replace(/\s+/g, ' ').trim(),
      error: () => host.querySelector('.admin-user-error')?.textContent?.trim() ?? '' };
  }

  it('lists users with the session, and searches by what was typed', async () => {
    const page = await setup();
    expect(calls[0]).toMatchObject({ url: '/admin/users', method: 'GET', authorization: 'Bearer admin-token' });
    expect(page.rows().map((row) => row.querySelector('strong')!.textContent)).toEqual(['User admin', 'User ann', 'User old']);
    expect(page.status()).toBe('3 users.');
    replies['GET /admin/users'] = () => json(200, { users: [user('ann', 'student')], total: 1 });
    const input = page.host.querySelector<HTMLInputElement>('#admin-user-search')!;
    input.value = ' Ann B '; input.dispatchEvent(new Event('input'));
    page.host.querySelector('form[role="search"]')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => { page.fixture.detectChanges(); expect(page.rows()).toHaveLength(1); });
    expect(calls.at(-1)!.url).toBe('/admin/users?search=Ann%20B');
    expect(page.status()).toBe('1 user.');
  });

  it('says when more users match than are shown, and when nobody matches', async () => {
    replies['GET /admin/users'] = () => json(200, { users: [user('ann', 'student')], total: 120 });
    expect((await setup()).status()).toBe('Showing 1 of 120 users. Search to narrow it down.');
    TestBed.resetTestingModule();
  });

  it('AC01 changes a role after confirmation and shows the stored result', async () => {
    replies['PATCH /admin/users/ann/role'] = () => json(200, user('ann', 'teacher'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const page = await setup();
    const select = page.rows()[1].querySelector('select')!;
    select.value = 'teacher'; select.dispatchEvent(new Event('change'));
    await page.settle();
    expect(confirm.mock.calls[0][0]).toContain('Change User ann from Student to Teacher?');
    expect(calls.at(-1)).toMatchObject({ url: '/admin/users/ann/role', method: 'PATCH', body: { role: 'teacher' } });
    expect(page.status()).toContain('User ann is now Teacher.');
    expect(page.rows()[1].querySelector('select')!.value).toBe('teacher');
  });

  it('AC01 puts the old role back when the change is cancelled or refused', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const page = await setup();
    const select = page.rows()[1].querySelector('select')!;
    select.value = 'admin'; select.dispatchEvent(new Event('change'));
    expect(select.value).toBe('student');
    expect(calls).toHaveLength(1);
    confirm.mockReturnValue(true);
    replies['PATCH /admin/users/ann/role'] = () => json(503, { message: 'The user store is unavailable.' });
    select.value = 'admin'; select.dispatchEvent(new Event('change'));
    await page.settle();
    expect(page.error()).toBe('The role of User ann was not changed. The user store is unavailable.');
    expect(page.rows()[1].querySelector('select')!.value).toBe('student');
  });

  it('does not offer a change of the admin\'s own role, or a reset for an account that is not active', async () => {
    const page = await setup();
    expect(page.rows()[0].querySelector('select')!.disabled).toBe(true);
    expect(page.rows()[0].textContent).toContain('Your own role cannot be changed here.');
    expect(page.rows()[1].querySelector('select')!.disabled).toBe(false);
    expect(page.rows()[2].textContent).toContain('Not active');
    expect(page.rows()[2].querySelector<HTMLButtonElement>('app-button button')!.disabled).toBe(true);
  });

  it('sends a reset link after confirmation and reports a failure in plain words', async () => {
    replies['POST /admin/users/ann/password-reset'] = () => json(202, { message: 'A reset link was sent to ann@example.test.' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const page = await setup();
    const button = () => page.rows()[1].querySelector<HTMLButtonElement>('app-button button')!;
    button().click();
    await page.settle();
    expect(confirm.mock.calls[0][0]).toContain('Send a password reset link to ann@example.test?');
    expect(calls.at(-1)).toMatchObject({ url: '/admin/users/ann/password-reset', method: 'POST', authorization: 'Bearer admin-token' });
    expect(page.status()).toContain('A reset link was sent to ann@example.test.');
    replies['POST /admin/users/ann/password-reset'] = () => json(503, { message: 'We could not send email right now. Please try again later.' });
    button().click();
    await page.settle();
    expect(page.error()).toBe('No reset link was sent to ann@example.test. We could not send email right now. Please try again later.');
    expect(page.status()).not.toContain('A reset link was sent');
  });
});
