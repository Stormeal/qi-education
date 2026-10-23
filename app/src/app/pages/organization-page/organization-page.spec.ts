import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CareerPathService } from '../../services/career-path.service';
import { ConfirmService } from '../../services/confirm.service';
import { OrganizationService, type MyOrganization, type NoOrganization } from '../../services/organization.service';
import { OrganizationPage } from './organization-page';

const org = { id: 'o1', displayName: 'QA Team', companyName: 'Acme ApS', cvr: '12345678', billingEmail: 'b@acme.test',
  state: 'active' as const, originalOwnerId: 'u-owner', createdAt: '2026-10-23T10:00:00Z' };
const ok = <T>(body: T) => Promise.resolve({ ok: true as const, body });

describe('organization page (US-O001 release 1)', () => {
  let mine: MyOrganization | NoOrganization;
  let calls: string[];
  let refusal: { status: number; message: string } | null;
  let fixture: ComponentFixture<OrganizationPage>;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    calls = [];
    refusal = null;
    const answer = <T>(name: string, body: T) => { calls.push(name);
      return refusal ? Promise.resolve({ ok: false as const, ...refusal }) : ok(body); };
    await TestBed.configureTestingModule({ imports: [OrganizationPage], providers: [provideRouter([]),
      { provide: OrganizationService, useValue: {
        mine: () => ok(mine),
        submitRequest: (_t: string, input: object) => answer('submit', { ...input, id: 'r1', state: 'pending' }),
        resubmitRequest: (_t: string, input: object) => answer('resubmit', { ...input, id: 'r1', state: 'pending' }),
        leave: () => answer('leave', undefined),
        members: () => ok([
          { userId: 'u-owner', name: 'Olga Owner', email: 'olga@acme.test', role: 'owner', careerId: null, joinedAt: '' },
          { userId: 'u-mem', name: 'Mads Member', email: 'mads@acme.test', role: 'member', careerId: 'p1', joinedAt: '' },
        ]),
        invitations: () => ok([{ id: 'i1', email: 'new@acme.test', state: 'not-sent', expiresAt: '2026-11-06T10:00:00Z', createdAt: '' }]),
        courseRequests: () => ok([{ id: 'q1', userId: 'u-mem', userName: 'Mads Member', courseId: 'c2', state: 'pending', addOnPriceDkk: 149, createdAt: '' }]),
        prices: () => ok({ careers: { p1: 499 }, courses: { c2: 149 } }),
        invite: (_t: string, _o: string, email: string) => answer('invite:' + email, { id: 'i2', email, state: 'sent', expiresAt: '', createdAt: '' }),
        resendInvitation: () => answer('resend', { id: 'i1', email: 'new@acme.test', state: 'sent', expiresAt: '', createdAt: '' }),
        cancelInvitation: () => answer('cancel', undefined),
        decideCourseRequest: (_t: string, _o: string, id: string, action: string) => answer(`${action}:${id}`, {}),
        setCareer: (_t: string, _o: string, userId: string, careerId: string) => answer(`career:${userId}:${careerId}`, {}),
        removeMember: (_t: string, _o: string, userId: string) => answer('remove:' + userId, undefined),
        promote: (_t: string, _o: string, userId: string) => answer('promote:' + userId, {}),
        requestCourse: (_t: string, _o: string, courseId: string) => answer('request:' + courseId, {}),
      } },
      { provide: CareerPathService, useValue: { paths: signal([{ id: 'p1', title: 'Technical Tester' }]), load: async () => {} } },
      { provide: ConfirmService, useValue: { ask: async () => true } },
    ] }).compileComponents();
  });

  async function render(userId = 'u-owner'): Promise<HTMLElement> {
    fixture = TestBed.createComponent(OrganizationPage);
    const inputs: Record<string, unknown> = { appVersion: 'test', currentYear: 2026, displayName: 'Olga Owner', userEmail: 'olga@acme.test',
      userRoleLabel: 'Student', canAccessAdmin: false, authToken: 'token', userId,
      courses: [{ id: 'c1', title: 'ISTQB Foundation' }, { id: 'c2', title: 'Playwright' }, { id: 'c3', title: 'Postman' }],
      isFeedbackOpen: false, feedbackSubmitted: false, feedbackPage: '', feedbackRating: '', feedbackText: '',
      feedbackSubmitting: false, feedbackError: '', feedbackOptions: [] };
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    await flush();
    return fixture.nativeElement as HTMLElement;
  }
  const settle = async (page: HTMLElement) => {
    await flush(); return page;
  };
  // The page chains several fake API calls; let them all resolve before reading the DOM.
  async function flush() { for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r)); fixture.detectChanges(); } }
  const type = (page: HTMLElement, label: string, value: string) => {
    const field = [...page.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(label))!;
    const input = page.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${field.htmlFor}`)!;
    input.value = value; input.dispatchEvent(new Event('input'));
  };
  const button = (page: HTMLElement, text: string) =>
    [...page.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;

  it('US-O001-AC01 shows the request form and refuses a CVR that is not 8 digits', async () => {
    mine = { organization: null, request: null, pendingInvitation: false };
    const page = await render();
    expect(page.querySelector('h1')?.textContent).toContain('Request an organization');
    type(page, 'Organization name', 'QA Team'); type(page, 'Company name', 'Acme ApS');
    type(page, 'CVR number', '1234'); type(page, 'Billing contact email', 'b@acme.test');
    button(page, 'Send request').click();
    await settle(page);
    expect(page.textContent).toContain('Enter the 8-digit CVR number');
    expect(calls).toEqual([]);
    type(page, 'CVR number', '12345678');
    button(page, 'Send request').click();
    await settle(page);
    expect(calls).toEqual(['submit']);
    expect(page.textContent).toContain('Pending');
  });

  it('US-O001-AC03 shows a declined request with its reason and lets the requester resubmit', async () => {
    mine = { organization: null, pendingInvitation: false, request: { id: 'r1', state: 'declined', declineReason: 'CVR does not match',
      displayName: 'QA Team', companyName: 'Acme ApS', cvr: '12345678', billingEmail: 'b@acme.test', message: '',
      submittedAt: '', decidedAt: '', organizationId: null } };
    const page = await render();
    expect(page.textContent).toContain('CVR does not match');
    button(page, 'Correct and resubmit').click();
    await settle(page);
    button(page, 'Send request').click();
    await settle(page);
    expect(calls).toEqual(['resubmit']);
  });

  it('US-O001-AC09 shows a member their billed career and the courses it opens', async () => {
    mine = { organization: org, role: 'member', isOriginalOwner: false, careerId: 'p1', seatPriceDkk: 499,
      openCourseIds: ['c1'], courseRequests: [] };
    const page = await render('u-mem');
    expect(page.textContent).toContain('Your organization gives you: Technical Tester');
    expect(page.textContent).toContain('ISTQB Foundation');
    expect(page.textContent).not.toContain('Invitations');
  });

  it('US-O001-AC10 lets a member request a course that is not already open', async () => {
    mine = { organization: org, role: 'member', isOriginalOwner: false, careerId: 'p1', seatPriceDkk: 499, openCourseIds: ['c1'], courseRequests: [] };
    const page = await render('u-mem');
    const select = page.querySelector<HTMLSelectElement>('#org-request-course')!;
    expect([...select.options].map((o) => o.value)).toEqual(['', 'c2', 'c3']);
    select.value = 'c3'; select.dispatchEvent(new Event('change'));
    button(page, 'Request course').click();
    await settle(page);
    expect(calls).toEqual(['request:c3']);
  });

  it('US-O001-AC07 owner view lists members, invitations and course requests with prices', async () => {
    mine = { organization: org, role: 'owner', isOriginalOwner: true, careerId: null, seatPriceDkk: null, openCourseIds: [], courseRequests: [] };
    const page = await render();
    expect(page.textContent).toContain('Mads Member');
    expect(page.textContent).toContain('Technical Tester (499 DKK per month)');
    expect(page.textContent).toContain('Not sent. Try again.');
    expect(page.textContent).toContain('Playwright');
    expect(page.textContent).toContain('149 DKK per month');
    button(page, 'Approve').click();
    await settle(page);
    type(page, 'Invite by email', 'colleague@acme.test');
    button(page, 'Send invitation').click();
    await settle(page);
    button(page, 'Promote to owner').click();
    await settle(page);
    expect(calls).toEqual(['approve:q1', 'invite:colleague@acme.test', 'promote:u-mem']);
  });

  it('US-O001-AC08 shows why the last owner cannot leave', async () => {
    mine = { organization: org, role: 'owner', isOriginalOwner: true, careerId: null, seatPriceDkk: null, openCourseIds: [], courseRequests: [] };
    const page = await render();
    refusal = { status: 409, message: 'Make another member an owner first' };
    button(page, 'Leave organization').click();
    await settle(page);
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Make another member an owner first');
  });

  it('only the original owner sees Promote to owner', async () => {
    mine = { organization: org, role: 'owner', isOriginalOwner: false, careerId: null, seatPriceDkk: null, openCourseIds: [], courseRequests: [] };
    const page = await render('u-other');
    expect(button(page, 'Promote to owner')).toBeUndefined();
  });
});
