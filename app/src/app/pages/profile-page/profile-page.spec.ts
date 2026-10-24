import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ApiClientService } from '../../services/api-client.service';
import { ProfilePage } from './profile-page';

function openTab(fixture: ComponentFixture<ProfilePage>, label: string): void {
  [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) => tab.textContent?.trim() === label)!.click();
  fixture.detectChanges();
}

describe('US-L013 change password on the profile page', () => {
  let calls: { url: string; authorization?: string; body: Record<string, string> }[];
  let reply: () => Response;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    calls = [];
    reply = () => new Response(null, { status: 204 });
    const fetch = async (url: string, init: RequestInit) => {
      calls.push({ url, authorization: (init.headers as Record<string, string>)['authorization'], body: JSON.parse(init.body as string) });
      return reply();
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApiClientService, useValue: { fetch } }] });
  });
  afterEach(() => vi.restoreAllMocks());

  function setup() {
    const fixture = TestBed.createComponent(ProfilePage);
    const inputs = { appVersion: 'test', currentYear: 2026, displayName: 'Learner', email: 'learner@example.test', roleLabel: 'Student',
      canAccessAdmin: false, memberSince: '', enrolledCount: 0, avatarColor: '#2f4f43', avatarColorOptions: ['#2f4f43'], bio: '', jobTitle: '',
      company: '', learningGoals: '', profileSaving: false, profileSaved: false, profileDirty: false, isFeedbackOpen: false,
      feedbackSubmitted: false, feedbackPage: '', feedbackRating: '', feedbackText: '', feedbackSubmitting: false, feedbackError: '',
      feedbackOptions: [], authToken: 'session-token' };
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
    openTab(fixture, 'Password');
    const form = (fixture.nativeElement as HTMLElement).querySelector<HTMLFormElement>('form[aria-labelledby="profile-password-title"]')!;
    const type = (id: string, value: string) => {
      const input = form.querySelector<HTMLInputElement>(`#profile-password-${id}`)!;
      input.value = value; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    };
    const fill = (current: string, next: string, repeat = next) => { type('current', current); type('new', next); type('repeat', repeat); };
    const submit = async () => {
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await vi.waitFor(() => { fixture.detectChanges(); expect(form.textContent).not.toContain('Changing…'); });
    };
    const values = () => ['current', 'new', 'repeat'].map((id) => form.querySelector<HTMLInputElement>(`#profile-password-${id}`)!.value);
    return { form, fill, submit, values, status: () => form.querySelector('[role="status"]')!.textContent!.trim(),
      button: () => form.querySelector<HTMLButtonElement>('button')! };
  }

  it('AC01 sends the current and the new password with the session, then clears the form', async () => {
    const page = setup();
    expect(page.button().disabled).toBe(true);
    page.fill('OldPassword1', 'NewPassword1');
    expect(page.button().disabled).toBe(false);
    await page.submit();
    expect(calls).toEqual([{ url: '/users/me/password', authorization: 'Bearer session-token',
      body: { currentPassword: 'OldPassword1', newPassword: 'NewPassword1' } }]);
    expect(page.status()).toContain('Your password is changed');
    expect(page.values()).toEqual(['', '', '']);
  });

  it('AC01 a wrong current password says so and keeps what was typed', async () => {
    reply = () => new Response(JSON.stringify({ message: 'Your current password is not correct.', code: 'current-password-incorrect' }), { status: 400 });
    const page = setup();
    page.fill('WrongPassword1', 'NewPassword1');
    await page.submit();
    expect(page.status()).toBe('Your current password is not correct.');
    expect(page.values()).toEqual(['WrongPassword1', 'NewPassword1', 'NewPassword1']);
  });

  it('AC01 catches two different new passwords before anything is sent, and shows the API rule otherwise', async () => {
    const page = setup();
    page.fill('OldPassword1', 'NewPassword1', 'NewPassword2');
    await page.submit();
    expect(page.status()).toBe('The two new passwords are not the same.');
    expect(calls).toHaveLength(0);
    reply = () => new Response(JSON.stringify({ message: 'Password must include at least one number' }), { status: 400 });
    page.fill('OldPassword1', 'NoNumberHere');
    await page.submit();
    expect(page.status()).toBe('Password must include at least one number');
  });
});

describe('US-L024 purchases and receipts on the profile page', () => {
  let replies: Record<string, () => Response>;
  let requests: { url: string; body?: Record<string, string> }[];
  const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });
  const purchase = { id: 'cs_1', courseId: 'c1', courseTitle: 'Test Design', amountDkk: 499, paidAt: '2026-10-20T12:00:00.000Z', refunded: false };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    requests = [];
    replies = { '/users/me/payments': json({ payments: [] }) };
    const fetch = async (url: string, init: RequestInit) => {
      requests.push({ url, ...(init.body ? { body: JSON.parse(init.body as string) } : {}) });
      return replies[url]();
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApiClientService, useValue: { fetch } }] });
  });

  async function setup() {
    const fixture = TestBed.createComponent(ProfilePage);
    const inputs = { appVersion: 'test', currentYear: 2026, displayName: 'Learner', email: 'learner@example.test', roleLabel: 'Student',
      canAccessAdmin: false, memberSince: '', enrolledCount: 0, avatarColor: '#2f4f43', avatarColorOptions: ['#2f4f43'], bio: '', jobTitle: '',
      company: '', learningGoals: '', profileSaving: false, profileSaved: false, profileDirty: false, isFeedbackOpen: false,
      feedbackSubmitted: false, feedbackPage: '', feedbackRating: '', feedbackText: '', feedbackSubmitting: false, feedbackError: '',
      feedbackOptions: [], authToken: 'session-token' };
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    const assigned: string[] = [];
    (fixture.componentInstance as unknown as { assignLocation: (url: string) => void }).assignLocation = url => assigned.push(url);
    fixture.detectChanges();
    openTab(fixture, 'Purchases');
    const section = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[aria-labelledby="profile-billing-title"]')!;
    await vi.waitFor(() => { fixture.detectChanges(); expect(section.textContent).not.toContain('Loading your purchases'); });
    const click = async (label: string) => {
      const button = [...section.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === label)!;
      button.click();
      await vi.waitFor(() => { fixture.detectChanges(); expect(button.disabled).toBe(false); });
    };
    return { section, click, assigned, status: () => section.querySelector('.profile-billing-actions [role="status"]')?.textContent?.trim() };
  }

  it('lists nothing before the first purchase and the portal says so', async () => {
    replies['/users/me/billing-portal'] = json({ message: 'No payments yet.' }, 404);
    const page = await setup();
    expect(page.section.querySelector('h2')?.textContent).toBe('Purchases and receipts');
    expect(page.section.textContent).toContain('No purchases yet.');
    await page.click('Manage saved card');
    expect(page.status()).toBe('No payments yet.');
    expect(page.assigned).toEqual([]);
  });

  it('lists each purchase and opens its Stripe receipt', async () => {
    replies['/users/me/payments'] = json({ payments: [purchase, { ...purchase, id: 'cs_0', courseTitle: 'Old course', refunded: true }] });
    replies['/users/me/payments/cs_1/receipt'] = json({ url: 'https://pay.stripe.test/receipts/r_1' });
    replies['/users/me/payments/cs_0/receipt'] = json({ message: 'This receipt is not available.' }, 404);
    const page = await setup();
    const cells = (row: Element) => [...row.querySelectorAll('strong, span')].map((cell) => cell.textContent!.trim()).filter(Boolean);
    expect([...page.section.querySelectorAll('.profile-purchases li')].map(cells)).toEqual([
      ['Test Design', '20 Oct 2026', '499 DKK'], ['Old course', '20 Oct 2026', '499 DKK', 'Refunded']]);
    await page.click('Receipt');
    expect(page.assigned).toEqual(['https://pay.stripe.test/receipts/r_1']);
    (page.section.querySelectorAll<HTMLButtonElement>('.profile-purchases button')[1]).click();
    await vi.waitFor(() => expect(page.status()).toBe('This receipt is not available.'));
  });

  it('AC07 opens the Stripe customer portal', async () => {
    replies['/users/me/billing-portal'] = json({ url: 'https://billing.stripe.test/session' });
    const page = await setup();
    await page.click('Manage saved card');
    const portal = requests.find((request) => request.url === '/users/me/billing-portal')!;
    expect(portal.body?.['returnUrl']).toBe(`${window.location.origin}${window.location.pathname}`);
    expect(page.assigned).toEqual(['https://billing.stripe.test/session']);
  });
});
