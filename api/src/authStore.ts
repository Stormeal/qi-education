import type { AuthRepository } from './authRepository.js';
import type { AuthUser, UserRole, UserStatus } from './auth.js';

export type AuthStorageType = 'mongodb' | 'memory';
export class DuplicateAccountError extends Error {
  constructor() { super('An account with this email already exists'); }
}
export class AuthReadOnlyError extends Error {
  constructor() { super('Accounts are briefly read-only for maintenance. Try again in a few minutes.'); }
}

// Repository defense covers every account writer, including non-HTTP callers.
// The HTTP boundary also refuses write workflows before token/mail side effects.
export class ReadOnlyAuthRepository implements AuthRepository {
  readonly readOnly = true;
  constructor(private readonly repository: AuthRepository) {}
  get storageType() { return this.repository.storageType; }
  get unavailableReason() { return this.repository.unavailableReason; }
  findById(id: string, options?: { fresh?: boolean }) { return this.repository.findById(id, options); }
  findByEmail(email: string, options?: { fresh?: boolean }) { return this.repository.findByEmail(email, options); }
  listUsers(options?: { fresh?: boolean }) { return this.repository.listUsers(options); }
  countEnrolledUsers(courseId: string, users?: AuthUser[]) { return this.repository.countEnrolledUsers(courseId, users); }
  collectForExport(userId: string) { return this.repository.collectForExport(userId); }
  async beginErasure(_userId: string, _expectedPasswordHash: string): Promise<never> { throw new AuthReadOnlyError(); }
  async anonymizeForUser(_userId: string): Promise<never> { throw new AuthReadOnlyError(); }
  async beginPrivacyMutation(_userId: string, _mutationId: string, _expiresAt: number): Promise<never> { throw new AuthReadOnlyError(); }
  async finishPrivacyMutation(_userId: string, _mutationId: string): Promise<never> { throw new AuthReadOnlyError(); }
  async cancelErasure(_userId: string, _expectedPasswordHash: string): Promise<never> { throw new AuthReadOnlyError(); }
  async markErasureCleaning(_userId: string): Promise<never> { throw new AuthReadOnlyError(); }
  async reconcileCoursePurchase(_id: string, _courseId: string, _remaining: string | null): Promise<never> { throw new AuthReadOnlyError(); }
  async createUser(_user: AuthUser): Promise<never> { throw new AuthReadOnlyError(); }
  async enrollUserInCourseWithChange(_id: string, _courseId: string): Promise<never> { throw new AuthReadOnlyError(); }
  async enrollUserInCourse(_id: string, _courseId: string): Promise<never> { throw new AuthReadOnlyError(); }
  async updatePasswordHash(_id: string, _hash: string): Promise<never> { throw new AuthReadOnlyError(); }
  async confirmEmail(_id: string): Promise<never> { throw new AuthReadOnlyError(); }
  async updateRole(_id: string, _role: UserRole): Promise<never> { throw new AuthReadOnlyError(); }
  async updateStatus(_id: string, _status: UserStatus): Promise<never> { throw new AuthReadOnlyError(); }
  async updateRoleWithChange(_id: string, _role: UserRole): Promise<never> { throw new AuthReadOnlyError(); }
  async updateStatusWithChange(_id: string, _status: UserStatus): Promise<never> { throw new AuthReadOnlyError(); }
}
export function accountWriteFreeze(repository: AuthRepository, enabled: boolean): AuthRepository {
  return enabled && !repository.readOnly ? new ReadOnlyAuthRepository(repository) : repository;
}
