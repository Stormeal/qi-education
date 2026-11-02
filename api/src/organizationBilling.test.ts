import { describe, expect, it } from 'vitest';
import { billingState, emptyBilling, billingView, desiredBillingLines, assertBillingLineLimit } from './organizationBilling.js';
import type { OrganizationMembership, StoredCourseRequest } from './organization.js';

describe('US-O002 billing state', () => {
  const dueAt = '2026-11-01T00:00:00.000Z', blocksAt = '2026-11-15T00:00:00.000Z';
  it('AC01/AC02 older organizations are free, paid approval needs setup', () => {
    expect(billingState(undefined, 0)).toBe('free');
    expect(billingState(emptyBilling('paid'), 0)).toBe('setup-needed');
  });
  it('AC08 blocks exactly fourteen days after due and reopens on payment', () => {
    const billing = { ...emptyBilling('paid'), status: 'active' as const,
      unpaid: [{ id: 'invoice', amountDkk: 125, dueAt, url: null }] };
    expect(billingState(billing, Date.parse(blocksAt) - 1)).toBe('overdue');
    expect(billingState(billing, Date.parse(blocksAt))).toBe('blocked');
    expect(billingState(billing, Date.parse(blocksAt) + 1)).toBe('blocked');
    expect(billingView(billing, [], 0).unpaid[0].blocksAt).toBe(blocksAt);
    expect(billingState({ ...billing, unpaid: [] }, Date.parse(blocksAt))).toBe('active');
  });
  it('AC09 cancellation expires on every access check without waiting for a webhook', () => {
    const billing = { ...emptyBilling('paid'), status: 'cancelling' as const, endsAt: blocksAt };
    expect(billingState(billing, Date.parse(blocksAt) - 1)).toBe('cancelling');
    expect(billingState(billing, Date.parse(blocksAt))).toBe('cancelled');
  });
  it('AC05 counts priced published careers/add-ons once per active member and skips an add-on included by their career', () => {
    const member = (userId: string, careerId: string | null, state: 'active' | 'pending-email' = 'active'): OrganizationMembership =>
      ({ userId, orgId: 'org', role: 'member', state, careerId, startedCourseIds: [], joinedAt: '', consentAt: '' });
    const request = (userId: string, courseId: string): StoredCourseRequest => ({ id: `${userId}:${courseId}`, orgId: 'org', userId, userName: userId, courseId, state: 'approved', createdAt: '', addOnPriceDkk: null });
    const lines = desiredBillingLines([member('a', 'career'), member('b', 'career'), member('c', null), member('pending', 'career', 'pending-email'), member('unpriced', 'free-career')],
      [request('a', 'included'), request('b', 'extra'), request('b', 'extra'), request('c', 'extra'), request('pending', 'extra'), request('left', 'extra'), request('c', 'unpriced'), request('c', 'unpublished')],
      { careers: { career: 200 }, courses: { included: 100, extra: 50, unpublished: 400 } },
      [{ id: 'career', title: 'Career', courseIds: ['included'] }, { id: 'free-career', title: 'Unpriced', courseIds: [] }],
      [{ id: 'included', title: 'Included' }, { id: 'extra', title: 'Extra' }, { id: 'unpriced', title: 'Unpriced' }]);
    expect(lines).toEqual([
      { kind: 'base', id: 'organization', title: 'QI Academy organization', unitDkk: 0, quantity: 1 },
      { kind: 'course', id: 'extra', title: 'Extra', unitDkk: 50, quantity: 2 },
      { kind: 'seat', id: 'career', title: 'Career', unitDkk: 200, quantity: 2 },
    ]);
    expect(billingView(emptyBilling('paid'), lines, 0).monthlyTotalDkk).toBe(500);
  });
  it('AC12 permits twenty billed lines including the base, refuses twenty-one', () => {
    const line = { kind: 'course' as const, id: 'course', title: 'Course', unitDkk: 1, quantity: 1 };
    expect(() => assertBillingLineLimit(Array(20).fill(line))).not.toThrow();
    expect(() => assertBillingLineLimit(Array(21).fill(line))).toThrow('Contact us to bill more different careers and courses.');
  });
});
