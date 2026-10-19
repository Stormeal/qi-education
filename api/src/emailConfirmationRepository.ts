import { apiConfig, getServicesMode, hasMongoConfig } from './config.js';
import { getMongoDatabase } from './mongo.js';
import { InMemoryPasswordResetRepository, MongoPasswordResetRepository,
  type PasswordResetCollection, type PasswordResetDocument, type PasswordResetRepository } from './passwordResetRepository.js';

const lifetime = 24 * 60 * 60 * 1000;
export interface EmailConfirmationRepository extends PasswordResetRepository {
  mailRetryAfter(userId: string, now: number): Promise<number>;
}

// Use the same CAS reservations, pending-send state and single-use claims as
// reset links, with a separate collection and a longer token lifetime.
export class MongoEmailConfirmationRepository extends MongoPasswordResetRepository implements EmailConfirmationRepository {
  constructor(collectionLoader: () => Promise<PasswordResetCollection> = async () =>
    (await getMongoDatabase()).collection<PasswordResetDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_email_confirmations`)) {
    super(collectionLoader, lifetime);
  }
}
export class InMemoryEmailConfirmationRepository extends InMemoryPasswordResetRepository implements EmailConfirmationRepository {
  constructor() { super(lifetime); }
}
export function createEmailConfirmationRepository(): EmailConfirmationRepository {
  if (getServicesMode() === 'isolated') return new InMemoryEmailConfirmationRepository();
  if (hasMongoConfig()) return new MongoEmailConfirmationRepository();
  const unavailable = async (): Promise<never> => { throw new Error('Email confirmation storage is unavailable.'); };
  return { reserve: unavailable, activate: unavailable, findActive: unavailable, consume: unavailable,
    invalidateAll: unavailable, mailRetryAfter: unavailable };
}
