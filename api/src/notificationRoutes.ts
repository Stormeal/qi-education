import type { Express, Request, RequestHandler } from 'express';
import type { AuthenticatedUser } from './auth.js';
import type { NotificationRepository } from './notificationRepository.js';

export function registerNotificationRoutes(app: Express, dependencies: {
  authenticate: RequestHandler; notifications: NotificationRepository;
}): void {
  const { authenticate, notifications } = dependencies;
  const userId = (request: Request) => (request as Request & { user: AuthenticatedUser }).user.id;
  app.use('/notifications', (_request, response, next) => {
    response.set('Cache-Control', 'private, no-store'); response.vary('Authorization'); next();
  });
  const handle = (operation: RequestHandler): RequestHandler => async (request, response, next) => {
    try { await operation(request, response, next); }
    catch { response.status(503).json({ message: 'Notifications are temporarily unavailable. Please try again.' }); }
  };
  app.get('/notifications', authenticate, handle(async (request, response) => {
    response.json({ notifications: await notifications.listForUser(userId(request), 50) });
  }));
  app.post('/notifications/read-all', authenticate, handle(async (request, response) => {
    await notifications.markAllRead(userId(request)); response.status(204).end();
  }));
  app.post('/notifications/:id/read', authenticate, handle(async (request, response) => {
    if (!await notifications.markRead(String(request.params.id), userId(request))) {
      response.status(404).json({ message: 'Notification not found.' }); return;
    }
    response.status(204).end();
  }));
}
