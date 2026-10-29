import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiConfig, buildApiConfig, hasTurnstileConfig } from './config.js';
import { CloudflareTurnstileVerifier, NullTurnstileVerifier, createTurnstileVerifier } from './turnstileService.js';

afterEach(() => vi.restoreAllMocks());
describe('US-P020 API-01 Turnstile verification', () => {
  it('isolates credentials before validation and never selects Cloudflare in tests', async () => {
    const config = buildApiConfig({ NODE_ENV: 'test', TURNSTILE_SECRET_KEY: '', TURNSTILE_SITE_KEY: '' });
    expect(config.TURNSTILE_SECRET_KEY).toBeUndefined();
    expect(config.TURNSTILE_SITE_KEY).toBeUndefined();
    expect(hasTurnstileConfig()).toBe(false);
    expect(createTurnstileVerifier()).toBeInstanceOf(NullTurnstileVerifier);
    const verifier = new NullTurnstileVerifier();
    expect(verifier.configured).toBe(false);
    expect(await verifier.verify(undefined)).toBe(true);
  });
  it('selects Cloudflare only for a complete pair outside isolated mode', () => {
    const original = { mode: apiConfig.mode, TURNSTILE_SECRET_KEY: apiConfig.TURNSTILE_SECRET_KEY, TURNSTILE_SITE_KEY: apiConfig.TURNSTILE_SITE_KEY };
    try {
      Object.assign(apiConfig, { mode: 'shared', TURNSTILE_SECRET_KEY: 'secret', TURNSTILE_SITE_KEY: 'public' });
      expect(hasTurnstileConfig()).toBe(true);
      expect(createTurnstileVerifier()).toBeInstanceOf(CloudflareTurnstileVerifier);
      apiConfig.TURNSTILE_SITE_KEY = undefined;
      expect(hasTurnstileConfig()).toBe(false);
      expect(createTurnstileVerifier()).toBeInstanceOf(NullTurnstileVerifier);
    } finally { Object.assign(apiConfig, original); }
  });
  it.each([undefined, '', 'x'.repeat(2049)])('rejects a missing or oversized token without a network call', async token => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await new CloudflareTurnstileVerifier('secret', fetcher).verify(token)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([true, false, 'true', undefined])('accepts only explicit success (%s)', async success => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ success })));
    const verifier = new CloudflareTurnstileVerifier('secret', fetcher);
    expect(verifier.configured).toBe(true);
    expect(await verifier.verify('token', '198.51.100.1')).toBe(success === true);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(init?.method).toBe('POST');
    expect(new URLSearchParams(String(init?.body)).get('remoteip')).toBe('198.51.100.1');
    expect(new URLSearchParams(String(init?.body)).get('secret')).toBe('secret');
    expect(new URLSearchParams(String(init?.body)).get('response')).toBe('token');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
  it.each(['network', 'http', 'json'])('fails closed without logging credentials on %s failure', async failure => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetcher = vi.fn<typeof fetch>();
    if (failure === 'network') fetcher.mockRejectedValue(new Error('sensitive-token sensitive-secret'));
    else fetcher.mockResolvedValue(new Response(failure === 'http' ? '{}' : 'invalid', { status: failure === 'http' ? 500 : 200 }));
    expect(await new CloudflareTurnstileVerifier('sensitive-secret', fetcher).verify('sensitive-token')).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/sensitive-token|sensitive-secret/);
  });
});
