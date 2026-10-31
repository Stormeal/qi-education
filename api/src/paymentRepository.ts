import type { Collection } from 'mongodb';
import { hasMongoConfig } from './config.js';
import { getMongoDatabase } from './mongo.js';

export type CoursePayment = {
  _id: string; userId: string; courseId: string; amountDkk: number; stripeCustomerId: string; paidAt: string; refundedAt?: string;
};
export interface PaymentRepository {
  collectForExport(userId: string): Promise<CoursePayment[]>;
  anonymizeForUser(userId: string): Promise<void>;
  add(payment: CoursePayment): Promise<boolean>;
  findById(sessionId: string): Promise<CoursePayment | null>;
  markRefunded(sessionId: string, refundedAt: string): Promise<CoursePayment | null>;
  findUnrefundedPurchase(userId: string, courseId: string, excludedSessionId?: string): Promise<CoursePayment | null>;
  latestCustomerId(userId: string): Promise<string | null>;
  listByUser(userId: string): Promise<CoursePayment[]>;
}
export type PaymentCollection = Pick<Collection<CoursePayment>, 'insertOne' | 'find' | 'findOne' | 'findOneAndUpdate' | 'createIndex' | 'updateMany'>;

// This allowlist is also the retained accounting record: keep approved Stripe
// customer/session references, but never legacy name/email or unknown fields.
const accountingFields = ({ _id, userId, courseId, amountDkk, stripeCustomerId, paidAt, refundedAt }: CoursePayment): CoursePayment =>
  ({ _id, userId, courseId, amountDkk, stripeCustomerId, paidAt, ...(refundedAt === undefined ? {} : { refundedAt }) });

export class InMemoryPaymentRepository implements PaymentRepository {
  async collectForExport(userId: string): Promise<CoursePayment[]> {
    return (await this.listByUser(userId)).map(accountingFields);
  }
  async anonymizeForUser(userId: string): Promise<void> {
    for (const [id, payment] of this.payments) if (payment.userId === userId) this.payments.set(id, accountingFields(payment));
  }

  private readonly payments = new Map<string, CoursePayment>();
  async add(payment: CoursePayment): Promise<boolean> {
    if (this.payments.has(payment._id)) return false;
    this.payments.set(payment._id, structuredClone(payment));
    return true;
  }
  async findById(sessionId: string): Promise<CoursePayment | null> { return structuredClone(this.payments.get(sessionId) ?? null); }
  async markRefunded(sessionId: string, refundedAt: string): Promise<CoursePayment | null> {
    const payment = this.payments.get(sessionId);
    if (!payment) return null;
    payment.refundedAt ??= refundedAt;
    return structuredClone(payment);
  }
  async findUnrefundedPurchase(userId: string, courseId: string, excludedSessionId?: string): Promise<CoursePayment | null> {
    return structuredClone([...this.payments.values()].find(p => p.userId === userId && p.courseId === courseId && p._id !== excludedSessionId && !p.refundedAt) ?? null);
  }
  async latestCustomerId(userId: string): Promise<string | null> {
    return [...this.payments.values()].filter(p => p.userId === userId)
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0]?.stripeCustomerId ?? null;
  }
  async listByUser(userId: string): Promise<CoursePayment[]> {
    return structuredClone([...this.payments.values()].filter(p => p.userId === userId).sort((a, b) => b.paidAt.localeCompare(a.paidAt)));
  }
}

export class MongoPaymentRepository implements PaymentRepository {
  async collectForExport(userId: string): Promise<CoursePayment[]> {
    return (await this.listByUser(userId)).map(accountingFields);
  }
  async anonymizeForUser(userId: string): Promise<void> {
    // Project the current document atomically so an arriving refund is never
    // replaced with an older export snapshot during account erasure.
    const result = await (await this.indexedCollection()).updateMany({ userId }, [{ $project: {
      _id: 1, userId: 1, courseId: 1, amountDkk: 1, stripeCustomerId: 1, paidAt: 1, refundedAt: 1,
    } }], { writeConcern: { w: 'majority' } });
    if (!result.acknowledged) throw new Error('Payment anonymization was not confirmed.');
  }

  private indexReady?: Promise<unknown>;
  constructor(private readonly collection: () => Promise<PaymentCollection> = async () =>
    (await getMongoDatabase()).collection<CoursePayment>('payments')) {}
  private async indexedCollection() {
    const collection = await this.collection();
    this.indexReady ??= collection.createIndex({ userId: 1, paidAt: -1 }).catch(error => {
      this.indexReady = undefined; throw error;
    });
    await this.indexReady;
    return collection;
  }
  async add(payment: CoursePayment): Promise<boolean> {
    const collection = await this.indexedCollection();
    try {
      const result = await collection.insertOne(payment, { writeConcern: { w: 'majority' } });
      if (!result.acknowledged) throw new Error('Payment storage was not confirmed.');
      return true;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) return false;
      throw error;
    }
  }
  async findById(sessionId: string): Promise<CoursePayment | null> {
    return (await this.indexedCollection()).findOne({ _id: sessionId });
  }
  async markRefunded(sessionId: string, refundedAt: string): Promise<CoursePayment | null> {
    const collection = await this.indexedCollection();
    const payment = await collection.findOneAndUpdate({ _id: sessionId, refundedAt: { $exists: false } }, { $set: { refundedAt } },
      { returnDocument: 'after', includeResultMetadata: false, writeConcern: { w: 'majority' } });
    // A replay must still retry enrollment removal after an earlier partial failure.
    return payment ?? this.findById(sessionId);
  }
  async findUnrefundedPurchase(userId: string, courseId: string, excludedSessionId?: string): Promise<CoursePayment | null> {
    return (await this.indexedCollection()).findOne({ userId, courseId, refundedAt: { $exists: false }, ...(excludedSessionId ? { _id: { $ne: excludedSessionId } } : {}) }, { sort: { paidAt: 1, _id: 1 } });
  }
  async latestCustomerId(userId: string): Promise<string | null> {
    const payment = await (await this.indexedCollection()).findOne({ userId }, { sort: { paidAt: -1 } });
    return payment?.stripeCustomerId ?? null;
  }
  async listByUser(userId: string): Promise<CoursePayment[]> {
    return (await this.indexedCollection()).find({ userId }, { sort: { paidAt: -1 } }).toArray();
  }
}
export function createPaymentRepository(): PaymentRepository {
  return hasMongoConfig() ? new MongoPaymentRepository() : new InMemoryPaymentRepository();
}
