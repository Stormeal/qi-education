import { createHash, randomBytes } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { hashPassword, passwordCredentialVersion, signupSchema } from './auth.js';
import type { AuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { sendPasswordChangedNotice, type MailSender } from './mailSender.js';
import type { PasswordResetRepository } from './passwordResetRepository.js';

export type PasswordResetOptions = { now?: () => number; newToken?: () => string; appPublicUrl?: string };
const accepted = { message: 'If an account exists for this address, we have sent a reset link.' };
const mailUnavailable = { message: 'We could not send email right now. Please try again later.' };
const invalid = { message: 'This reset link is no longer valid. Request a new one.', code: 'reset-link-invalid' };
const storageUnavailable = { message: 'Password reset is temporarily unavailable. Please try again later.' };
function tokenHash(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43,200}$/.test(value)
    ? createHash('sha256').update(value).digest('hex') : null;
}

export function registerPasswordResetRoutes(app: Express, dependencies: {
  auth: AuthRepository; tokens: PasswordResetRepository; sender: MailSender; options?: PasswordResetOptions;
}) {
  const { auth, tokens, sender, options = {} } = dependencies;
  const now = options.now ?? Date.now;
  const newToken = options.newToken ?? (() => randomBytes(32).toString('base64url'));
  const publicUrl = (options.appPublicUrl ?? apiConfig.APP_PUBLIC_URL ?? 'http://localhost:4200').replace(/\/+$/, '');
  const route = (handler: (request: Request, response: Response) => Promise<unknown>) =>
    async (request: Request, response: Response) => {
      try { await handler(request, response); }
      catch { response.status(500).json(storageUnavailable); }
    };

  app.post('/auth/password-reset/request', route(async (request, response) => {
    const input = request.body?.email;
    const email = z.email().safeParse(typeof input === 'string' ? input.trim().toLowerCase() : input);
    if (!email.success) { response.status(400).json({ message: 'Enter a valid email address.' }); return; }
    if (!sender.available || auth.unavailableReason) { response.status(503).json(mailUnavailable); return; }
    const user = await auth.findByEmail(email.data);
    if (!user || user.status !== 'active') { response.status(202).json(accepted); return; }
    const raw = newToken(); const hash = tokenHash(raw);
    if (!hash) throw new Error('Invalid generated reset token.');
    if (!await tokens.reserve(user.id, hash, now(), passwordCredentialVersion(user.passwordHash))) { response.status(202).json(accepted); return; }
    try {
      await sender.send({ to: user.email, subject: 'Reset your QI-Education password',
        text: `We received a request to reset your QI-Education password.\n\nUse this link within 60 minutes:\n${publicUrl}/reset-password#token=${raw}\n\nIf you did not request this, you can ignore this message.` });
    } catch {
      // Delivery may have happened despite a timeout. Retain its unusable pending
      // slot for the rolling hour, preventing repeated uncertain sends from bypassing the limit.
      response.status(503).json(mailUnavailable); return;
    }
    // Storage failures after provider acceptance are distinct from a mail failure.
    // An uncertain activation may have succeeded; do not retry delivery or activation.
    if (!await tokens.activate(user.id, hash)) throw new Error('Reset reservation expired.');
    response.status(202).json(accepted);
  }));

  app.post('/auth/password-reset/check', route(async (request, response) => {
    const hash = tokenHash(request.body?.token);
    const token = hash ? await tokens.findActive(hash, now()) : null;
    const user = token ? await auth.findById(token.userId, { fresh: true }) : null;
    if (!user || user.status !== 'active' || (token?.credentialVersion && token.credentialVersion !== passwordCredentialVersion(user.passwordHash))) {
      response.status(410).json(invalid); return;
    }
    response.status(204).end();
  }));

  app.post('/auth/password-reset/confirm', route(async (request, response) => {
    const hash = tokenHash(request.body?.token);
    const token = hash ? await tokens.findActive(hash, now()) : null;
    const user = token ? await auth.findById(token.userId, { fresh: true }) : null;
    if (!user || user.status !== 'active' || (token?.credentialVersion && token.credentialVersion !== passwordCredentialVersion(user.passwordHash))) {
      response.status(410).json(invalid); return;
    }
    const password = signupSchema.shape.password.safeParse(request.body?.password);
    if (!password.success) { response.status(400).json({ message: password.error.issues[0].message }); return; }
    const claimedUserId = await tokens.consume(hash!, now());
    if (!claimedUserId) { response.status(410).json(invalid); return; }
    // A late request can pass its initial check while a profile write is in flight,
    // then claim only after that change finishes. Recheck after claiming so this
    // unclaimed link cannot overwrite the new credential. Legacy links use the
    // credential observed before claiming; new links carry their issuing version.
    const currentUser = await auth.findById(claimedUserId, { fresh: true });
    const expectedCredential = token?.credentialVersion ?? passwordCredentialVersion(user.passwordHash);
    if (!currentUser || currentUser.status !== 'active' || passwordCredentialVersion(currentUser.passwordHash) !== expectedCredential) {
      response.status(410).json(invalid); return;
    }
    // Never reactivate a claim if the Sheets write failed or its outcome is uncertain.
    const updated = await auth.updatePasswordHash(claimedUserId, hashPassword(password.data));
    if (!updated) { response.status(410).json(invalid); return; }
    await sendPasswordChangedNotice(sender, updated.email);
    response.status(204).end();
  }));
}
