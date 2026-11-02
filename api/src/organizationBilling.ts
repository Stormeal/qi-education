import { z } from 'zod';
import type { Prices, OrganizationMembership, StoredCourseRequest } from './organization.js';
import { OrganizationError } from './organization.js';

export type BillingState = 'free' | 'setup-needed' | 'active' | 'overdue' | 'blocked' | 'cancelling' | 'cancelled';
export type BillingLine = { kind: 'base' | 'seat' | 'course'; id: string; title: string; unitDkk: number; quantity: number };
export type UnpaidInvoice = { id: string; amountDkk: number; dueAt: string; url: string | null };
export type OrganizationBilling = {
  mode: 'free' | 'paid'; method: 'card' | 'invoice' | null; customerId: string | null; subscriptionId: string | null;
  status: 'none' | 'active' | 'cancelling' | 'cancelled'; periodEnd: string | null; endsAt: string | null;
  unpaid: UnpaidInvoice[]; syncPending: boolean; revision?: number; syncProration?: 'create_prorations' | 'none';
  confirmedCardSessionIds?: string[];
  confirmingCardSessionId?: string | null;
  pendingSyncs?: { revision: number; lines: BillingLine[]; proration: 'create_prorations' | 'none' }[];
};
export type OrgBillingView = { state: BillingState; method: 'card' | 'invoice' | null; lines: BillingLine[];
  monthlyTotalDkk: number; nextInvoiceAt: string | null; endsAt: string | null;
  unpaid: (UnpaidInvoice & { blocksAt: string })[]; syncPending: boolean };
export const addressSchema = z.object({ line1: z.string().trim().min(1).max(120),
  postalCode: z.string().regex(/^\d{4}$/), city: z.string().trim().min(1).max(60) });
export type BillingAddress = z.infer<typeof addressSchema>;
export const billingSetupSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('invoice'), address: addressSchema }),
  z.object({ method: z.literal('card'), address: addressSchema, returnUrl: z.url() }),
]);
export const emptyBilling = (mode: 'free' | 'paid'): OrganizationBilling => ({ mode, method: null, customerId: null,
  subscriptionId: null, status: 'none', periodEnd: null, endsAt: null, unpaid: [], syncPending: false });
const blocksAt = (invoice: UnpaidInvoice) => Date.parse(invoice.dueAt) + 14 * 86400000;
export function billingState(billing: OrganizationBilling | undefined, now: number): BillingState {
  if (!billing || billing.mode === 'free') return 'free';
  if (billing.status === 'none') return 'setup-needed';
  if (billing.status === 'cancelled' || billing.status === 'cancelling' && billing.endsAt && Date.parse(billing.endsAt) <= now) return 'cancelled';
  if (billing.unpaid.some(invoice => blocksAt(invoice) <= now)) return 'blocked';
  if (billing.unpaid.length) return 'overdue';
  return billing.status === 'cancelling' ? 'cancelling' : 'active';
}
export function billingView(billing: OrganizationBilling | undefined, lines: BillingLine[], now: number): OrgBillingView {
  const state = billingState(billing, now);
  return { state, method: billing?.method ?? null, lines,
    monthlyTotalDkk: lines.reduce((sum, line) => sum + line.unitDkk * line.quantity, 0),
    nextInvoiceAt: ['free', 'setup-needed', 'cancelled'].includes(state) ? null : billing?.periodEnd ?? null,
    endsAt: billing?.status === 'cancelling' && state !== 'cancelled' ? billing.endsAt : null,
    unpaid: state === 'free' ? [] : (billing?.unpaid ?? []).map(invoice => ({ ...invoice, blocksAt: new Date(blocksAt(invoice)).toISOString() })),
    syncPending: billing?.syncPending ?? false };
}
export type BilledCareer = { id: string; title: string; courseIds: string[] };
export function desiredBillingLines(members: OrganizationMembership[], requests: StoredCourseRequest[], prices: Prices,
  careers: BilledCareer[], courses: { id: string; title: string }[]): BillingLine[] {
  const lines: BillingLine[] = [{ kind: 'base', id: 'organization', title: 'QI Academy organization', unitDkk: 0, quantity: 1 }];
  const active = members.filter(member => member.state === 'active');
  for (const career of careers) {
    const quantity = active.filter(member => member.careerId === career.id).length;
    if (quantity && prices.careers[career.id] !== undefined) lines.push({ kind: 'seat', id: career.id, title: career.title, unitDkk: prices.careers[career.id], quantity });
  }
  for (const course of courses) {
    const quantity = active.filter(member => requests.some(request => request.userId === member.userId && request.courseId === course.id && request.state === 'approved') &&
      !careers.find(career => career.id === member.careerId)?.courseIds.includes(course.id)).length;
    if (quantity && prices.courses[course.id] !== undefined) lines.push({ kind: 'course', id: course.id, title: course.title, unitDkk: prices.courses[course.id], quantity });
  }
  return lines.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}
export function assertBillingLineLimit(lines: BillingLine[]): void {
  if (lines.length > 20) throw new OrganizationError(409, 'Contact us to bill more different careers and courses.');
}
