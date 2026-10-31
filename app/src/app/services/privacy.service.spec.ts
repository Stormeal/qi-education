import { TestBed } from '@angular/core/testing';
import { vi, type MockInstance } from 'vitest';
import { ApiClientService } from './api-client.service';
import { PrivacyService, type PrivacyExport } from './privacy.service';

const exported: PrivacyExport = {
  exportedAt: '2026-10-31T12:00:00.000Z',
  account: { id: 'ada', email: 'ada@example.test', displayName: 'Ada', role: 'teacher', status: 'active',
    createdAt: '2026-10-01T12:00:00.000Z', enrolledCourseIds: ['course-1'], emailConfirmed: true },
  profile: { _id: 'ada', bio: 'My bio', jobTitle: 'Tester', company: 'Acme', learningGoals: 'Learn',
    avatarColor: '#2f4f43', notificationPrefs: { reviewActivity: true, organization: true, adminInbox: true },
    updatedAt: '2026-10-31T11:00:00.000Z' },
  instructorProfile: { _id: 'ada', description: 'My teaching' },
  enrolments: ['course-1'],
  progress: [{ _id: 'progress-1', userId: 'ada', courseId: 'course-1', completedIds: ['lesson-1'], passedQuizzes: [] }],
  notes: [{ id: 'note-1', courseId: 'course-1', componentId: 'lesson-1', text: 'Private note', videoSeconds: null,
    createdAt: '2026-10-31T11:00:00.000Z', updatedAt: '2026-10-31T11:00:00.000Z' }],
  lessonFeedback: [],
  careers: { current: { _id: 'ada', version: 1, followedPathIds: ['career-1'], focusPathId: 'career-1',
    achievements: [{ actionId: 'action-1', provenance: 'self-reported', declaredAt: '2026-10-31T11:00:00.000Z' }] },
    legacySelection: { _id: 'ada', pathId: 'career-1', revision: 1, selectedAt: '2026-10-31T11:00:00.000Z' } },
  payments: [{ _id: 'payment-1', userId: 'ada', courseId: 'course-1', amountDkk: 499, stripeCustomerId: 'customer-1',
    paidAt: '2026-10-31T11:00:00.000Z' }],
  organizations: { membership: null, ownedOrganizations: [], requests: [], courseRequests: [], invitations: [] },
  feedback: [],
  notifications: [{ id: 'notification-1', userId: 'ada', type: 'course-published', title: 'Published',
    link: '/courses/course-1', createdAt: '2026-10-31T11:00:00.000Z', readAt: null }],
  authoring: [{ courseId: 'course-1', title: 'Testing', owner: true, teacher: true, reviewer: false,
    reviewEvents: [{ id: 'review-1', action: 'submit', createdAt: '2026-10-31T11:00:00.000Z', reason: '' }] }],
};

describe('PrivacyService (US-P021 Task 7 contract)', () => {
  let service: PrivacyService;
  let fetchSpy: MockInstance<ApiClientService['fetch']>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    fetchSpy = vi.spyOn(TestBed.inject(ApiClientService), 'fetch');
    service = TestBed.inject(PrivacyService);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('exports the full caller payload with the supplied bearer token', async () => {
    fetchSpy.mockResolvedValue(Response.json(exported));
    expect(await service.exportMyData('session-token')).toEqual({ ok: true, body: exported });
    expect(fetchSpy).toHaveBeenCalledWith('/users/me/privacy/export', {
      method: 'GET', headers: { 'Content-Type': 'application/json', authorization: 'Bearer session-token' },
    });
  });

  it('returns a fresh export on each call without persisting personal data', async () => {
    const fresh = { ...exported, exportedAt: '2026-10-31T13:00:00.000Z', notes: [] };
    fetchSpy.mockResolvedValueOnce(Response.json(exported)).mockResolvedValueOnce(Response.json(fresh));
    expect(await service.exportMyData('first-token')).toEqual({ ok: true, body: exported });
    expect(await service.exportMyData('second-token')).toEqual({ ok: true, body: fresh });
    expect(fetchSpy).toHaveBeenLastCalledWith('/users/me/privacy/export', expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer second-token' }),
    }));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('returns export refusal status and message', async () => {
    fetchSpy.mockResolvedValue(Response.json({ message: 'Authentication required' }, { status: 401 }));
    expect(await service.exportMyData('expired-token')).toEqual({ ok: false, status: 401, message: 'Authentication required' });
  });

  it('posts password and confirmation and accepts the empty 204 response', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await service.eraseMyAccount('session-token', 'Password123!', 'DELETE')).toEqual({ ok: true, body: undefined });
    expect(fetchSpy).toHaveBeenCalledWith('/users/me/privacy/erase', {
      method: 'POST', headers: { 'Content-Type': 'application/json', authorization: 'Bearer session-token' },
      body: JSON.stringify({ password: 'Password123!', confirmation: 'DELETE' }),
    });
  });

  it('passes through the 400 password-incorrect code', async () => {
    fetchSpy.mockResolvedValue(Response.json({ message: 'Your password is not correct.', code: 'password-incorrect' }, { status: 400 }));
    expect(await service.eraseMyAccount('token', 'typo', 'DELETE')).toEqual({
      ok: false, status: 400, message: 'Your password is not correct.', code: 'password-incorrect',
    });
  });

  it('passes through the organizations blocking erasure', async () => {
    const organizations = [{ id: 'org-1', name: 'Acme' }, { id: 'org-2', name: 'QA Team' }];
    fetchSpy.mockResolvedValue(Response.json({ message: 'transfer-organization-first', organizations }, { status: 409 }));
    expect(await service.eraseMyAccount('token', 'Password123!', 'DELETE')).toEqual({
      ok: false, status: 409, message: 'transfer-organization-first', organizations,
    });
  });

  it.each(['export', 'erase'] as const)('resolves %s network failures without exposing exception details', async operation => {
    fetchSpy.mockRejectedValue(new Error('Private transport details'));
    const result = operation === 'export' ? service.exportMyData('token') : service.eraseMyAccount('token', 'Password123!', 'DELETE');
    await expect(result).resolves.toEqual({ ok: false, status: 0, message: 'Unable to reach the API. Please try again.' });
  });

  it('uses a readable fallback when an error response has no JSON body', async () => {
    fetchSpy.mockResolvedValue(new Response('Unavailable', { status: 503 }));
    expect(await service.exportMyData('token')).toEqual({ ok: false, status: 503, message: 'The request could not be completed.' });
  });
});
