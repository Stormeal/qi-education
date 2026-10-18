import type { Express, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedUser } from './auth.js';
import { careerPathIdSchema, selectCareerPathSchema } from './careerPath.js';
import { AccountCareersError, type AccountCareersService } from './accountCareers.js';

const declarationSchema = z.object({ actionId: careerPathIdSchema });
const cvRecognitionSchema = z.object({ actionIds: z.array(careerPathIdSchema).min(1).max(50) });
export function registerAccountCareersRoutes(app: Express, authenticate: RequestHandler, service: AccountCareersService): void {
  const account = (request: Request) => (request as Request & { user: AuthenticatedUser }).user.id;
  app.use(['/users/me/careers', '/users/me/career-focus', '/users/me/achievements'], (_request, response, next) => {
    response.set('Cache-Control', 'private, no-store'); response.vary('Authorization'); next();
  });
  const handle = (operation: (request: Request, response: Response) => Promise<void>): RequestHandler => async (request, response, next) => {
    try { await operation(request, response); }
    catch (error) {
      if (error instanceof AccountCareersError) response.status(error.status).json({ message: error.message, ...(error.code ? { code: error.code } : {}) });
      else next(error);
    }
  };
  app.get('/users/me/careers', authenticate, handle(async (request, response) => {
    response.json(await service.get(account(request)));
  }));
  app.put('/users/me/careers/:pathId', authenticate, handle(async (request, response) => {
    response.json(await service.follow(account(request), careerPathIdSchema.parse(request.params.pathId)));
  }));
  app.delete('/users/me/careers/:pathId', authenticate, handle(async (request, response) => {
    response.json(await service.unfollow(account(request), careerPathIdSchema.parse(request.params.pathId)));
  }));
  app.put('/users/me/career-focus', authenticate, handle(async (request, response) => {
    response.json(await service.focus(account(request), selectCareerPathSchema.parse(request.body).pathId));
  }));
  app.post('/users/me/achievements', authenticate, handle(async (request, response) => {
    response.json(await service.declare(account(request), declarationSchema.parse(request.body).actionId));
  }));
  app.post('/users/me/achievements/cv', authenticate, handle(async (request, response) => {
    response.json(await service.recognise(account(request), cvRecognitionSchema.parse(request.body).actionIds));
  }));
}
