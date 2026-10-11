import { createHash, randomBytes } from 'node:crypto';
import { passwordCredentialVersion, type AuthUser } from './auth.js';
import { apiConfig } from './config.js';
import type { MailSender } from './mailSender.js';
import type { PasswordResetRepository } from './passwordResetRepository.js';

export type PasswordResetOptions = { now?: () => number; newToken?: () => string; appPublicUrl?: string };
export const resetMailUnavailable = { message: 'We could not send email right now. Please try again later.' };
export function resetTokenHash(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43,200}$/.test(value)
    ? createHash('sha256').update(value).digest('hex') : null;
}

// Shared by public and admin requests: callers decide how much account information
// their response may reveal, while tokens, limits and the message stay identical.
export async function sendPasswordResetLink(user: AuthUser, dependencies: {
  tokens: PasswordResetRepository; sender: MailSender; options?: PasswordResetOptions;
}): Promise<'sent' | 'limit' | 'mail-unavailable'> {
  const { tokens, sender, options = {} } = dependencies;
  if (!sender.available) return 'mail-unavailable';
  const now = options.now ?? Date.now;
  const newToken = options.newToken ?? (() => randomBytes(32).toString('base64url'));
  const publicUrl = (options.appPublicUrl ?? apiConfig.APP_PUBLIC_URL ?? 'http://localhost:4200').replace(/\/+$/, '');
  const raw = newToken(), hash = resetTokenHash(raw);
  if (!hash) throw new Error('Invalid generated reset token.');
  if (!await tokens.reserve(user.id, hash, now(), passwordCredentialVersion(user.passwordHash))) return 'limit';
  try {
    await sender.send({ to: user.email, subject: 'Reset your QI-Education password',
      text: `We received a request to reset your QI-Education password.\n\nUse this link within 60 minutes:\n${publicUrl}/reset-password#token=${raw}\n\nIf you did not request this, you can ignore this message.` });
  } catch {
    // An uncertain delivery still counts. Its pending token cannot be used.
    return 'mail-unavailable';
  }
  // Preserve the existing distinction between provider and uncertain activation
  // failures. Do not retry a send or activation after storage reports an error.
  if (!await tokens.activate(user.id, hash)) throw new Error('Reset reservation expired.');
  return 'sent';
}
