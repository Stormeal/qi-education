import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FeedbackEntry, LoginState } from '../app.models';
import { AppStateService } from './app-state.service';
import { FeedbackService, FeedbackTriageResult } from './feedback.service';

const session = (id: string): LoginState => ({ token: id, user: { id, displayName: id, email: `${id}@example.test`, role: 'admin', status: 'active', createdAt: '', enrolledCourseIds: [] }, permissions: { hasAdminAccess: true, canCreateCourses: true } });
const entry: FeedbackEntry = { id: 'old', userId: 'old', userEmail: 'old@example.test', userRole: 'student', page: 'Home', message: 'Private old report', createdAt: '', type: 'feedback', summary: 'Old' };
describe('US-A006 feedback responses stay in their session', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); TestBed.configureTestingModule({ providers: [provideRouter([])] }); });
  afterEach(() => vi.restoreAllMocks());
  it('AC05 completes loading after a same-account session refresh replaces account details', async () => {
    let reply!: (entries: FeedbackEntry[]) => void;
    const api = TestBed.inject(FeedbackService), state = TestBed.inject(AppStateService);
    vi.spyOn(api, 'listFeedback').mockImplementation(() => new Promise(resolve => { reply = resolve; }));
    state.loginState.set(session('first')); state.loadAdminFeedbackOnce();
    state.loginState.set({ ...state.loginState()!, user: { ...state.loginState()!.user, displayName: 'Updated admin name' } });
    reply([entry]); await Promise.resolve(); await Promise.resolve();
    expect(state.adminFeedback()).toEqual([entry]); expect(state.adminFeedbackLoading()).toBe(false);
  });
  it('AC05 ignores a delayed inbox load after the account changes', async () => {
    let reply!: (entries: FeedbackEntry[]) => void;
    const api = TestBed.inject(FeedbackService), state = TestBed.inject(AppStateService);
    vi.spyOn(api, 'listFeedback').mockImplementation(() => new Promise(resolve => { reply = resolve; }));
    state.loginState.set(session('first')); state.loadAdminFeedbackOnce();
    state.loginState.set(session('second')); state.adminFeedback.set([]); state.adminFeedbackLoading.set(true);
    reply([entry]); await Promise.resolve(); await Promise.resolve();
    expect(state.adminFeedback()).toEqual([]); expect(state.adminFeedbackLoading()).toBe(true);
  });
  it('AC05 ignores delayed triage errors without replacing the new account inbox or clearing its busy state', async () => {
    let reply!: (result: FeedbackTriageResult) => void;
    const api = TestBed.inject(FeedbackService), state = TestBed.inject(AppStateService);
    vi.spyOn(api, 'updateTriage').mockImplementation(() => new Promise(resolve => { reply = resolve; }));
    state.loginState.set(session('first')); state.adminFeedback.set([entry]);
    const pending = state.updateAdminFeedbackTriage({ id: 'old', workStatus: 'completed' });
    state.loginState.set(session('second')); state.adminFeedback.set([]); state.adminFeedbackSaving.set(true);
    reply({ ok: false, message: 'Old private failure' }); await pending;
    expect(state.adminFeedback()).toEqual([]); expect(state.adminFeedbackError()).toBe(''); expect(state.adminFeedbackSaving()).toBe(true);
  });
});
