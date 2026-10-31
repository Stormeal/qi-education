import type { Express, Request, RequestHandler } from 'express';
import { z } from 'zod';
import type { AuthenticatedUser } from './auth.js';
import type { TermsAcceptanceRepository } from './termsAcceptanceRepository.js';
import { TERMS_VERSIONS } from './termsDocuments.js';

const acceptanceSchema = z.object({ documentId: z.enum(['tos', 'purchase']) }).strict();
export function registerTermsRoutes(app: Express, deps: { authenticate: RequestHandler; terms: TermsAcceptanceRepository }): void {
  app.post('/users/me/terms/accept', (_request, response, next) => {
    response.set('Cache-Control', 'private, no-store'); response.vary('Authorization'); next();
  }, deps.authenticate, async (request, response) => {
    const input = acceptanceSchema.safeParse(request.body);
    if (!input.success) { response.status(400).json({ message: 'Choose the terms document to accept.' }); return; }
    const user = (request as Request & { user: AuthenticatedUser }).user;
    try {
      await deps.terms.record(user.id, input.data.documentId, TERMS_VERSIONS[input.data.documentId]);
      response.status(204).send();
    } catch {
      response.status(503).json({ message: 'Terms acceptance is temporarily unavailable. Please try again.' });
    }
  });
}
