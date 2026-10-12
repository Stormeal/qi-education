import { createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import type { SignInAttemptRepository, SignInPolicy } from './signInAttemptRepository.js';

export type SignInLimitOptions = Partial<SignInPolicy> & { now?: () => number; storageTimeoutMs?: number; capacityWaitMs?: number };
export function signInAddressKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export class SignInLimit {
  private readonly now: () => number;
  private readonly policy: SignInPolicy;
  private readonly storageTimeoutMs: number;
  private readonly capacityWaitMs: number;
  constructor(private readonly store: SignInAttemptRepository, options: SignInLimitOptions = {}) {
    this.now = options.now ?? Date.now;
    this.policy = { limit: options.limit ?? 10, windowMs: options.windowMs ?? 900000, lockMs: options.lockMs ?? 900000 };
    this.storageTimeoutMs = options.storageTimeoutMs ?? 5000;
    this.capacityWaitMs = options.capacityWaitMs ?? 3000;
    if (!Number.isInteger(this.policy.limit) || this.policy.limit < 1 ||
      !Number.isFinite(this.policy.windowMs) || this.policy.windowMs <= 0 ||
      !Number.isFinite(this.policy.lockMs) || this.policy.lockMs <= 0 ||
      !Number.isFinite(this.storageTimeoutMs) || this.storageTimeoutMs <= 0 ||
      !Number.isFinite(this.capacityWaitMs) || this.capacityWaitMs <= 0) throw new Error('Invalid sign-in limit policy.');
  }
  async reserve(email: string, signal?: AbortSignal): Promise<{ ticket?: string; retryAfter?: number; aborted?: true }> {
    const capacity = new AbortController();
    const waitSignal = signal ? AbortSignal.any([signal, capacity.signal]) : capacity.signal;
    let capacityTimer: ReturnType<typeof setTimeout> | undefined;
    let retryAt: number | undefined;
    try {
      for (;;) {
        if (signal?.aborted) return { aborted: true };
        const result = await this.bounded(
          operationSignal => this.store.reserve(signInAddressKey(email), this.now(), this.policy, operationSignal),
          late => { if ('ticket' in late) void this.complete(email, late.ticket, 'cancel'); }, waitSignal);
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
        retryAt = result.retryAt;
        capacityTimer ??= setTimeout(() => capacity.abort(), this.capacityWaitMs);
        await wait(100, undefined, { signal: waitSignal });
      }
    } catch {
      if (signal?.aborted) return { aborted: true };
      if (capacity.signal.aborted && retryAt !== undefined) {
        return await this.capacityResult(email, retryAt, signal);
      }
      this.warn(); return {};
    } finally { clearTimeout(capacityTimer); }
  }
  private async capacityResult(email: string, retryAt: number, signal?: AbortSignal): Promise<{ ticket?: string; retryAfter?: number; aborted?: true }> {
    // Observe completions during the last polling sleep, with at most 100 ms
    // extra for this final read. It cannot restart the capacity wait budget.
    const probe = new AbortController();
    const probeSignal = signal ? AbortSignal.any([signal, probe.signal]) : probe.signal;
    const timer = setTimeout(() => probe.abort(), Math.min(100, this.capacityWaitMs));
    try {
      for (;;) {
        const result = await this.bounded(
          operationSignal => this.store.reserve(signInAddressKey(email), this.now(), this.policy, operationSignal),
          late => { if ('ticket' in late) void this.complete(email, late.ticket, 'cancel'); }, probeSignal);
        if (signal?.aborted) {
          if ('ticket' in result) await this.complete(email, result.ticket, 'cancel');
          return { aborted: true };
        }
        if ('ticket' in result) return result;
        const deadline = 'lockedUntil' in result ? result.lockedUntil : result.retryAt;
        const remaining = deadline - this.now();
        if (remaining <= 0) continue;
        return { retryAfter: Math.ceil(remaining / 1000) };
      }
    } catch {
      if (signal?.aborted) return { aborted: true };
      if (!probe.signal.aborted) { this.warn(); return {}; }
      return { retryAfter: Math.max(1, Math.ceil((retryAt - this.now()) / 1000)) };
    } finally { clearTimeout(timer); }
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
    let abandon: (() => void) | undefined;
    try {
      const pending = operation(operationSignal);
      void pending.then(value => { if (operationSignal.aborted) lateResult?.(value); }).catch(() => {});
      const aborted = new Promise<never>((_resolve, reject) => {
        abandon = () => reject(operationSignal.reason);
        operationSignal.addEventListener('abort', abandon, { once: true });
        if (operationSignal.aborted) abandon();
      });
      return await Promise.race([pending, aborted, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort(); reject(new Error('Sign-in attempt storage timed out.'));
        }, this.storageTimeoutMs);
      })]);
    } finally {
      clearTimeout(timer);
      if (abandon) operationSignal.removeEventListener('abort', abandon);
    }
  }
  private warn() { console.warn('Sign-in attempt storage unavailable; protection may be bypassed.'); }
}
