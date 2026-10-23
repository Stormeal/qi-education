import { TestBed } from '@angular/core/testing';
import { ApiClientService } from './api-client.service';
import { OrganizationService } from './organization.service';

type Call = { url: string; method: string; body: unknown; auth: string | undefined };

describe('OrganizationService (US-O001 release 1 contract)', () => {
  let service: OrganizationService;
  let calls: Call[];
  let reply: { status: number; body: unknown };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    calls = [];
    reply = { status: 200, body: {} };
    const fetch = async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined,
        auth: (init.headers as Record<string, string>)['authorization'] });
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiClientService, useValue: { fetch } }] });
    service = TestBed.inject(OrganizationService);
  });

  const request = { displayName: 'QA Team', companyName: 'Acme ApS', cvr: '12345678', billingEmail: 'billing@acme.test', message: '' };

  it.each([
    ['mine', () => service.mine('t'), 'GET', '/users/me/organization', undefined],
    ['submitRequest', () => service.submitRequest('t', request), 'POST', '/users/me/organization-request', request],
    ['resubmitRequest', () => service.resubmitRequest('t', request), 'PUT', '/users/me/organization-request', request],
    ['leave', () => service.leave('t'), 'DELETE', '/users/me/organization', undefined],
    ['adminRequests', () => service.adminRequests('t'), 'GET', '/admin/organization-requests?state=pending', undefined],
    ['decide approve', () => service.decideRequest('t', 'r1', { action: 'approve' }), 'POST', '/admin/organization-requests/r1/decision', { action: 'approve' }],
    ['decide decline', () => service.decideRequest('t', 'r1', { action: 'decline', reason: 'No CVR' }), 'POST', '/admin/organization-requests/r1/decision', { action: 'decline', reason: 'No CVR' }],
    ['adminOrganizations', () => service.adminOrganizations('t'), 'GET', '/admin/organizations', undefined],
    ['suspend', () => service.setSuspended('t', 'o1', true), 'POST', '/admin/organizations/o1/suspend', undefined],
    ['reactivate', () => service.setSuspended('t', 'o1', false), 'POST', '/admin/organizations/o1/reactivate', undefined],
    ['prices', () => service.prices('t'), 'GET', '/organization-prices', undefined],
    ['career price', () => service.setCareerPrice('t', 'p1', 499), 'PUT', '/admin/organization-prices/careers/p1', { priceDkk: 499 }],
    ['course price', () => service.setCoursePrice('t', 'c1', null), 'PUT', '/admin/organization-prices/courses/c1', { priceDkk: null }],
    ['members', () => service.members('t', 'o1'), 'GET', '/organizations/o1/members', undefined],
    ['remove', () => service.removeMember('t', 'o1', 'u1'), 'DELETE', '/organizations/o1/members/u1', undefined],
    ['promote', () => service.promote('t', 'o1', 'u1'), 'POST', '/organizations/o1/members/u1/promote', undefined],
    ['career', () => service.setCareer('t', 'o1', 'u1', 'p1'), 'PUT', '/organizations/o1/members/u1/career', { careerId: 'p1' }],
    ['invitations', () => service.invitations('t', 'o1'), 'GET', '/organizations/o1/invitations', undefined],
    ['invite', () => service.invite('t', 'o1', 'new@acme.test'), 'POST', '/organizations/o1/invitations', { email: 'new@acme.test' }],
    ['resend', () => service.resendInvitation('t', 'o1', 'i1'), 'POST', '/organizations/o1/invitations/i1/resend', undefined],
    ['cancel', () => service.cancelInvitation('t', 'o1', 'i1'), 'DELETE', '/organizations/o1/invitations/i1', undefined],
    ['courseRequests', () => service.courseRequests('t', 'o1'), 'GET', '/organizations/o1/course-requests', undefined],
    ['requestCourse', () => service.requestCourse('t', 'o1', 'c1'), 'POST', '/organizations/o1/course-requests', { courseId: 'c1' }],
    ['decideCourse', () => service.decideCourseRequest('t', 'o1', 'q1', 'approve'), 'POST', '/organizations/o1/course-requests/q1/decision', { action: 'approve' }],
  ] as const)('%s calls the contract route', async (_name, call, method, url, body) => {
    await call();
    expect(calls).toEqual([{ url, method, body, auth: 'Bearer t' }]);
  });

  it('sends invitation tokens only in the request body', async () => {
    await service.checkInvitation('secret-token');
    await service.acceptInvitation('t', 'secret-token');
    expect(calls.map((call) => [call.url, call.body])).toEqual([
      ['/organization-invitations/check', { token: 'secret-token' }],
      ['/organization-invitations/accept', { token: 'secret-token', consent: true }],
    ]);
    expect(calls[0].auth).toBeUndefined();
  });

  it('passes a refusal message and status through', async () => {
    reply = { status: 409, body: { message: 'Make another member an owner first' } };
    expect(await service.leave('t')).toEqual({ ok: false, status: 409, message: 'Make another member an owner first' });
  });

  it('reports an unreachable API', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: ApiClientService, useValue: { fetch: () => Promise.reject(new Error('offline')) } }] });
    expect(await TestBed.inject(OrganizationService).mine('t')).toEqual({ ok: false, status: 0, message: 'Unable to reach the API. Please try again.' });
  });
});
