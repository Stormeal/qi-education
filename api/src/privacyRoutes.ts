import type { Express, RequestHandler } from 'express';
import { z } from 'zod';
import { apiConfig } from './config.js';
import { verifyPasswordAsync, verifySessionToken } from './auth.js';
import type { AuthRepository } from './authRepository.js';
import type { SignInLimit } from './signInLimit.js';
import { PrivacyError, type PrivacyService } from './privacyService.js';

const erasureSchema = z.object({ password: z.string().min(1).max(200), confirmation: z.literal('DELETE') }).strict();
export function registerPrivacyRoutes(app: Express, deps: {
  authenticate: RequestHandler; auth: AuthRepository; privacy: PrivacyService; signInLimit: SignInLimit;
}): void {
  const privateResponse: RequestHandler = (_request, response, next) => {
    response.set('Cache-Control', 'private, no-store'); response.vary('Authorization'); next();
  };
  app.get('/users/me/privacy/export', privateResponse, deps.authenticate, async (request, response, next) => {
    try {
      const user = (request as typeof request & { user: { id: string } }).user;
      response.json(await deps.privacy.exportUserData(user.id));
    } catch (error) { next(error); }
  });
  app.post('/users/me/privacy/erase', privateResponse, async (request, response, next) => {
    try {
      if (!apiConfig.AUTH_TOKEN_SECRET || deps.auth.unavailableReason) throw new PrivacyError(503, 'Authentication is temporarily unavailable.');
      if (deps.auth.readOnly) throw new PrivacyError(503, 'Account deletion is temporarily unavailable during maintenance.');
      const bearer = request.header('authorization');
      const session = bearer?.startsWith('Bearer ') ? verifySessionToken(bearer.slice(7), apiConfig.AUTH_TOKEN_SECRET) : null;
      if (!session) throw new PrivacyError(401, 'Authentication required');
      const user = await deps.auth.findById(session.sub, { fresh: true });
      if (!user || (user.status !== 'active' && !user.privacyErasure)) throw new PrivacyError(401, 'Authentication required');
      const input = erasureSchema.parse(request.body);
      // A completed retry has no side effects; never resurrect its credentials.
      if (user.privacyErasure?.state === 'complete') { response.status(204).send(); return; }
      const reservation = await deps.signInLimit.reserve(user.email);
      if (reservation.retryAfter) {
        response.set('Retry-After', String(reservation.retryAfter)).status(429).json({ message: 'Too many password attempts. Try again later.' }); return;
      }
      let outcome: 'failure' | 'cancel' = 'cancel';
      try {
        if (!await verifyPasswordAsync(input.password, user.passwordHash)) {
          outcome = 'failure'; throw new PrivacyError(401, 'Incorrect password');
        }
        await deps.privacy.eraseUser(user.id, user.passwordHash);
      } finally {
        if (reservation.ticket) await deps.signInLimit.complete(user.email, reservation.ticket, outcome);
      }
      response.status(204).send();
    } catch (error) {
      if (error instanceof PrivacyError) response.status(error.status).json({ message: error.message, ...(error.organizations ? { organizations: error.organizations } : {}) });
      else next(error);
    }
  });
}
