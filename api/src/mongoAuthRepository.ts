import { createHash } from 'node:crypto';
import type { Collection } from 'mongodb';
import type { AuthRepository, AuthAccessMutation, AuthEnrollmentMutation } from './authRepository.js';
import { assertPrivacyMutationId, toAuthenticatedUser, type AuthenticatedUser, type AuthUser, type UserRole, type UserStatus } from './auth.js';
import { SYSTEM_ACCOUNT_ID } from './systemAccount.js';
import { DuplicateAccountError } from './authStore.js';
import { apiConfig } from './config.js';
import { getMongoDatabase } from './mongo.js';

export type MongoAuthDocument = Omit<AuthUser, 'id'> & { _id: string; enrollmentPurchases?: Record<string, string> };
export type MongoAuthCollection = Pick<Collection<MongoAuthDocument>, 'findOne' | 'find' | 'insertOne' | 'findOneAndUpdate' | 'countDocuments' | 'createIndex'>;
const majority = { writeConcern: { w: 'majority' as const } };
const emailKey = (email: string) => email.trim().toLowerCase();
function account(document: MongoAuthDocument): AuthUser {
  // A whitelist keeps internal Mongo fields out of callers and session DTOs.
  return { id: document._id, email: document.email, displayName: document.displayName, passwordHash: document.passwordHash,
    role: document.role, status: document.status, createdAt: document.createdAt, enrolledCourseIds: [...document.enrolledCourseIds],
    ...(document.emailConfirmed === undefined ? {} : { emailConfirmed: document.emailConfirmed }),
    ...(document.privacyErasure === undefined ? {} : { privacyErasure: { state: document.privacyErasure.state, startedAt: document.privacyErasure.startedAt,
      ...(document.privacyErasure.cleanupStarted === undefined ? {} : { cleanupStarted: document.privacyErasure.cleanupStarted }) } }),
    ...(!document.privacyMutations || Object.keys(document.privacyMutations).length === 0 ? {} : { privacyMutations: { ...document.privacyMutations } }) };
}
export async function ensureAuthIndexes(collection: Pick<MongoAuthCollection, 'createIndex'>): Promise<void> {
  await collection.createIndex({ email: 1 }, { unique: true });
  await collection.createIndex({ enrolledCourseIds: 1 }, {});
}
export class MongoAuthRepository implements AuthRepository {
  readonly storageType = 'mongodb';
  private indexes: Promise<void> | undefined;
  constructor(private readonly collection: () => Promise<MongoAuthCollection> = async () =>
    (await getMongoDatabase()).collection<MongoAuthDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_users`)) {}

  async findById(id: string): Promise<AuthUser | null> {
    const document = await (await this.collection()).findOne({ _id: id });
    return document ? account(document) : null;
  }
  async findByEmail(email: string): Promise<AuthUser | null> {
    const document = await (await this.collection()).findOne({ email: emailKey(email) });
    return document ? account(document) : null;
  }
  async listUsers(): Promise<AuthUser[]> {
    return (await (await this.collection()).find().toArray()).map(account);
  }
  async countEnrolledUsers(courseId: string): Promise<number> {
    return (await this.collection()).countDocuments({ enrolledCourseIds: courseId });
  }
  async collectForExport(userId: string): Promise<AuthenticatedUser | null> {
    const user = await this.findById(userId);
    return user ? toAuthenticatedUser(user) : null;
  }
  async beginPrivacyMutation(userId: string, mutationId: string, expiresAt: number): Promise<boolean> {
    assertPrivacyMutationId(mutationId);
    const document = await (await this.collection()).findOneAndUpdate({ _id: userId, status: 'active', privacyErasure: { $exists: false } },
      { $set: { [`privacyMutations.${mutationId}`]: expiresAt } },
      { returnDocument: 'after', includeResultMetadata: false, ...majority });
    return document !== null;
  }
  async finishPrivacyMutation(userId: string, mutationId: string): Promise<void> {
    assertPrivacyMutationId(mutationId);
    await (await this.collection()).findOneAndUpdate({ _id: userId }, { $unset: { [`privacyMutations.${mutationId}`]: '' } },
      { returnDocument: 'after', includeResultMetadata: false, ...majority });
  }
  async beginErasure(userId: string, expectedPasswordHash: string): Promise<AuthUser | null> {
    if (userId === SYSTEM_ACCOUNT_ID) return null;
    const collection = await this.collection();
    const document = await collection.findOneAndUpdate({ _id: userId, status: 'active', passwordHash: expectedPasswordHash, privacyErasure: { $exists: false } },
      { $set: { status: 'disabled', privacyErasure: { state: 'pending', startedAt: new Date().toISOString() } } },
      { returnDocument: 'after', includeResultMetadata: false, ...majority });
    if (document) return account(document);
    const pending = await collection.findOne({ _id: userId, status: 'disabled', passwordHash: expectedPasswordHash, 'privacyErasure.state': 'pending' });
    return pending ? account(pending) : null;
  }
  async cancelErasure(userId: string, expectedPasswordHash: string): Promise<boolean> {
    const document = await (await this.collection()).findOneAndUpdate({ _id: userId, status: 'disabled', passwordHash: expectedPasswordHash,
      'privacyErasure.state': 'pending', 'privacyErasure.cleanupStarted': { $ne: true } },
      { $set: { status: 'active' }, $unset: { privacyErasure: '' } },
      { returnDocument: 'after', includeResultMetadata: false, ...majority });
    return document !== null;
  }
  async markErasureCleaning(userId: string): Promise<void> {
    const document = await (await this.collection()).findOneAndUpdate({ _id: userId, status: 'disabled', 'privacyErasure.state': 'pending' },
      { $set: { 'privacyErasure.cleanupStarted': true } }, { returnDocument: 'after', includeResultMetadata: false, ...majority });
    if (!document) throw new Error('Account erasure is not pending.');
  }
  async anonymizeForUser(userId: string): Promise<void> {
    if (userId === SYSTEM_ACCOUNT_ID) return;
    const user = await this.findById(userId);
    if (!user) return;
    await (await this.collection()).findOneAndUpdate({ _id: userId },
      { $set: { email: `erased:${userId}`, displayName: 'Deleted user', passwordHash: '', status: 'disabled', role: 'student', emailConfirmed: false,
        privacyErasure: { state: 'complete', startedAt: user.privacyErasure?.startedAt ?? new Date().toISOString() } }, $unset: { privacyMutations: '' } },
      { returnDocument: 'after', includeResultMetadata: false, ...majority });
  }
  async createUser(user: AuthUser): Promise<AuthUser> {
    const collection = await this.collection();
    this.indexes ??= ensureAuthIndexes(collection).catch(error => { this.indexes = undefined; throw error; });
    await this.indexes;
    const { id, ...fields } = user;
    const document = { ...structuredClone(fields), _id: id, email: emailKey(user.email) };
    try {
      const result = await collection.insertOne(document, majority);
      if (!result.acknowledged) throw new Error('Account creation was not confirmed.');
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new DuplicateAccountError();
      throw error;
    }
    return account(document);
  }
  async enrollUserInCourse(userId: string, courseId: string): Promise<AuthUser | null> {
    return (await this.enrollUserInCourseWithChange(userId, courseId))?.user ?? null;
  }
  async enrollUserInCourseWithChange(userId: string, courseId: string, purchaseSessionId?: string): Promise<AuthEnrollmentMutation | null> {
    const collection = await this.collection();
    // Hash the course key so arbitrary IDs cannot become Mongo field paths.
    const key = createHash('sha256').update(courseId).digest('hex');
    // The source session is written only by the first enrollment. Replays of
    // that session must still identify it as the first purchase across hosts.
    const document = await collection.findOneAndUpdate({ _id: userId, ...(purchaseSessionId ? { enrolledCourseIds: { $ne: courseId } } : {}) },
      { $addToSet: { enrolledCourseIds: courseId }, ...(purchaseSessionId ? { $set: { [`enrollmentPurchases.${key}`]: purchaseSessionId } } : {}) },
      { returnDocument: 'before', includeResultMetadata: false, ...majority });
    if (!document) {
      if (!purchaseSessionId) return null;
      const current = await collection.findOne({ _id: userId });
      return current ? { user: account(current), added: false, purchaseSessionId: current.enrollmentPurchases?.[key] } : null;
    }
    const user = account(document); const added = !user.enrolledCourseIds.includes(courseId);
    if (added) user.enrolledCourseIds.push(courseId);
    return { user, added, purchaseSessionId: added && purchaseSessionId ? purchaseSessionId : document.enrollmentPurchases?.[key] };
  }

  async reconcileCoursePurchase(userId: string, courseId: string, remainingSessionId: string | null): Promise<AuthUser | null> {
    const source = `enrollmentPurchases.${createHash('sha256').update(courseId).digest('hex')}`;
    // Enrollment and its source move together, without replacing other account fields.
    const update = remainingSessionId
      ? { $addToSet: { enrolledCourseIds: courseId }, $set: { [source]: remainingSessionId } }
      : { $pull: { enrolledCourseIds: courseId }, $unset: { [source]: '' as const } };
    const document = await (await this.collection()).findOneAndUpdate({ _id: userId }, update,
      { returnDocument: 'after', includeResultMetadata: false, ...majority });
    return document ? account(document) : null;
  }
  async updatePasswordHash(userId: string, passwordHash: string, expectedPasswordHash?: string): Promise<AuthUser | null> {
    if (userId === SYSTEM_ACCOUNT_ID) return null;
    const document = await (await this.collection()).findOneAndUpdate({ _id: userId, privacyErasure: { $exists: false }, status: 'active', ...(expectedPasswordHash === undefined ? {} : { passwordHash: expectedPasswordHash }) }, { $set: { passwordHash } },
      { returnDocument: 'after', includeResultMetadata: false, ...majority });
    return document ? account(document) : null;
  }
  async confirmEmail(userId: string): Promise<AuthUser | null> {
    if (userId === SYSTEM_ACCOUNT_ID) return null;
    const document = await (await this.collection()).findOneAndUpdate({ _id: userId, privacyErasure: { $exists: false }, status: 'active' }, { $set: { emailConfirmed: true } },
      { returnDocument: 'after', includeResultMetadata: false, ...majority });
    return document ? account(document) : null;
  }
  async updateRole(userId: string, role: UserRole): Promise<AuthUser | null> { return (await this.updateRoleWithChange(userId, role))?.user ?? null; }
  async updateStatus(userId: string, status: UserStatus): Promise<AuthUser | null> { return (await this.updateStatusWithChange(userId, status))?.user ?? null; }
  updateRoleWithChange(userId: string, role: UserRole): Promise<AuthAccessMutation | null> { return this.accessChange(userId, 'role', role); }
  updateStatusWithChange(userId: string, status: UserStatus): Promise<AuthAccessMutation | null> { return this.accessChange(userId, 'status', status); }
  private async accessChange(userId: string, field: 'role' | 'status', value: UserRole | UserStatus): Promise<AuthAccessMutation | null> {
    if (userId === SYSTEM_ACCOUNT_ID) return null;
    const document = await (await this.collection()).findOneAndUpdate({ _id: userId, privacyErasure: { $exists: false }, [field]: { $ne: value } }, { $set: { [field]: value } },
      { returnDocument: 'before', includeResultMetadata: false, ...majority });
    if (document) {
      const previous = account(document);
      return { previous, user: { ...previous, [field]: value } };
    }
    const current = await this.findById(userId);
    return current && !current.privacyErasure ? { previous: null, user: current } : null;
  }
}
