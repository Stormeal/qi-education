import { Injectable } from '@angular/core';

declare global {
  interface Window {
    qiEducationConfig?: {
      apiBaseUrl?: string;
    };
  }
}

type ApiJsonCacheEntry = {
  expiresAt: number;
  value: unknown;
};

export type ApiJsonResult<T> = {
  ok: boolean;
  status: number;
  body: T | { message?: string };
};

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private readonly apiJsonCache = new Map<string, ApiJsonCacheEntry>();
  private readonly unauthorizedHandlers = new Set<() => void>();
  private readonly apiCacheTtlMs = 5 * 60 * 1000;

  async fetch(path: string, init: RequestInit): Promise<Response> {
    const apiBaseUrls = this.apiBaseUrls();
    let lastError: unknown;

    for (const apiBaseUrl of apiBaseUrls) {
      try {
        const response = await window.fetch(`${apiBaseUrl}${path}`, init);

        if (response.status === 401) {
          this.notifyUnauthorized();
        }

        return response;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  async fetchJson<T>(
    path: string,
    init: RequestInit = {},
    ttlMs = this.apiCacheTtlMs,
    bypassCache = false,
  ): Promise<ApiJsonResult<T>> {
    const cacheKey = this.apiCacheKey(path, init);
    const cached = this.apiJsonCache.get(cacheKey);

    if (!bypassCache && cached && cached.expiresAt > Date.now()) {
      return {
        ok: true,
        status: 200,
        body: cached.value as T,
      };
    }

    if (cached) {
      this.apiJsonCache.delete(cacheKey);
    }

    const response = await this.fetch(path, { ...init, method: init.method ?? 'GET' });
    const body = (await response.json().catch(() => ({}))) as T | { message?: string };

    if (response.ok) {
      this.apiJsonCache.set(cacheKey, {
        expiresAt: Date.now() + ttlMs,
        value: body,
      });
    }

    return {
      ok: response.ok,
      status: response.status,
      body,
    };
  }

  invalidateCache(path: string): void {
    for (const key of this.apiJsonCache.keys()) {
      if (key.startsWith(`${path}|`)) {
        this.apiJsonCache.delete(key);
      }
    }
  }

  clearCache(): void {
    this.apiJsonCache.clear();
  }

  onUnauthorized(handler: () => void): () => void {
    this.unauthorizedHandlers.add(handler);

    return () => {
      this.unauthorizedHandlers.delete(handler);
    };
  }

  private notifyUnauthorized(): void {
    this.clearCache();

    for (const handler of this.unauthorizedHandlers) {
      handler();
    }
  }

  private apiCacheKey(path: string, init: RequestInit): string {
    return `${path}|${this.headerValue(init.headers, 'authorization')}`;
  }

  private headerValue(headers: RequestInit['headers'], name: string): string {
    if (!headers) {
      return '';
    }

    if (headers instanceof Headers) {
      return headers.get(name) ?? '';
    }

    if (Array.isArray(headers)) {
      return headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? '';
    }

    return headers[name] ?? headers[name.toLowerCase()] ?? '';
  }

  private apiBaseUrls(): string[] {
    const configuredApiBaseUrl = window.qiEducationConfig?.apiBaseUrl?.trim().replace(/\/+$/, '');

    return resolveApiBaseUrls(window.location, configuredApiBaseUrl);
  }
}

type ApiLocation = Pick<Location, 'hostname' | 'origin' | 'protocol'>;

export function resolveApiBaseUrls(location: ApiLocation, configuredApiBaseUrl?: string): string[] {
  if (configuredApiBaseUrl) {
    return [configuredApiBaseUrl];
  }

  const hostedApiBaseUrl = 'https://qi-education.vercel.app/api';

  if (location.hostname.endsWith('.github.io')) {
    return [hostedApiBaseUrl];
  }

  if (location.hostname.endsWith('.vercel.app')) {
    return [`${location.origin}/api`];
  }

  if (!location.hostname) {
    return [hostedApiBaseUrl];
  }

  const protocol = location.protocol === 'https:' ? 'https:' : 'http:';
  return [`${protocol}//${location.hostname}:3001`, hostedApiBaseUrl];
}
