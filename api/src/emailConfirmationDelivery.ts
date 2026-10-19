import { randomBytes } from 'node:crypto';
import type { AuthUser } from './auth.js';
import { apiConfig } from './config.js';
import type { MailSender } from './mailSender.js';
import type { EmailConfirmationRepository } from './emailConfirmationRepository.js';
import { resetTokenHash } from './passwordResetDelivery.js';

export type EmailConfirmationOptions = { now?: () => number; newToken?: () => string; appPublicUrl?: string };
export async function sendEmailConfirmationLink(user: Pick<AuthUser, 'id' | 'email'>, dependencies: {
  tokens: EmailConfirmationRepository; sender: MailSender; options?: EmailConfirmationOptions;
}): Promise<'sent' | 'mail-unavailable' | { retryAfter: number }> {
  const { tokens, sender, options = {} } = dependencies;
  const now = options.now ?? Date.now;
  const raw = (options.newToken ?? (() => randomBytes(32).toString('base64url')))();
  const hash = resetTokenHash(raw);
  if (!hash) throw new Error('Invalid generated confirmation token.');
  if (!await tokens.reserve(user.id, hash, now())) return { retryAfter: await tokens.mailRetryAfter(user.id, now()) };
  // Reserve before sending so failed, uncertain and parallel deliveries cannot
  // bypass the per-account mail budget. Pending links are never usable.
  if (!sender.available) return 'mail-unavailable';
  const publicUrl = (options.appPublicUrl ?? apiConfig.APP_PUBLIC_URL ?? 'http://localhost:4200').replace(/\/+$/, '');
  try {
    await sender.send({ to: user.email, subject: 'Confirm your QI Academy email address',
      text: `Confirm your QI Academy email address:\n\n${publicUrl}/confirm-email#token=${raw}\n\nThis link works for 24 hours.\n\nIf you did not create this account, you can ignore this message.` });
  } catch { return 'mail-unavailable'; }
  if (!await tokens.activate(user.id, hash)) throw new Error('Confirmation reservation expired.');
  return 'sent';
}
