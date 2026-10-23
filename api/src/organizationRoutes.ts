import type { Express, Request, RequestHandler, Response } from 'express';
import { z, ZodError } from 'zod';
import type { AuthenticatedUser } from './auth.js';
import { ClientLimit } from './clientLimit.js';
import { createClientLimitRepository } from './clientLimitRepository.js';
import { OrganizationError, acceptSchema, inviteSchema, priceSchema } from './organization.js';
import type { OrganizationService } from './organizationService.js';

export const organizationRoots = ['/users/me/organization', '/users/me/organization-request', '/admin/organization-requests',
  '/admin/organizations', '/admin/organization-prices', '/organization-prices', '/organizations', '/organization-invitations'];
const decision = z.discriminatedUnion('action', [z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('decline'), reason: z.string().trim().min(1).max(1000) })]);
const courseDecision = z.object({ action: z.enum(['approve', 'decline']) });
const career = z.object({ careerId: z.string().min(1).max(120).nullable() });
const course = z.object({ courseId: z.string().min(1).max(120) });
const token = z.object({ token: z.string().min(1).max(200) });

export function registerOrganizationRoutes(app: Express, authenticate: RequestHandler, requireAdmin: RequestHandler,
  service: OrganizationService, clientLimit = new ClientLimit(createClientLimitRepository())): void {
  app.use(organizationRoots, (_request, response, next) => {
    response.set('Cache-Control', 'private, no-store'); response.vary('Authorization'); next();
  });
  const user = (request: Request) => (request as Request & { user: AuthenticatedUser }).user;
  const param = (request: Request, key: string) => String(request.params[key]);
  const handle = (operation: (request: Request, response: Response) => Promise<unknown>): RequestHandler => async (request, response) => {
    try { await operation(request, response); }
    catch (error) {
      if (error instanceof OrganizationError) response.status(error.status).json({ message: error.message });
      else if (error instanceof ZodError) response.status(400).json({ message: 'Invalid request body' });
      else response.status(503).json({ message: 'Organizations are temporarily unavailable. Please try again.' });
    }
  };
  app.get('/users/me/organization', authenticate, handle(async (r, s) => s.json(await service.myOrganization(user(r).id))));
  app.post('/users/me/organization-request', authenticate, handle(async (r, s) => s.status(201).json(await service.submitRequest(user(r), r.body))));
  app.put('/users/me/organization-request', authenticate, handle(async (r, s) => s.json(await service.resubmitRequest(user(r), r.body))));
  app.delete('/users/me/organization', authenticate, handle(async (r, s) => { await service.leave(user(r).id); s.status(204).end(); }));
  app.get('/admin/organization-requests', authenticate, requireAdmin, handle(async (r, s) => s.json(await service.listRequests(r.query.state === undefined ? 'pending' : z.enum(['pending', 'declined', 'approved']).parse(r.query.state)))));
  app.post('/admin/organization-requests/:id/decision', authenticate, requireAdmin, handle(async (r, s) => s.json(await service.decide(user(r).id, param(r, 'id'), decision.parse(r.body)))));
  app.get('/admin/organizations', authenticate, requireAdmin, handle(async (_r, s) => s.json(await service.listOrganizations())));
  app.post('/admin/organizations/:id/suspend', authenticate, requireAdmin, handle(async (r, s) => s.json(await service.suspend(param(r, 'id')))));
  app.post('/admin/organizations/:id/reactivate', authenticate, requireAdmin, handle(async (r, s) => s.json(await service.reactivate(param(r, 'id')))));
  app.get('/organization-prices', authenticate, handle(async (_r, s) => s.json(await service.prices())));
  app.put('/admin/organization-prices/careers/:pathId', authenticate, requireAdmin, handle(async (r, s) => s.json(await service.setCareerPrice(param(r, 'pathId'), priceSchema.parse(r.body).priceDkk))));
  app.put('/admin/organization-prices/courses/:courseId', authenticate, requireAdmin, handle(async (r, s) => s.json(await service.setCoursePrice(param(r, 'courseId'), priceSchema.parse(r.body).priceDkk))));
  app.get('/organizations/:id/members', authenticate, handle(async (r, s) => s.json(await service.listMembers(user(r).id, param(r, 'id')))));
  app.delete('/organizations/:id/members/:userId', authenticate, handle(async (r, s) => { await service.removeMember(user(r).id, param(r, 'id'), param(r, 'userId')); s.status(204).end(); }));
  app.post('/organizations/:id/members/:userId/promote', authenticate, handle(async (r, s) => s.json(await service.promote(user(r).id, param(r, 'id'), param(r, 'userId')))));
  app.put('/organizations/:id/members/:userId/career', authenticate, handle(async (r, s) => s.json(await service.setCareer(user(r).id, param(r, 'id'), param(r, 'userId'), career.parse(r.body).careerId))));
  app.get('/organizations/:id/invitations', authenticate, handle(async (r, s) => s.json(await service.listInvitations(user(r).id, param(r, 'id')))));
  app.post('/organizations/:id/invitations', authenticate, handle(async (r, s) => s.status(201).json(await service.invite(user(r).id, param(r, 'id'), inviteSchema.parse(r.body).email))));
  app.post('/organizations/:id/invitations/:inviteId/resend', authenticate, handle(async (r, s) => s.json(await service.resend(user(r).id, param(r, 'id'), param(r, 'inviteId')))));
  app.delete('/organizations/:id/invitations/:inviteId', authenticate, handle(async (r, s) => { await service.cancel(user(r).id, param(r, 'id'), param(r, 'inviteId')); s.status(204).end(); }));
  app.post('/organization-invitations/check', handle(async (r, s) => {
    const input = token.parse(r.body);
    // Reuse the existing network confirmation budget; no account lookup precedes it.
    if (!await clientLimit.allow('confirmation', r, s)) return;
    s.json(await service.checkInvitation(input.token));
  }));
  app.post('/organization-invitations/accept', authenticate, handle(async (r, s) => {
    const input = acceptSchema.parse(r.body), result = await service.acceptInvitation(user(r), input.token);
    s.status('state' in result ? 202 : 200).json(result);
  }));
  app.get('/organizations/:id/course-requests', authenticate, handle(async (r, s) => s.json(await service.listCourseRequests(user(r).id, param(r, 'id')))));
  app.post('/organizations/:id/course-requests', authenticate, handle(async (r, s) => s.status(201).json(await service.requestCourse(user(r).id, param(r, 'id'), course.parse(r.body).courseId))));
  app.post('/organizations/:id/course-requests/:requestId/decision', authenticate, handle(async (r, s) => s.json(await service.decideCourseRequest(user(r).id, param(r, 'id'), param(r, 'requestId'), courseDecision.parse(r.body).action))));
}
