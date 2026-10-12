import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { hashPassword, passwordCredentialVersion, signupSchema } from './auth.js';
import type { AuthRepository } from './authRepository.js';
import { sendPasswordChangedNotice, type MailSender } from './mailSender.js';
import type { PasswordResetRepository } from './passwordResetRepository.js';
import type { SignInLimit } from './signInLimit.js';
import { resetMailUnavailable as mailUnavailable, resetTokenHash as tokenHash, sendPasswordResetLink, type PasswordResetOptions } from './passwordResetDelivery.js';
export type { PasswordResetOptions } from './passwordResetDelivery.js';
const accepted = { message: 'If an account exists for this address, we have sent a reset link.' };
const invalid = { message: 'This reset link is no longer valid. Request a new one.', code: 'reset-link-invalid' };
const storageUnavailable = { message: 'Password reset is temporarily unavailable. Please try again later.' };

export function registerPasswordResetRoutes(app: Express, dependencies: {
  auth: AuthRepository; tokens: PasswordResetRepository; sender: MailSender; options?: PasswordResetOptions;
  signInLimit?: SignInLimit;
}) {
  const { auth, tokens, sender, options = {} } = dependencies;
  const now = options.now ?? Date.now;
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
    const outcome = await sendPasswordResetLink(user, { tokens, sender, options });
    if (outcome === 'mail-unavailable') { response.status(503).json(mailUnavailable); return; }
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
    await dependencies.signInLimit?.clear(updated.email);
    await sendPasswordChangedNotice(sender, updated.email);
    response.status(204).end();
  }));
}
