import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmService } from '../../services/confirm.service';
import { OrganizationService } from '../../services/organization.service';
import { AdminOrganizations } from './admin-organizations';

const request = { id: 'r1', state: 'pending', displayName: 'QA Team', companyName: 'Acme ApS', cvr: '12345678',
  billingEmail: 'b@acme.test', message: 'Ten testers', declineReason: null, submittedAt: '2026-10-23T09:00:00Z',
  decidedAt: null, organizationId: null, requesterName: 'Olga Owner', requesterEmail: 'olga@acme.test' };
const organization = { id: 'o1', displayName: 'Bank QA', companyName: 'Bank A/S', cvr: '87654321', billingEmail: 'x@bank.test',
  state: 'active', originalOwnerId: 'u1', createdAt: '2026-10-01T09:00:00Z', memberCount: 7 };

describe('admin organizations (US-O001 release 1)', () => {
  let fixture: ComponentFixture<AdminOrganizations>;
  let calls: string[];

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    calls = [];
    const ok = <T>(body: T) => Promise.resolve({ ok: true as const, body });
    await TestBed.configureTestingModule({ imports: [AdminOrganizations], providers: [
      { provide: OrganizationService, useValue: {
        adminRequests: () => ok([request]),
        adminOrganizations: () => ok([organization]),
        decideRequest: (_t: string, id: string, decision: { action: string; reason?: string; billing?: string }) => {
          calls.push(`${decision.action}:${id}${decision.reason ? ':' + decision.reason : ''}${decision.billing ? ':' + decision.billing : ''}`); return ok({}); },
        setFree: (_t: string, id: string, free: boolean) => { calls.push(`free:${id}:${free}`); return ok({}); },
        setSuspended: (_t: string, id: string, suspended: boolean) => { calls.push(`${suspended ? 'suspend' : 'reactivate'}:${id}`); return ok({}); },
      } },
      { provide: ConfirmService, useValue: { ask: async () => true } },
    ] }).compileComponents();
    fixture = TestBed.createComponent(AdminOrganizations);
    fixture.componentRef.setInput('authToken', 'token');
    await flush();
  });

  async function flush() { for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r)); fixture.detectChanges(); } }
  const page = () => fixture.nativeElement as HTMLElement;
  const button = (text: string) => [...page().querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;

  it('lists pending requests with requester, CVR and message, and organizations with member count', () => {
    expect(page().textContent).toContain('QA Team');
    expect(page().textContent).toContain('Olga Owner');
    expect(page().textContent).toContain('12345678');
    expect(page().textContent).toContain('Ten testers');
    expect(page().textContent).toContain('Bank QA');
    expect(page().textContent).toContain('7 members');
  });

  it('US-O001-AC02 approves a request', async () => {
    button('Approve').click();
    await flush();
    expect(calls).toEqual(['approve:r1:paid']);
  });

  it('US-O001-AC03 needs a reason to decline', async () => {
    button('Decline').click();
    await flush();
    button('Send decline').click();
    await flush();
    expect(page().querySelector('[role="alert"]')?.textContent).toContain('Write the reason the requester will see.');
    expect(calls).toEqual([]);
    const reason = page().querySelector<HTMLTextAreaElement>('#decline-reason-r1')!;
    reason.value = 'The CVR does not match the company name.';
    reason.dispatchEvent(new Event('input'));
    button('Send decline').click();
    await flush();
    expect(calls).toEqual(['decline:r1:The CVR does not match the company name.']);
  });

  it('US-O002-AC01 approves free of charge, shows billing state and switches Free and Paid', async () => {
    button('Approve free').click();
    await flush();
    expect(page().textContent).toContain('Free of charge');
    button('Require billing').click();
    await flush();
    expect(calls).toEqual(['approve:r1:free', 'free:o1:false']);
  });

  it('US-O001-AC12 suspends an organization', async () => {
    button('Suspend').click();
    await flush();
    expect(calls).toEqual(['suspend:o1']);
  });
});
