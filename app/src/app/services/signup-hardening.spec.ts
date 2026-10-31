import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiClientService } from './api-client.service';
import { AppStateService } from './app-state.service';
import { AuthService } from './auth.service';

describe('US-P020 signup state', () => {
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    vi.spyOn(TestBed.inject(ApiClientService), 'fetch').mockResolvedValue(new Response('[]'));
  });
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });
  async function signup(key: string | null) {
    vi.spyOn(TestBed.inject(ApiClientService), 'getPublicConfig').mockResolvedValue({ turnstile: { configured: !!key, siteKey: key } });
    const state = TestBed.inject(AppStateService);
    state.setAuthMode('signup');
    state.updateSignupDisplayName('New Learner'); state.updateEmail('new@example.test');
    state.updatePassword('Password123!'); state.updateSignupPasswordConfirmation('Password123!');
    state.toggleSignupTerms();
    await vi.waitFor(() => expect(state.signupConfigLoading()).toBe(false));
    return state;
  }
  it('keeps unconfigured signup available without a token', async () => {
    expect((await signup(null)).canSignupSubmit()).toBe(true);
  });
  it('requires a solved token, sends it and resets after a failed signup', async () => {
    const state = await signup('public-key');
    expect(state.turnstileSiteKey()).toBe('public-key');
    expect(state.canSignupSubmit()).toBe(false);
    state.setTurnstileToken('solved');
    expect(state.canSignupSubmit()).toBe(true);
    const request = vi.spyOn(TestBed.inject(AuthService), 'signup').mockResolvedValue({ ok: false, message: 'Duplicate account' });
    const version = state.turnstileResetVersion();
    await state.submitSignup();
    expect(request.mock.calls[0][0].turnstileToken).toBe('solved');
    expect(state.turnstileToken()).toBe('');
    expect(state.turnstileResetVersion()).toBeGreaterThan(version);
    expect(state.canSignupSubmit()).toBe(false);
    expect(state.signupError()).toBe('Duplicate account');
  });
  it('US-P022 requires the Terms of Service box and sends the acceptance', async () => {
    const state = await signup(null);
    state.toggleSignupTerms();
    expect(state.canSignupSubmit()).toBe(false);
    state.toggleSignupTerms();
    const request = vi.spyOn(TestBed.inject(AuthService), 'signup').mockResolvedValue({ ok: false, message: 'Duplicate account' });
    await state.submitSignup();
    expect(request.mock.calls[0][0].acceptTos).toBe(true);
  });
  it('does not submit while the public configuration is still loading', async () => {
    vi.spyOn(TestBed.inject(ApiClientService), 'getPublicConfig').mockReturnValue(new Promise(() => {}));
    const state = TestBed.inject(AppStateService);
    state.setAuthMode('signup');
    state.updateSignupDisplayName('Learner'); state.updateEmail('new@example.test');
    state.updatePassword('Password123!'); state.updateSignupPasswordConfirmation('Password123!');
    expect(state.signupConfigLoading()).toBe(true);
    expect(state.canSignupSubmit()).toBe(false);
  });
});
