import type { AuthUser } from './auth.js';
import type { AuthRepository } from './authRepository.js';
import { DuplicateAccountError } from './authStore.js';

export const SYSTEM_ACCOUNT_ID = 'qi-academy-system';

// Lazy and awaited by the ownership transfer workflow. The unique account ID and
// email make creation safe across concurrent requests and separate API hosts.
export async function ensureSystemAccount(auth: AuthRepository): Promise<AuthUser> {
  const existing = await auth.findById(SYSTEM_ACCOUNT_ID);
  if (existing) return existing;
  try {
    return await auth.createUser({ id: SYSTEM_ACCOUNT_ID, email: `system:${SYSTEM_ACCOUNT_ID}`, displayName: 'QI Academy',
      role: 'admin', status: 'disabled', passwordHash: '', emailConfirmed: false,
      createdAt: new Date().toISOString(), enrolledCourseIds: [] });
  } catch (error) {
    if (!(error instanceof DuplicateAccountError)) throw error;
    const created = await auth.findById(SYSTEM_ACCOUNT_ID);
    if (!created) throw error;
    return created;
  }
}
