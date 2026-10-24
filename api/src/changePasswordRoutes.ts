import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { hashPasswordAsync, signupSchema, verifyPasswordAsync, type AuthenticatedUser } from './auth.js';
import type { AuthRepository } from './authRepository.js';
import { sendPasswordChangedNotice, type MailSender } from './mailSender.js';
import type { PasswordResetRepository } from './passwordResetRepository.js';

const unavailable = { message: 'Password change is temporarily unavailable. Please try again later.' };

export function registerChangePasswordRoute(app: Express, dependencies: {
  authenticate: RequestHandler; auth: AuthRepository; tokens: PasswordResetRepository; sender: MailSender;
}): void {
  const { authenticate, auth, tokens, sender } = dependencies;
  const path = '/users/me/password';
  app.post(path, authenticate, async (request: Request, response: Response) => {
    try {
      const accountId = (request as Request & { user: AuthenticatedUser }).user.id;
      const user = await auth.findById(accountId, { fresh: true });
      if (!user || user.status !== 'active') { response.status(401).json({ message: 'Authentication required' }); return; }
      const current = request.body?.currentPassword;
      if (typeof current !== 'string' || current.length > 200 || !(await verifyPasswordAsync(current, user.passwordHash))) {
        response.status(400).json({ message: 'Your current password is not correct.', code: 'current-password-incorrect' }); return;
      }
      const password = signupSchema.shape.password.safeParse(request.body?.newPassword);
      if (!password.success) { response.status(400).json({ message: password.error.issues[0].message }); return; }
      if (password.data === current) {
        response.status(400).json({ message: 'Choose a password that differs from your current one.' }); return;
      }
      // Cancel before writing: a failed/uncertain cancellation must not leave a
      // changed password with legacy reset links still usable. Preserve mail slots.
      await tokens.invalidateAll(user.id);
      const updated = await auth.updatePasswordHash(user.id, await hashPasswordAsync(password.data), user.passwordHash);
      if (!updated) { response.status(503).json(unavailable); return; }
      await sendPasswordChangedNotice(sender, updated.email);
      response.status(204).end();
    } catch { response.status(503).json(unavailable); }
  });
  // Authentication read failures arrive through next(error). Keep this route's
  // storage failure private instead of reaching the global diagnostic logger.
  app.use(path, (_error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    response.status(503).json(unavailable);
  });
}
