import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const passwordHashPrefix = 'scrypt';
const sessionHeader = {
  alg: 'HS256',
  typ: 'JWT'
};

export const userRoleSchema = z.enum(['student', 'teacher', 'admin']);
export const userStatusSchema = z.enum(['active', 'disabled']);

export const loginSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(200)
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  enrolledCourseIds: string[];
};

export type AuthenticatedUser = Omit<AuthUser, 'passwordHash'>;

export const authSheetHeaders = [
  'id',
  'email',
  'displayName',
  'passwordHash',
  'role',
  'status',
  'createdAt',
  'enrolledCourseIds'
] as const;

type SessionPayload = {
  sub: string;
  email: string;
  role: UserRole;
  displayName: string;
  exp: number;
};

export function authUserFromSheetRow(row: string[]): AuthUser {
  return {
    id: row[0] ?? '',
    email: (row[1] ?? '').trim().toLowerCase(),
    displayName: row[2] ?? '',
    passwordHash: row[3] ?? '',
    role: userRoleSchema.catch('student').parse(row[4]),
    status: userStatusSchema.catch('active').parse(row[5]),
    createdAt: row[6] ?? '',
    enrolledCourseIds: parseEnrolledCourseIds(row[7])
  };
}

export function authUserToSheetRow(user: AuthUser): string[] {
  return [
    user.id,
    user.email,
    user.displayName,
    user.passwordHash,
    user.role,
    user.status,
    user.createdAt,
    user.enrolledCourseIds.join(', ')
  ];
}

export function toAuthenticatedUser(user: AuthUser): AuthenticatedUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(password, salt, 64).toString('base64url');
  return [passwordHashPrefix, salt, hash].join('$');
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [algorithm, salt, hash] = passwordHash.split('$');

  if (algorithm !== passwordHashPrefix || !salt || !hash) {
    return false;
  }

  const expectedHash = Buffer.from(hash, 'base64url');
  const actualHash = scryptSync(password, salt, expectedHash.length);

  return timingSafeEqual(expectedHash, actualHash);
}

export function createSessionToken(user: AuthUser, secret: string, ttlSeconds = 60 * 60 * 12): string {
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };

  return signToken(payload, secret);
}

export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  const parts = token.split('.');

  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = createSignature(`${encodedHeader}.${encodedPayload}`, secret);

  if (signature.length !== expectedSignature.length) {
    return null;
  }

  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionPayload;

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function getRolePermissions(role: UserRole) {
  return {
    canCreateCourses: role === 'teacher' || role === 'admin',
    hasAdminAccess: role === 'admin'
  };
}

export function roleCanCreateCourses(role: UserRole): boolean {
  return getRolePermissions(role).canCreateCourses;
}

function signToken(payload: SessionPayload, secret: string): string {
  const encodedHeader = Buffer.from(JSON.stringify(sessionHeader)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createSignature(`${encodedHeader}.${encodedPayload}`, secret);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function createSignature(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function parseEnrolledCourseIds(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(',')
    .map((courseId) => courseId.trim())
    .filter(Boolean);
}
