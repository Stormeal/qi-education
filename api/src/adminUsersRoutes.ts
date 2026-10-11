import { randomUUID } from 'node:crypto';
import { KeyedSerialQueue } from './keyedSerialQueue.js';
import { userChangeDto, type UserChange, type UserChangeOptions, type UserChangeRepository } from './userChangeRepository.js';
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { userRoleSchema, userStatusSchema, type AuthenticatedUser, type AuthUser } from './auth.js';
import type { AuthRepository } from './authRepository.js';
import type { MailSender } from './mailSender.js';
import { resetMailUnavailable, sendPasswordResetLink, type PasswordResetOptions } from './passwordResetDelivery.js';
import type { PasswordResetRepository } from './passwordResetRepository.js';

const notFound = { message: 'User not found' };
const unavailable = { message: 'User management is temporarily unavailable. Please try again later.' };
const userDto = ({ id, email, displayName, role, status, createdAt }: AuthUser) => ({ id, email, displayName, role, status, createdAt });

export function registerAdminUserRoutes(app: Express, dependencies: {
  authenticate: RequestHandler; requireAdmin: RequestHandler; auth: AuthRepository;
  tokens: PasswordResetRepository; sender: MailSender; options?: PasswordResetOptions;
  changes: UserChangeRepository; changeOptions?: UserChangeOptions;
}): void {
  const { authenticate, requireAdmin, auth, tokens, sender, options, changes, changeOptions } = dependencies;
  const accessWrites = new KeyedSerialQueue();
  const logChange = async (actor: AuthenticatedUser, target: AuthUser, field: UserChange['field'], to: string) => {
    try {
      await changes.append({ id: (changeOptions?.createId ?? randomUUID)(), at: new Date((changeOptions?.now ?? Date.now)()).toISOString(),
        actor: { id: actor.id, displayName: actor.displayName }, target: { id: target.id, displayName: target.displayName, email: target.email },
        field, from: target[field], to });
    } catch { console.warn('User change log write failed.'); }
  };
  const path = '/admin/users';
  const handle = (handler: (request: Request, response: Response) => Promise<void>) =>
    async (request: Request, response: Response) => {
      try { await handler(request, response); }
      catch { response.status(503).json(unavailable); }
    };
  app.get(path, authenticate, requireAdmin, handle(async (request, response) => {
    const input = request.query.search;
    if (Object.keys(request.query).some(key => key.startsWith('search[')) ||
        (input !== undefined && (typeof input !== 'string' || input.trim().length > 100))) {
      response.status(400).json({ message: 'Search must be a string of at most 100 characters after trimming.' }); return;
    }
    const search = typeof input === 'string' ? input.trim().toLowerCase() : '';
    const matches = (await auth.listUsers()).filter(user => user.displayName.toLowerCase().includes(search) || user.email.toLowerCase().includes(search));
    matches.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
    response.json({ users: matches.slice(0, 50).map(userDto), total: matches.length });
  }));
  app.patch(`${path}/:userId/role`, authenticate, requireAdmin, handle(async (request, response) => {
    const role = userRoleSchema.safeParse(request.body?.role);
    if (!role.success) { response.status(400).json({ message: 'Role must be student, teacher or admin.' }); return; }
    const userId = String(request.params.userId);
    if (userId === (request as Request & { user: AuthenticatedUser }).user.id) {
      response.status(409).json({ message: 'You cannot change your own role.', code: 'own-role' }); return;
    }
    await accessWrites.run(userId, async () => {
      const result = await auth.updateRoleWithChange(userId, role.data);
      if (!result) { response.status(404).json(notFound); return; }
      if (result.previous) await logChange((request as Request & { user: AuthenticatedUser }).user, result.previous, 'role', result.user.role);
      response.json(userDto(result.user));
    });
  }));
  app.patch(`${path}/:userId/status`, authenticate, requireAdmin, handle(async (request, response) => {
    const status = userStatusSchema.safeParse(request.body?.status);
    if (!status.success) { response.status(400).json({ message: 'Status must be active or disabled.' }); return; }
    const userId = String(request.params.userId);
    const actor = (request as Request & { user: AuthenticatedUser }).user;
    if (userId === actor.id) {
      response.status(409).json({ message: 'You cannot change the status of your own account.', code: 'own-status' }); return;
    }
    await accessWrites.run(userId, async () => {
      const result = await auth.updateStatusWithChange(userId, status.data);
      if (!result) { response.status(404).json(notFound); return; }
      if (result.previous) await logChange(actor, result.previous, 'status', result.user.status);
      response.json(userDto(result.user));
    });
  }));
  app.get(`${path}/changes`, authenticate, requireAdmin, handle(async (_request, response) => {
    response.json({ changes: (await changes.recent()).map(userChangeDto) });
  }));
  app.post(`${path}/:userId/password-reset`, authenticate, requireAdmin, handle(async (request, response) => {
    const user = await auth.findById(String(request.params.userId), { fresh: true });
    if (!user) { response.status(404).json(notFound); return; }
    if (user.status !== 'active') { response.status(409).json({ message: 'This account is not active.', code: 'account-inactive' }); return; }
    const outcome = await sendPasswordResetLink(user, { tokens, sender, options });
    if (outcome === 'limit') { response.status(409).json({ message: 'This account already received three reset mails in the last hour.', code: 'reset-limit' }); return; }
    if (outcome === 'mail-unavailable') { response.status(503).json(resetMailUnavailable); return; }
    response.status(202).json({ message: `A reset link was sent to ${user.email}.` });
  }));
  // Authentication lookup failures must not reach the global diagnostic logger.
  app.use(path, (_error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    response.status(503).json(unavailable);
  });
}
