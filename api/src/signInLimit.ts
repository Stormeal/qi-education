import { createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import type { SignInAttemptRepository, SignInPolicy } from './signInAttemptRepository.js';

export type SignInLimitOptions = Partial<SignInPolicy> & { now?: () => number; storageTimeoutMs?: number };
export function signInAddressKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export class SignInLimit {
  private readonly now: () => number;
  private readonly policy: SignInPolicy;
  private readonly storageTimeoutMs: number;
  constructor(private readonly store: SignInAttemptRepository, options: SignInLimitOptions = {}) {
    this.now = options.now ?? Date.now;
    this.policy = { limit: options.limit ?? 10, windowMs: options.windowMs ?? 900000, lockMs: options.lockMs ?? 900000 };
    this.storageTimeoutMs = options.storageTimeoutMs ?? 5000;
    if (!Number.isInteger(this.policy.limit) || this.policy.limit < 1 ||
      !Number.isFinite(this.policy.windowMs) || this.policy.windowMs <= 0 ||
      !Number.isFinite(this.policy.lockMs) || this.policy.lockMs <= 0 ||
      !Number.isFinite(this.storageTimeoutMs) || this.storageTimeoutMs <= 0) throw new Error('Invalid sign-in limit policy.');
  }
  async reserve(email: string, signal?: AbortSignal): Promise<{ ticket?: string; retryAfter?: number; aborted?: true }> {
    try {
      for (;;) {
        if (signal?.aborted) return { aborted: true };
        const result = await this.bounded(
          operationSignal => this.store.reserve(signInAddressKey(email), this.now(), this.policy, operationSignal),
          late => { if ('ticket' in late) void this.complete(email, late.ticket, 'cancel'); }, signal);
        if (signal?.aborted) {
          if ('ticket' in result) await this.complete(email, result.ticket, 'cancel');
          return { aborted: true };
        }
        if ('ticket' in result) return result;
        if ('lockedUntil' in result) {
          const remaining = result.lockedUntil - this.now();
          if (remaining <= 0) continue;
          return { retryAfter: Math.ceil(remaining / 1000) };
        }
        // Outstanding requests are not failed passwords. Wait for their outcomes.
        await wait(100, undefined, { signal });
      }
    } catch { if (signal?.aborted) return { aborted: true }; this.warn(); return {}; }
  }
  async complete(email: string, ticket: string | undefined, outcome: 'failure' | 'cancel') {
    if (!ticket) return;
    try { await this.bounded(signal => this.store.complete(signInAddressKey(email), ticket, outcome, this.now(), this.policy, signal)); }
    catch { this.warn(); }
  }
  async clear(email: string) {
    try { await this.bounded(signal => this.store.clear(signInAddressKey(email), this.now(), signal)); }
    catch { this.warn(); }
  }
  private async bounded<T>(operation: (signal: AbortSignal) => Promise<T>, lateResult?: (value: T) => void, signal?: AbortSignal): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const operationSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    try {
      const pending = operation(operationSignal);
      void pending.then(value => { if (operationSignal.aborted) lateResult?.(value); }).catch(() => {});
      return await Promise.race([pending, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort(); reject(new Error('Sign-in attempt storage timed out.'));
        }, this.storageTimeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  }
  private warn() { console.warn('Sign-in attempt storage unavailable; protection may be bypassed.'); }
}
