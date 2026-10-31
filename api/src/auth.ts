import { createHash, createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';

const passwordHashPrefix = 'scrypt';
const sessionHeader = {
  alg: 'HS256',
  typ: 'JWT'
};

export const userRoleSchema = z.enum(['student', 'teacher', 'admin']);
export const userStatusSchema = z.enum(['active', 'disabled']);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200)
});

export const signupSchema = z.object({
  turnstileToken: z.string().min(1).max(2048).optional(),
  displayName: z.string().trim().min(2).max(120),
  email: z.email().transform((value) => value.trim().toLowerCase())
    .refine(value => !value.endsWith('.invalid'), 'This email domain is reserved.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200)
    .regex(/[A-Z]/, 'Password must include at least one capital letter')
    .regex(/[0-9]/, 'Password must include at least one number')
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  enrolledCourseIds: string[];
  emailConfirmed?: boolean;
  privacyErasure?: { state: 'pending' | 'complete'; startedAt: string; cleanupStarted?: boolean };
  privacyMutations?: Record<string, number>;
};

export type AuthenticatedUser = Pick<AuthUser, 'id' | 'email' | 'displayName' | 'role' | 'status' | 'createdAt' | 'enrolledCourseIds'> & { emailConfirmed: boolean };

type SessionPayload = {
  sub: string;
  email: string;
  role: UserRole;
  displayName: string;
  exp: number;
};

export function toAuthenticatedUser(user: AuthUser): AuthenticatedUser {
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role, status: user.status,
    createdAt: user.createdAt, enrolledCourseIds: [...user.enrolledCourseIds], emailConfirmed: user.emailConfirmed !== false };
}

export function assertPrivacyMutationId(mutationId: string): void {
  if (!z.uuid().safeParse(mutationId).success) throw new Error('Invalid privacy mutation ID.');
}

export function requireConfirmedEmail(user: { emailConfirmed?: boolean }): boolean {
  return user.emailConfirmed !== false;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(password, salt, 64).toString('base64url');
  return [passwordHashPrefix, salt, hash].join('$');
}

// Bind recovery links to this salted credential without duplicating its hash.
export function passwordCredentialVersion(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex');
}

// X8 F7: request paths use these; scrypt runs on the libuv thread pool, so other requests keep being served meanwhile.
const scryptAsync = promisify(scrypt) as (password: string, salt: string, length: number) => Promise<Buffer>;

export async function hashPasswordAsync(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  return [passwordHashPrefix, salt, (await scryptAsync(password, salt, 64)).toString('base64url')].join('$');
}

export async function verifyPasswordAsync(password: string, passwordHash: string): Promise<boolean> {
  const [algorithm, salt, hash] = passwordHash.split('$');
  if (algorithm !== passwordHashPrefix || !salt || !hash) return false;
  const expectedHash = Buffer.from(hash, 'base64url');
  return timingSafeEqual(expectedHash, await scryptAsync(password, salt, expectedHash.length));
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

  if (!/^[A-Za-z0-9_-]+$/.test(signature) || Buffer.byteLength(signature) !== Buffer.byteLength(expectedSignature)) {
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
