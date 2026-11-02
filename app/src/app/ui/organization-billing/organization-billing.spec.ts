import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmService } from '../../services/confirm.service';
import { OrganizationService, type OrgBillingView } from '../../services/organization.service';
import { OrganizationBilling, type CardReturn } from './organization-billing';

const lines: OrgBillingView['lines'] = [
  { kind: 'base', id: 'organization', title: 'QI Academy organization', unitDkk: 0, quantity: 1 },
  { kind: 'seat', id: 'p1', title: 'Technical Tester', unitDkk: 499, quantity: 3 },
  { kind: 'course', id: 'c2', title: 'Playwright', unitDkk: 149, quantity: 1 },
];
const view = (patch: Partial<OrgBillingView>): OrgBillingView => ({ state: 'active', method: 'invoice', lines,
  monthlyTotalDkk: 1646, nextInvoiceAt: '2026-12-02T00:00:00Z', endsAt: null, unpaid: [], syncPending: false, ...patch });

describe('organization billing (US-O002)', () => {
  let fixture: ComponentFixture<OrganizationBilling>;
  let current: OrgBillingView;
  let calls: string[];
  let refusal: { status: number; message: string } | null;
  let accessChanges: number;
  let visited: string[];

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    calls = []; refusal = null; accessChanges = 0; visited = [];
    const answer = <T>(name: string, body: () => T) => { calls.push(name);
      return Promise.resolve(refusal ? { ok: false as const, ...refusal } : { ok: true as const, body: body() }); };
    await TestBed.configureTestingModule({ imports: [OrganizationBilling], providers: [
      { provide: OrganizationService, useValue: {
        billing: () => Promise.resolve({ ok: true as const, body: current }),
        setupInvoice: (_t: string, _o: string, address: { postalCode: string }) =>
          answer('invoice:' + address.postalCode, () => (current = view({ state: 'active' }))),
        setupCard: (_t: string, _o: string, _a: unknown, returnUrl: string) => answer('card:' + returnUrl, () => ({ url: 'https://stripe.test/setup' })),
        confirmCard: (_t: string, _o: string, sessionId: string) => answer('confirm:' + sessionId, () => (current = view({ method: 'card' }))),
        setCancellation: (_t: string, _o: string, cancel: boolean) =>
          answer('cancel:' + cancel, () => (current = view(cancel ? { state: 'cancelling', endsAt: '2026-12-02T00:00:00Z' } : {}))),
        billingPortal: () => answer('portal', () => ({ url: 'https://stripe.test/portal' })),
      } },
      { provide: ConfirmService, useValue: { ask: async () => true } },
    ] }).compileComponents();
  });

  async function render(cardReturn: CardReturn | null = null): Promise<HTMLElement> {
    fixture = TestBed.createComponent(OrganizationBilling);
    fixture.componentInstance.assignLocation = (url) => visited.push(url);
    fixture.componentInstance.accessChanged.subscribe(() => accessChanges++);
    fixture.componentRef.setInput('authToken', 'token');
    fixture.componentRef.setInput('orgId', 'o1');
    fixture.componentRef.setInput('cardReturn', cardReturn);
    await flush();
    return fixture.nativeElement as HTMLElement;
  }
  async function flush() { for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r)); fixture.detectChanges(); } }
  const button = (page: HTMLElement, text: string) => [...page.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
  const type = (page: HTMLElement, id: string, value: string) => {
    const input = page.querySelector<HTMLInputElement>('#' + id)!;
    input.value = value; input.dispatchEvent(new Event('input'));
  };

  it('US-O002-AC02/AC03 asks a paid organization to set up billing, checks the address, then sets up invoices', async () => {
    current = view({ state: 'setup-needed', method: null, nextInvoiceAt: null });
    const page = await render();
    expect(page.textContent).toContain('Set up billing to open courses for your members');
    expect(page.textContent).toContain('1646 DKK');
    button(page, 'Set up invoice billing').click();
    await flush();
    expect(page.textContent).toContain('Enter the 4-digit postcode.');
    expect(calls).toEqual([]);
    type(page, 'bill-line1', 'Testvej 1'); type(page, 'bill-postalCode', '2100'); type(page, 'bill-city', 'København Ø');
    button(page, 'Set up invoice billing').click();
    await flush();
    expect(calls).toEqual(['invoice:2100']);
    expect(page.textContent).toContain('Invoice billing is set up');
    expect(accessChanges).toBe(1);
  });

  it('US-O002-AC04 sends card setup to Stripe and confirms the session on return', async () => {
    current = view({ state: 'setup-needed', method: null });
    let page = await render();
    page.querySelector<HTMLInputElement>('input[value="card"]')!.dispatchEvent(new Event('change'));
    await flush();
    type(page, 'bill-line1', 'Testvej 1'); type(page, 'bill-postalCode', '2100'); type(page, 'bill-city', 'København');
    button(page, 'Continue to card').click();
    await flush();
    expect(calls[0]).toMatch(/^card:http/);
    expect(visited).toEqual(['https://stripe.test/setup']);

    fixture.destroy();
    calls = [];
    page = await render({ outcome: 'card', sessionId: 'cs_1' });
    expect(calls).toEqual(['confirm:cs_1']);
    expect(page.textContent).toContain('Card saved');
    expect(page.textContent).toContain('Paid by card');
  });

  it('US-O002-AC05 shows lines, total, method and next invoice, and opens the Stripe portal', async () => {
    current = view({});
    const page = await render();
    const rows = [...page.querySelectorAll('tbody tr')].map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent?.trim()));
    expect(rows).toEqual([['QI Academy organizationIncluded', '0 DKK', '1', '0 DKK'],
      ['Technical TesterCareer seat', '499 DKK', '3', '1497 DKK'], ['PlaywrightExtra course', '149 DKK', '1', '149 DKK']]);
    expect(page.textContent).toContain('Monthly total, excl. moms');
    expect(page.textContent).toContain('invoice, 14 days to pay');
    expect(page.textContent).toContain('Next invoice 2 Dec 2026');
    button(page, 'Manage billing').click();
    await flush();
    expect(visited).toEqual(['https://stripe.test/portal']);
  });

  it('US-O002-AC06 says when a billing update is pending', async () => {
    current = view({ syncPending: true });
    expect((await render()).textContent).toContain('Billing update pending');
  });

  it('US-O002-AC08 warns about an overdue invoice and says when members are blocked', async () => {
    const unpaid = [{ id: 'in_1', amountDkk: 2058, dueAt: '2026-11-15T00:00:00Z', blocksAt: '2026-11-29T00:00:00Z', url: 'https://stripe.test/in_1' }];
    current = view({ state: 'overdue', unpaid });
    let page = await render();
    expect(page.textContent).toContain('An invoice of 2058 DKK was due 15 Nov 2026');
    expect(page.textContent).toContain('Members lose organization courses on 29 Nov 2026');
    expect(page.querySelector<HTMLAnchorElement>('a[href="https://stripe.test/in_1"]')).not.toBeNull();
    fixture.destroy();
    current = view({ state: 'blocked', unpaid });
    page = await render();
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Members have lost access until the invoice is paid.');
  });

  it('US-O002-AC09 cancels at period end and can keep the subscription', async () => {
    current = view({});
    const page = await render();
    button(page, 'Cancel subscription').click();
    await flush();
    expect(page.textContent).toContain('The subscription ends 2 Dec 2026');
    button(page, 'Keep subscription').click();
    await flush();
    expect(calls).toEqual(['cancel:true', 'cancel:false']);
    expect(accessChanges).toBe(0);
  });

  it('US-O002-AC11 shows the API refusal, for example when billing is unavailable', async () => {
    current = view({});
    const page = await render();
    refusal = { status: 503, message: 'Billing is temporarily unavailable.' };
    button(page, 'Manage billing').click();
    await flush();
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Billing is temporarily unavailable.');
    expect(visited).toEqual([]);
  });

  it('free organizations see no bill', async () => {
    current = view({ state: 'free', method: null, lines: [], monthlyTotalDkk: 0, nextInvoiceAt: null });
    const page = await render();
    expect(page.textContent).toContain('free of charge');
    expect(page.querySelector('table')).toBeNull();
  });
});
