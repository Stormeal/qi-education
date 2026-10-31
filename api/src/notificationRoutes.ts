import type { Express, Request, RequestHandler } from 'express';
import type { AuthenticatedUser } from './auth.js';
import type { NotificationRepository } from './notificationRepository.js';

// Under Vercel's shortest function limit; the browser reconnects when a stream ends.
const STREAM_MS = 50_000;
const HEARTBEAT_MS = 20_000;

export function registerNotificationRoutes(app: Express, dependencies: {
  authenticate: RequestHandler; notifications: NotificationRepository; streamMs?: number;
}): void {
  const { authenticate, notifications, streamMs = STREAM_MS } = dependencies;
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
  // Server-sent events: the unread count on connect and after every change to the caller's rows.
  app.get('/notifications/stream', authenticate, handle(async (request, response) => {
    const id = userId(request);
    let closed = false;
    let unsubscribe = () => {};
    const sendCount = async () => {
      try {
        const count = await notifications.countUnread(id);
        if (!closed) response.write(`event: count\ndata: ${count}\n\n`);
      } catch { /* The next change or reconnect sends a fresh count. */ }
    };
    unsubscribe = await notifications.subscribe(id, () => { void sendCount(); });
    response.status(200).set({ 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' });
    response.flushHeaders();
    const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), HEARTBEAT_MS);
    const finish = () => {
      if (closed) return;
      closed = true; clearInterval(heartbeat); clearTimeout(timer); unsubscribe(); response.end();
    };
    const timer = setTimeout(finish, streamMs);
    response.on('close', finish);
    await sendCount();
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
