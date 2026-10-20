import type { Collection } from 'mongodb';
import { hasMongoConfig } from './config.js';
import { getMongoDatabase } from './mongo.js';

export type CoursePayment = {
  _id: string; userId: string; courseId: string; amountDkk: number; stripeCustomerId: string; paidAt: string;
};
export interface PaymentRepository {
  add(payment: CoursePayment): Promise<boolean>;
  latestCustomerId(userId: string): Promise<string | null>;
}
export type PaymentCollection = Pick<Collection<CoursePayment>, 'insertOne' | 'findOne' | 'createIndex'>;

export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly payments = new Map<string, CoursePayment>();
  async add(payment: CoursePayment): Promise<boolean> {
    if (this.payments.has(payment._id)) return false;
    this.payments.set(payment._id, structuredClone(payment));
    return true;
  }
  async latestCustomerId(userId: string): Promise<string | null> {
    return [...this.payments.values()].filter(p => p.userId === userId)
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0]?.stripeCustomerId ?? null;
  }
}

export class MongoPaymentRepository implements PaymentRepository {
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
  async latestCustomerId(userId: string): Promise<string | null> {
    const payment = await (await this.indexedCollection()).findOne({ userId }, { sort: { paidAt: -1 } });
    return payment?.stripeCustomerId ?? null;
  }
}
export function createPaymentRepository(): PaymentRepository {
  return hasMongoConfig() ? new MongoPaymentRepository() : new InMemoryPaymentRepository();
}
