import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import type { LoginState } from '../../app.models';
import { TERMS_DOCUMENTS } from '../../legal/terms';
import { TermsPage } from '../../pages/terms-page/terms-page';
import { ApiClientService } from '../../services/api-client.service';
import { AppStateService } from '../../services/app-state.service';
import { AuthService } from '../../services/auth.service';
import { TermsGate } from './terms-gate';

const session: LoginState = { token: 'h.eyJzdWIiOiJ1MSJ9.s', user: { id: 'u1', role: 'student', email: 'u1@example.test', displayName: 'U One',
  status: 'active', createdAt: '', enrolledCourseIds: [] }, permissions: { canCreateCourses: false, hasAdminAccess: false } };

describe('US-P022 terms acceptance', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  async function start(termsPending?: boolean) {
    localStorage.setItem('qiEducationSession', JSON.stringify(session));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fetch = vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockImplementation(async () => new Response('[]'));
    const auth = TestBed.inject(AuthService);
    vi.spyOn(auth, 'restoreSession').mockResolvedValue({ user: session.user, permissions: session.permissions, termsPending });
    const state = TestBed.inject(AppStateService);
    await vi.waitFor(() => expect(state.termsPending()).toBe(termsPending === true));
    return { state, auth, fetch };
  }

  it('raises the gate at load only when the API says so, and a missing flag means accepted', async () => {
    expect((await start(true)).state.termsPending()).toBe(true);
    TestBed.resetTestingModule(); localStorage.clear();
    expect((await start(undefined)).state.termsPending()).toBe(false);
  });

  it('accepting posts the ToS id and clears the gate; a failure keeps it with a message', async () => {
    const { state, fetch } = await start(true);
    fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await state.acceptTerms();
    expect(state.termsPending()).toBe(true);
    expect(state.termsAcceptError()).toContain('could not be saved');
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await state.acceptTerms();
    const [path, init] = fetch.mock.calls.at(-1)!;
    expect(path).toBe('/users/me/terms/accept');
    expect(JSON.parse(String(init!.body))).toEqual({ documentId: 'tos' });
    expect(state.termsPending()).toBe(false);
    expect(state.termsAcceptError()).toBe('');
  });

  it('shows the current Terms of Service in the gate and emits accept and log out', () => {
    const fixture = TestBed.createComponent(TermsGate); fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(page.textContent).toContain(TERMS_DOCUMENTS.tos.sections[0].heading);
    const events: string[] = [];
    fixture.componentInstance.accepted.subscribe(() => events.push('accept'));
    fixture.componentInstance.loggedOut.subscribe(() => events.push('logout'));
    const button = (label: string) => [...page.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!;
    button('I accept').click(); button('Log out').click();
    expect(events).toEqual(['accept', 'logout']);
  });

  it.each(['tos', 'purchase'] as const)('renders the %s document from the constant on its page', document => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { data: { document } } } }] });
    const fixture = TestBed.createComponent(TermsPage); fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    const doc = TERMS_DOCUMENTS[document];
    expect(text).toContain(doc.title);
    expect(text).toContain(`Version ${doc.version}, effective ${doc.effectiveDate}`);
    expect(text).toContain(`${doc.sections.length}. ${doc.sections.at(-1)!.heading}`);
  });
});
