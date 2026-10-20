import { describe, expect, it } from 'vitest';
import { InMemoryPaymentRepository, MongoPaymentRepository, type CoursePayment, type PaymentCollection } from './paymentRepository.js';

function setup(kind: string) {
  const documents = new Map<string, CoursePayment>();
  const collection = {
    async createIndex() { return 'userId_1_paidAt_-1'; },
    async insertOne(payment: CoursePayment, options: unknown) {
      expect(options).toEqual({ writeConcern: { w: 'majority' } });
      if (documents.has(payment._id)) throw { code: 11000 };
      documents.set(payment._id, structuredClone(payment));
      return { acknowledged: true, insertedId: payment._id };
    },
    async findOne(filter: { userId: string }, options: unknown) {
      expect(options).toEqual({ sort: { paidAt: -1 } });
      return [...documents.values()].filter(p => p.userId === filter.userId).sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0] ?? null;
    },
  } as unknown as PaymentCollection;
  return { documents, repository: kind === 'memory' ? new InMemoryPaymentRepository() : new MongoPaymentRepository(async () => collection) };
}
const payment: CoursePayment = { _id: 'cs_1', userId: 'u1', courseId: 'c1', amountDkk: 499, stripeCustomerId: 'cus_1', paidAt: '2026-10-19T12:00:00.000Z' };
describe.each(['memory', 'mongo'])('US-L024 payments (%s)', kind => {
  it('add returns true then false for the same session id', async () => {
    const { repository, documents } = setup(kind);
    expect(await repository.add(payment)).toBe(true);
    expect(await repository.add({ ...payment, stripeCustomerId: 'overwritten' })).toBe(false);
    expect(await repository.latestCustomerId('u1')).toBe('cus_1');
    if (kind === 'mongo') expect(documents.size).toBe(1);
  });
  it('latestCustomerId returns null without payments and the newest paidAt customer otherwise', async () => {
    const { repository } = setup(kind);
    expect(await repository.latestCustomerId('u1')).toBeNull();
    await repository.add({ ...payment, _id: 'cs_new', paidAt: '2026-10-20T12:00:00.000Z', stripeCustomerId: 'cus_new' });
    await repository.add(payment);
    await repository.add({ ...payment, _id: 'cs_other', userId: 'u2', paidAt: '2026-10-21T12:00:00.000Z' });
    expect(await repository.latestCustomerId('u1')).toBe('cus_new');
    expect(await repository.latestCustomerId('missing')).toBeNull();
  });
});
