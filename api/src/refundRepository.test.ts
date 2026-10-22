import { describe, expect, it } from 'vitest';
import { fakePaymentCollection } from '../test/fakePaymentCollection.js';
import { fakeAuthCollection } from '../test/fakeAuthCollection.js';
import { InMemoryPaymentRepository, MongoPaymentRepository } from './paymentRepository.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { MongoAuthRepository } from './mongoAuthRepository.js';
import { ReadOnlyAuthRepository, AuthReadOnlyError } from './authStore.js';
const payment = { _id: 'cs_first', userId: 'learner', courseId: 'course', amountDkk: 499, stripeCustomerId: 'customer', paidAt: '2026-10-22T08:00:00.000Z' };
describe.each(['memory', 'mongo'])('US-L025 storage (%s)', kind => {
  it('US-L025-AC01 AC03 AC04 refund marking is durable, idempotent and leaves other paid purchases', async () => {
    const fake = fakePaymentCollection();
    const repository = kind === 'memory' ? new InMemoryPaymentRepository() : new MongoPaymentRepository(async () => fake.collection);
    await repository.add(payment); await repository.add({ ...payment, _id: 'cs_second' });
    expect(typeof repository.markRefunded).toBe('function');
    const at = '2026-10-22T09:00:00.000Z';
    expect(await repository.markRefunded('cs_first', at)).toEqual({ ...payment, refundedAt: at });
    expect(await repository.markRefunded('cs_first', '2026-10-23T09:00:00.000Z')).toEqual({ ...payment, refundedAt: at });
    expect(await repository.findUnrefundedPurchase('learner', 'course')).toMatchObject({ _id: 'cs_second' });
    expect(await repository.findUnrefundedPurchase('learner', 'course', 'cs_second')).toBeNull();
    expect(await repository.markRefunded('missing', at)).toBeNull();
    await repository.markRefunded('cs_second', at);
    expect(await repository.findUnrefundedPurchase('learner', 'course')).toBeNull();
    expect(await repository.findUnrefundedPurchase('other', 'course')).toBeNull();
    expect(await repository.add(payment)).toBe(false);
    expect((await repository.findById('cs_first'))?.refundedAt).toBe(at);
    expect(await repository.latestCustomerId('learner')).toBe('customer');
    if (kind === 'mongo') {
      const restarted = new MongoPaymentRepository(async () => fake.collection);
      expect((await restarted.findById('cs_first'))?.refundedAt).toBe(at);
      expect(fake.documents.size).toBe(2);
      expect(fake.calls.writes).toContainEqual(expect.objectContaining({ options: expect.objectContaining({ writeConcern: { w: 'majority' } }) }));
    }
  });
  it('US-L025-AC01 AC03 AC05 atomic enrollment reconciliation clears or transfers purchase sources and honors maintenance freeze', async () => {
    const fake = fakeAuthCollection(); const seed = new InMemoryAuthRepository();
    const user = (await seed.findByEmail('student@qi-education.local'))!;
    const auth = kind === 'memory' ? seed : new MongoAuthRepository(async () => fake.collection);
    if (kind === 'mongo') await auth.createUser(user);
    await auth.enrollUserInCourse(user.id, 'other'); await auth.enrollUserInCourseWithChange(user.id, 'course', 'cs_first');
    expect(typeof auth.reconcileCoursePurchase).toBe('function');
    await expect(new ReadOnlyAuthRepository(auth).reconcileCoursePurchase(user.id, 'course', null)).rejects.toBeInstanceOf(AuthReadOnlyError);
    await auth.reconcileCoursePurchase(user.id, 'course', 'cs_second');
    expect((await auth.enrollUserInCourseWithChange(user.id, 'course', 'cs_second'))?.purchaseSessionId).toBe('cs_second');
    await auth.reconcileCoursePurchase(user.id, 'course', null); await auth.reconcileCoursePurchase(user.id, 'course', null);
    expect((await auth.findById(user.id))?.enrolledCourseIds).toEqual(['other']);
    expect(await auth.enrollUserInCourseWithChange(user.id, 'course', 'cs_new')).toMatchObject({ added: true, purchaseSessionId: 'cs_new' });
    expect((await auth.findById(user.id))?.passwordHash).toBe(user.passwordHash);
    expect(await auth.findById(user.id)).not.toHaveProperty('enrollmentPurchases');
  });
});
