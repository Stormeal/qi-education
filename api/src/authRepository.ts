import { randomUUID } from 'node:crypto';
import { apiConfig, getServicesMode, hasMongoConfig } from './config.js';
import { MongoAuthRepository } from './mongoAuthRepository.js';
import { accountWriteFreeze, DuplicateAccountError, type AuthStorageType } from './authStore.js';
export { MongoAuthRepository } from './mongoAuthRepository.js';
export { DuplicateAccountError, AuthReadOnlyError, ReadOnlyAuthRepository } from './authStore.js';
import {
  type AuthUser,
  type UserRole,
  type UserStatus,
  hashPassword
} from './auth.js';

export type AuthEnrollmentMutation = { user: AuthUser; added: boolean; purchaseSessionId?: string };

export type AuthAccessMutation = { user: AuthUser; previous: AuthUser | null };

export interface AuthRepository {
  readonly storageType?: AuthStorageType;
  readonly readOnly?: boolean;
  readonly unavailableReason?: string;
  findByEmail(email: string, options?: { fresh?: boolean }): Promise<AuthUser | null>;
  findById(id: string, options?: { fresh?: boolean }): Promise<AuthUser | null>;
  listUsers(options?: { fresh?: boolean }): Promise<AuthUser[]>;
  countEnrolledUsers(courseId: string, users?: AuthUser[]): Promise<number>;
  updateRole(userId: string, role: UserRole): Promise<AuthUser | null>;
  updateStatus(userId: string, status: UserStatus): Promise<AuthUser | null>;
  updateRoleWithChange(userId: string, role: UserRole): Promise<AuthAccessMutation | null>;
  updateStatusWithChange(userId: string, status: UserStatus): Promise<AuthAccessMutation | null>;
  createUser(user: AuthUser): Promise<AuthUser>;
  enrollUserInCourse(userId: string, courseId: string): Promise<AuthUser | null>;
  enrollUserInCourseWithChange(userId: string, courseId: string, purchaseSessionId?: string): Promise<AuthEnrollmentMutation | null>;
  updatePasswordHash(userId: string, passwordHash: string, expectedPasswordHash?: string): Promise<AuthUser | null>;
  confirmEmail(userId: string): Promise<AuthUser | null>;
}

export class InMemoryAuthRepository implements AuthRepository {
  readonly storageType = 'memory';
  private readonly enrollmentPurchases = new Map<string, string>();
  private readonly users: AuthUser[] = [
    createDemoUser('student', 'student@qi-education.local', 'Student Demo'),
    createDemoUser('teacher', 'teacher@qi-education.local', 'Teacher Demo'),
    createDemoUser('admin', 'admin@qi-education.local', 'Admin Demo')
  ];

  async findByEmail(email: string): Promise<AuthUser | null> {
    return this.users.find((user) => user.email === email.trim().toLowerCase()) ?? null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async listUsers(): Promise<AuthUser[]> { return [...this.users]; }
  async countEnrolledUsers(courseId: string): Promise<number> { return this.users.filter(user => user.enrolledCourseIds.includes(courseId)).length; }

  async updateRole(userId: string, role: UserRole): Promise<AuthUser | null> {
    return (await this.updateRoleWithChange(userId, role))?.user ?? null;
  }
  async updateRoleWithChange(userId: string, role: UserRole): Promise<AuthAccessMutation | null> {
    const index = this.users.findIndex(user => user.id === userId);
    if (index < 0) return null;
    const previous = this.users[index];
    if (previous.role === role) return { user: previous, previous: null };
    this.users[index] = { ...previous, role };
    return { user: this.users[index], previous };
  }
  async updateStatus(userId: string, status: UserStatus): Promise<AuthUser | null> {
    return (await this.updateStatusWithChange(userId, status))?.user ?? null;
  }
  async updateStatusWithChange(userId: string, status: UserStatus): Promise<AuthAccessMutation | null> {
    const index = this.users.findIndex(user => user.id === userId);
    if (index < 0) return null;
    const previous = this.users[index];
    if (previous.status === status) return { user: previous, previous: null };
    this.users[index] = { ...previous, status };
    return { user: this.users[index], previous };
  }

  async createUser(user: AuthUser): Promise<AuthUser> {
    const email = user.email.trim().toLowerCase();
    if (this.users.some(existing => existing.email === email)) throw new DuplicateAccountError();
    user = { ...user, email };
    this.users.push(user);
    return user;
  }

  async enrollUserInCourse(userId: string, courseId: string): Promise<AuthUser | null> {
    return (await this.enrollUserInCourseWithChange(userId, courseId))?.user ?? null;
  }
  async enrollUserInCourseWithChange(userId: string, courseId: string, purchaseSessionId?: string): Promise<AuthEnrollmentMutation | null> {
    const index = this.users.findIndex(user => user.id === userId);
    if (index < 0) return null;
    const user = this.users[index];
    const added = !user.enrolledCourseIds.includes(courseId);
    if (added) this.users[index] = { ...user, enrolledCourseIds: [...user.enrolledCourseIds, courseId] };
    const key = JSON.stringify([userId, courseId]);
    if (added && purchaseSessionId) this.enrollmentPurchases.set(key, purchaseSessionId);
    return { user: this.users[index], added, purchaseSessionId: this.enrollmentPurchases.get(key) };
  }

  async updatePasswordHash(userId: string, passwordHash: string, expectedPasswordHash?: string): Promise<AuthUser | null> {
    const index = this.users.findIndex(user => user.id === userId && user.status === 'active' && (expectedPasswordHash === undefined || user.passwordHash === expectedPasswordHash));
    if (index < 0) return null;
    this.users[index] = { ...this.users[index], passwordHash };
    return this.users[index];
  }

  async confirmEmail(userId: string): Promise<AuthUser | null> {
    const index = this.users.findIndex(user => user.id === userId && user.status === 'active');
    if (index < 0) return null;
    this.users[index] = { ...this.users[index], emailConfirmed: true };
    return this.users[index];
  }
}

export function createAuthRepository(): AuthRepository {
  return accountWriteFreeze(selectAuthRepository(), apiConfig.USER_STORE_READ_ONLY === '1');
}
function selectAuthRepository(): AuthRepository {
  if (getServicesMode() === 'isolated') return new InMemoryAuthRepository();
  return hasMongoConfig() ? new MongoAuthRepository() : new UnavailableAuthRepository('mongodb');
}

export class AuthUnavailableError extends Error {
  constructor() {
    super('Production user store is not configured. Authentication is unavailable.');
  }
}

// No seeded users and no writes when the production store is missing. Keep the
// server running so existing health routes can explain the unavailable state.
class UnavailableAuthRepository implements AuthRepository {
  constructor(readonly storageType: AuthStorageType = 'mongodb') {}
  readonly unavailableReason = new AuthUnavailableError().message;
  async findByEmail(_email: string): Promise<AuthUser | null> { return null; }
  async findById(_id: string): Promise<AuthUser | null> { return null; }
  async listUsers(): Promise<AuthUser[]> { throw new AuthUnavailableError(); }
  async countEnrolledUsers(_courseId: string): Promise<number> { throw new AuthUnavailableError(); }
  async updateRole(_userId: string, _role: UserRole): Promise<AuthUser | null> { throw new AuthUnavailableError(); }
  async updateStatus(_userId: string, _status: UserStatus): Promise<AuthUser | null> { throw new AuthUnavailableError(); }
  async updateRoleWithChange(_userId: string, _role: UserRole): Promise<AuthAccessMutation | null> { throw new AuthUnavailableError(); }
  async updateStatusWithChange(_userId: string, _status: UserStatus): Promise<AuthAccessMutation | null> { throw new AuthUnavailableError(); }
  async createUser(_user: AuthUser): Promise<AuthUser> { throw new AuthUnavailableError(); }
  async enrollUserInCourse(_userId: string, _courseId: string): Promise<AuthUser | null> { return null; }
  async enrollUserInCourseWithChange(_userId: string, _courseId: string): Promise<AuthEnrollmentMutation | null> { throw new AuthUnavailableError(); }
  async updatePasswordHash(_userId: string, _passwordHash: string): Promise<AuthUser | null> { throw new AuthUnavailableError(); }
  async confirmEmail(_userId: string): Promise<AuthUser | null> { throw new AuthUnavailableError(); }
}

function createDemoUser(role: AuthUser['role'], email: string, displayName: string): AuthUser {
  return {
    id: randomUUID(),
    email,
    displayName,
    passwordHash: hashPassword('Password123!'),
    role,
    status: 'active',
    createdAt: new Date().toISOString(),
    enrolledCourseIds: []
  };
}
