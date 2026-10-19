import type { Express, Request, RequestHandler, Response } from 'express';
import type { AuthenticatedUser } from './auth.js';
import type { AuthRepository } from './authRepository.js';
import type { ClientLimit } from './clientLimit.js';
import type { MailSender } from './mailSender.js';
import type { EmailConfirmationRepository } from './emailConfirmationRepository.js';
import { sendEmailConfirmationLink, type EmailConfirmationOptions } from './emailConfirmationDelivery.js';
import { resetMailUnavailable, resetTokenHash } from './passwordResetDelivery.js';

const invalid = { message: 'This confirmation link is no longer valid. Request a new one.', code: 'confirm-link-invalid' };
const unavailable = { message: 'Email confirmation is temporarily unavailable. Please try again later.' };

export function registerEmailConfirmationRoutes(app: Express, dependencies: {
  auth: AuthRepository; tokens: EmailConfirmationRepository; sender: MailSender; options?: EmailConfirmationOptions;
  authenticate: RequestHandler; clientLimit: ClientLimit;
}) {
  const { auth, tokens, sender, options = {} } = dependencies;
  const now = options.now ?? Date.now;
  const route = (handler: (request: Request, response: Response) => Promise<unknown>) =>
    async (request: Request, response: Response) => {
      try { await handler(request, response); }
      catch { response.status(503).json(unavailable); }
    };

  app.post('/auth/email-confirmation/confirm', route(async (request, response) => {
    const hash = resetTokenHash(request.body?.token);
    const token = hash ? await tokens.findActive(hash, now()) : null;
    const user = token ? await auth.findById(token.userId, { fresh: true }) : null;
    if (!user || user.status !== 'active') { response.status(410).json(invalid); return; }
    const userId = await tokens.consume(hash!, now());
    if (!userId) { response.status(410).json(invalid); return; }
    const confirmed = await auth.confirmEmail(userId);
    if (!confirmed) { response.status(410).json(invalid); return; }
    response.status(204).end();
  }));

  app.post('/auth/email-confirmation/resend', dependencies.authenticate, route(async (request, response) => {
    const user = (request as Request & { user: AuthenticatedUser }).user;
    if (user.emailConfirmed) { response.status(204).end(); return; }
    if (!await dependencies.clientLimit.allow('confirmation', request, response)) return;
    const result = await sendEmailConfirmationLink(user, { tokens, sender, options });
    if (result === 'mail-unavailable') { response.status(503).json(resetMailUnavailable); return; }
    if (typeof result === 'object') {
      const minutes = Math.ceil(result.retryAfter / 60);
      response.set('Retry-After', String(result.retryAfter)).status(429).json({
        message: `You have asked for several links in a short time. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
        code: 'too-many-requests',
      });
      return;
    }
    response.status(202).json({ message: `We have sent a new link to ${user.email}. It works for 24 hours.` });
  }));
}
