import { apiConfig, hasTurnstileConfig } from './config.js';

export interface TurnstileVerifier {
  readonly configured: boolean;
  verify(token: string | undefined, remoteIp?: string): Promise<boolean>;
}

export class NullTurnstileVerifier implements TurnstileVerifier {
  readonly configured = false;
  async verify(_token?: string, _remoteIp?: string): Promise<boolean> { return true; }
}

export class CloudflareTurnstileVerifier implements TurnstileVerifier {
  readonly configured = true;
  constructor(private readonly secret: string, private readonly fetcher: typeof fetch = fetch) {}

  async verify(token: string | undefined, remoteIp?: string): Promise<boolean> {
    if (!token || token.length > 2048) return false;
    const body = new URLSearchParams({ secret: this.secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    try {
      const response = await this.fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', body, signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('Turnstile unavailable');
      const result: unknown = await response.json();
      return typeof result === 'object' && result !== null && 'success' in result && result.success === true;
    } catch {
      console.warn('Turnstile verification unavailable; human check rejected.');
      return false;
    }
  }
}

export function createTurnstileVerifier(): TurnstileVerifier {
  return hasTurnstileConfig()
    ? new CloudflareTurnstileVerifier(apiConfig.TURNSTILE_SECRET_KEY!) : new NullTurnstileVerifier();
}
