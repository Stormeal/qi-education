import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { PrivacyService, type PrivacyExport } from '../../services/privacy.service';
import { ProfilePage } from './profile-page';

const exported = {
  exportedAt: '2026-10-31T12:00:00.000Z',
  account: { id: 'u1', displayName: 'Learner', email: 'learner@example.test', role: 'student' },
  profile: null, instructorProfile: null, enrolments: ['c1', 'c2'], progress: [{}], notes: [], lessonFeedback: [],
  careers: { current: null, legacySelection: null }, payments: [{}], organizations: null, feedback: [], notifications: [{}, {}, {}], authoring: [],
} as unknown as PrivacyExport;

describe('US-P021 Privacy & data tab', () => {
  let privacy: { exportMyData: ReturnType<typeof vi.fn>; eraseMyAccount: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    privacy = { exportMyData: vi.fn(), eraseMyAccount: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: PrivacyService, useValue: privacy }] });
  });
  afterEach(() => vi.restoreAllMocks());

  function setup() {
    const fixture: ComponentFixture<ProfilePage> = TestBed.createComponent(ProfilePage);
    const inputs = { appVersion: 'test', currentYear: 2026, displayName: 'Learner', email: 'learner@example.test', roleLabel: 'Student',
      canAccessAdmin: false, memberSince: '', enrolledCount: 0, avatarColor: '#2f4f43', avatarColorOptions: ['#2f4f43'], bio: '', jobTitle: '',
      company: '', learningGoals: '', profileSaving: false, profileSaved: false, profileDirty: false, isFeedbackOpen: false,
      feedbackSubmitted: false, feedbackPage: '', feedbackRating: '', feedbackText: '', feedbackSubmitting: false, feedbackError: '',
      feedbackOptions: [], authToken: 'session-token' };
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    [...page.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(tab => tab.textContent?.trim() === 'Privacy & data')!.click();
    fixture.detectChanges();
    const button = (label: string) => [...page.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label)!;
    const type = (id: string, value: string) => {
      const input = page.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    };
    const settle = () => vi.waitFor(() => { fixture.detectChanges(); expect(page.textContent).not.toMatch(/Preparing…|Deleting…/); });
    const saved: { name: string; json: string }[] = [];
    (fixture.componentInstance as unknown as { saveFile: (name: string, json: string) => void }).saveFile = (name, json) => saved.push({ name, json });
    const printed = vi.fn();
    (fixture.componentInstance as unknown as { print: () => void }).print = printed;
    return { fixture, page, button, type, settle, saved, printed };
  }

  it('downloads the export as JSON and shows a printable summary', async () => {
    privacy.exportMyData.mockResolvedValue({ ok: true, body: exported });
    const { page, button, settle, saved, printed } = setup();
    button('Download JSON').click(); await settle();
    expect(privacy.exportMyData).toHaveBeenCalledWith('session-token');
    expect(saved[0].name).toBe('qi-academy-data-2026-10-31.json');
    expect(JSON.parse(saved[0].json)).toEqual(exported);
    const summary = page.querySelector('.privacy-summary')!.textContent!;
    expect(summary).toContain('learner@example.test');
    expect(summary).toContain('2 courses');
    expect(summary).toContain('3 notifications');
    button('Print summary').click();
    expect(printed).toHaveBeenCalled();
  });

  it('shows an export failure without a summary', async () => {
    privacy.exportMyData.mockResolvedValue({ ok: false, status: 503, message: 'Try again later.' });
    const { page, button, settle, saved } = setup();
    button('Download JSON').click(); await settle();
    expect(page.textContent).toContain('Try again later.');
    expect(page.querySelector('.privacy-summary')).toBeNull();
    expect(saved).toEqual([]);
  });

  it('keeps Delete disabled until a password and the exact word DELETE are entered', () => {
    const { button, type } = setup();
    expect(button('Delete my account').disabled).toBe(true);
    type('privacy-delete-password', 'Secret123');
    type('privacy-delete-confirm', 'delete');
    expect(button('Delete my account').disabled).toBe(true);
    type('privacy-delete-confirm', 'DELETE');
    expect(button('Delete my account').disabled).toBe(false);
  });

  it('shows a wrong password and lists organizations that block deletion', async () => {
    const { page, button, type, settle } = setup();
    type('privacy-delete-password', 'Wrong123'); type('privacy-delete-confirm', 'DELETE');
    privacy.eraseMyAccount.mockResolvedValueOnce({ ok: false, status: 400, code: 'password-incorrect', message: 'Your password is not correct.' });
    button('Delete my account').click(); await settle();
    expect(privacy.eraseMyAccount).toHaveBeenCalledWith('session-token', 'Wrong123', 'DELETE');
    expect(page.querySelector('[role="alert"]')!.textContent).toContain('Your password is not correct.');
    privacy.eraseMyAccount.mockResolvedValueOnce({ ok: false, status: 409, message: 'transfer-organization-first', organizations: [{ id: 'o1', name: 'Bugfinders' }] });
    button('Delete my account').click(); await settle();
    expect(page.textContent).toContain('Bugfinders');
    expect(page.querySelector('a[href="/organization"]')).not.toBeNull();
  });

  it('shows the deleted state and signs out from Close', async () => {
    privacy.eraseMyAccount.mockResolvedValue({ ok: true, body: undefined });
    const { fixture, page, button, type, settle } = setup();
    const loggedOut = vi.fn(); fixture.componentInstance.loggedOut.subscribe(loggedOut);
    type('privacy-delete-password', 'Secret123'); type('privacy-delete-confirm', 'DELETE');
    button('Delete my account').click(); await settle();
    expect(page.textContent).toContain('Your account and data have been deleted');
    expect(page.querySelector('#privacy-delete-password')).toBeNull();
    button('Close').click();
    expect(loggedOut).toHaveBeenCalled();
  });
});
