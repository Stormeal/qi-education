import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ApiClientService } from '../../services/api-client.service';
import { ProfilePage } from './profile-page';

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
