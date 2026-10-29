import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryNotificationRepository } from './notificationRepository.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  vi.restoreAllMocks();
});
async function setup() {
  const auth = new InMemoryAuthRepository(), notifications = new InMemoryNotificationRepository();
  const users = await auth.listUsers(), user = users.find(u => u.role === 'student')!, other = users.find(u => u.role === 'teacher')!;
  const server = createServer({ authRepository: auth, notificationRepository: notifications }).listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, method = 'GET', caller: typeof user | null = user) => fetch(base + path, {
    method, headers: caller ? { authorization: `Bearer ${createSessionToken(caller, apiConfig.AUTH_TOKEN_SECRET)}` } : {},
  });
  const create = (userId: string) => notifications.create({ userId, type: 'org-invitation', title: 'Invitation', link: '/organization' });
  return { auth, notifications, user, other, request, create };
}
describe.each(['', '/api'])('US-P019 A4 notification HTTP (%s)', prefix => {
  it('lists only caller snapshots, never marks on open, and scopes read/all writes', async () => {
    const f = await setup(), own = await f.create(f.user.id), foreign = await f.create(f.other.id);
    const list = await f.request(prefix + '/notifications');
    expect(list.status).toBe(200);
    expect(list.headers.get('cache-control')).toBe('private, no-store');
    expect(list.headers.get('vary')).toContain('Authorization');
    expect(await list.json()).toEqual({ notifications: [own] });
    expect(await f.notifications.countUnread(f.user.id)).toBe(1);
    expect((await f.request(prefix + `/notifications/${foreign.id}/read`, 'POST')).status).toBe(404);
    expect((await f.request(prefix + `/notifications/${own.id}/read`, 'POST')).status).toBe(204);
    expect((await f.request(prefix + `/notifications/${own.id}/read`, 'POST')).status).toBe(204);
    await f.create(f.user.id);
    expect((await f.request(prefix + '/notifications/read-all', 'POST')).status).toBe(204);
    expect(await f.notifications.countUnread(f.user.id)).toBe(0);
    expect(await f.notifications.countUnread(f.other.id)).toBe(1);
  });
  it('requires an active authenticated caller on every route', async () => {
    const f = await setup();
    for (const [path, method] of [['/notifications', 'GET'], ['/notifications/id/read', 'POST'], ['/notifications/read-all', 'POST']]) {
      expect((await f.request(prefix + path, method, null)).status).toBe(401);
    }
    await f.auth.updateStatus(f.user.id, 'disabled');
    expect((await f.request(prefix + '/notifications')).status).toBe(401);
  });
  it('returns safe retryable errors when the notification store fails', async () => {
    const f = await setup();
    for (const [operation, path, method] of [['listForUser', '/notifications', 'GET'], ['markRead', '/notifications/id/read', 'POST'], ['markAllRead', '/notifications/read-all', 'POST']] as const) {
      vi.spyOn(f.notifications, operation).mockRejectedValue(new Error('private storage address'));
      const response = await f.request(prefix + path, method);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ message: 'Notifications are temporarily unavailable. Please try again.' });
    }
  });
});
