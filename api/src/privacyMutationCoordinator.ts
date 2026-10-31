import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import { apiConfig } from './config.js';
import { verifySessionToken } from './auth.js';
import type { OrganizationRepository } from './organizationRepository.js';
import type { AuthRepository } from './authRepository.js';
import { randomUUID } from 'node:crypto';
import { courseLockExpiryMs } from './courseMutationLock.js';

/** Mutation leases allow ordinary writes to overlap. Erasure closes admission,
 * waits for outstanding leases, then removes data. A crashed request's lease
 * expires only after the maximum host invocation lifetime. */
export class PrivacyMutationCoordinator {
  private readonly scope = new AsyncLocalStorage<ReadonlySet<string>>();
  constructor(private readonly repository: OrganizationRepository, private readonly auth: AuthRepository) {}
  run = async <T>(userId: string, operation: () => Promise<T>): Promise<T> => {
    const key = `privacy:${createHash('sha256').update(userId).digest('hex')}`;
    const held = this.scope.getStore();
    if (held?.has(key)) return operation();
    return this.repository.withOrganizationLock(key, () => this.scope.run(new Set([...(held ?? []), key]), operation));
  };

  mutate = async <T>(userId: string, operation: () => Promise<T>): Promise<T> => {
    const key = `mutation:${userId}`;
    const held = this.scope.getStore();
    if (held?.has(key) || this.auth.readOnly || this.auth.unavailableReason) return operation();
    const id = randomUUID();
    if (!await this.auth.beginPrivacyMutation(userId, id, Date.now() + courseLockExpiryMs)) {
      throw Object.assign(new Error('Authentication required'), { privacyStatus: 401 });
    }
    try { return await this.scope.run(new Set([...(held ?? []), key]), operation); }
    finally { await this.auth.finishPrivacyMutation(userId, id); }
  };

  middleware: RequestHandler = async (request, response, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) { next(); return; }
    if (/^\/(?:api\/)?users\/me\/privacy\/erase\/?$/i.test(request.path)) { next(); return; }
    const bearer = request.header('authorization');
    const session = bearer?.startsWith('Bearer ') && apiConfig.AUTH_TOKEN_SECRET
      ? verifySessionToken(bearer.slice(7), apiConfig.AUTH_TOKEN_SECRET) : null;
    if (!session) { next(); return; }
    const end = response.end;
    let send: (() => void) | undefined;
    try {
      await this.mutate(session.sub, () => new Promise<void>(resolve => {
        response.end = ((...args: Parameters<typeof response.end>) => {
          send = () => { end.apply(response, args); };
          resolve();
          return response;
        }) as typeof response.end;
        next();
      }));
      response.end = end;
      send?.();
    } catch (error) {
      response.end = end;
      if (error && typeof error === 'object' && 'privacyStatus' in error && error.privacyStatus === 401) {
        // Refused admission means the account is no longer active. The route's own
        // fresh authentication answers 401 with that route's cache headers.
        next();
      } else next(error);
    }
  };
}
