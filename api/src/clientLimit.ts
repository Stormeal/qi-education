import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { getServicesMode, type ServicesMode } from './config.js';
import type { ClientLimitRepository } from './clientLimitRepository.js';

export type ClientLimitPurpose = 'reset' | 'signup';
export type ClientLimitOptions = {
  resetLimit?: number; signupLimit?: number; now?: () => number; storageTimeoutMs?: number;
};
const windowMs = 60 * 60 * 1000;

export function clientAddressKey(purpose: ClientLimitPurpose, request: Pick<Request, 'headers' | 'socket'>,
  mode: ServicesMode = getServicesMode()): string {
  const header = request.headers['x-forwarded-for'];
  const forwarded = (Array.isArray(header) ? header[0] : header)?.split(',')[0].trim();
  const address = (mode === 'hosted' ? forwarded || request.socket.remoteAddress : request.socket.remoteAddress) || 'unknown';
  return createHash('sha256').update(`${purpose}:${address}`).digest('hex');
}

export class ClientLimit {
  private readonly now: () => number;
  private readonly limits: Record<ClientLimitPurpose, number>;
  private readonly storageTimeoutMs: number;
  constructor(private readonly store: ClientLimitRepository, options: ClientLimitOptions = {}) {
    this.now = options.now ?? Date.now;
    this.limits = { reset: options.resetLimit ?? 10, signup: options.signupLimit ?? 20 };
    this.storageTimeoutMs = options.storageTimeoutMs ?? 5000;
    if (Object.values(this.limits).some(limit => !Number.isSafeInteger(limit) || limit < 1) ||
      !Number.isFinite(this.storageTimeoutMs) || this.storageTimeoutMs <= 0) throw new Error('Invalid client limit policy.');
  }

  async allow(purpose: ClientLimitPurpose, request: Request, response: Response): Promise<boolean> {
    const now = this.now(), windowStart = Math.floor(now / windowMs) * windowMs, expiresAt = windowStart + windowMs;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let count: number;
    try {
      count = await Promise.race([
        this.store.increment(clientAddressKey(purpose, request), windowStart, expiresAt, controller.signal),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Client limit storage timed out.')); }, this.storageTimeoutMs);
        }),
      ]);
    } catch {
      console.warn('Client limit storage unavailable; protection may be bypassed.');
      return true;
    } finally { clearTimeout(timer); }
    if (count <= this.limits[purpose]) return true;
    const retryAfter = Math.max(1, Math.ceil((expiresAt - this.now()) / 1000));
    const minutes = Math.ceil(retryAfter / 60);
    response.set('Retry-After', String(retryAfter)).status(429).json({
      message: `Too many requests from your network. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
      code: 'too-many-requests',
    });
    return false;
  }
}
