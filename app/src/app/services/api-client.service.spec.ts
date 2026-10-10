import { ApiClientService, resolveApiBaseUrls } from './api-client.service';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { CourseService } from './course.service';

describe('resolveApiBaseUrls', () => {
  it('uses the hosted API from any GitHub Pages host', () => {
    expect(
      resolveApiBaseUrls({
        hostname: 'stormeal.github.io',
        origin: 'https://stormeal.github.io',
        protocol: 'https:',
      }),
    ).toEqual(['https://qi-education.vercel.app/api']);
  });

  it('keeps Vercel deployments on their own API origin', () => {
    expect(
      resolveApiBaseUrls({
        hostname: 'qi-education.vercel.app',
        origin: 'https://qi-education.vercel.app',
        protocol: 'https:',
      }),
    ).toEqual(['https://qi-education.vercel.app/api']);
  });

  it('tries the local API first during local development', () => {
    expect(
      resolveApiBaseUrls({
        hostname: 'localhost',
        origin: 'http://localhost:4200',
        protocol: 'http:',
      }),
    ).toEqual(['http://localhost:3001', 'https://qi-education.vercel.app/api']);
  });

  it.each(['localhost', 'app.localhost', '127.0.0.1', '127.0.0.2', '[::1]'])(
    'keeps mutations on loopback for %s', (hostname) => {
      const location = { hostname, origin: `http://${hostname}:4306`, protocol: 'http:' };
      expect(resolveApiBaseUrls(location, undefined, 'POST')).toEqual([`http://${hostname}:3001`]);
      expect(() => resolveApiBaseUrls(location, 'https://qi-education.vercel.app/api', 'PATCH')).toThrow(/local API/i);
    },
  );

  it.each(['stormeal.github.io', 'qi-education.vercel.app', 'preview.vercel.app'])(
    'preserves deployed mutations on %s', (hostname) => {
      const location = { hostname, origin: `https://${hostname}`, protocol: 'https:' };
      expect(resolveApiBaseUrls(location, undefined, 'POST')).toEqual(resolveApiBaseUrls(location));
      expect(resolveApiBaseUrls(location, 'https://custom.example/api', 'DELETE')).toEqual(['https://custom.example/api']);
    },
  );

  it('accepts relative local API overrides but rejects remote URL userinfo tricks', () => {
    const location = { hostname: 'localhost', origin: 'http://localhost:4306', protocol: 'http:' };
    expect(resolveApiBaseUrls(location, '/api', 'POST')).toEqual(['/api']);
    expect(() => resolveApiBaseUrls(location, 'https://localhost@qi-education.vercel.app/api', 'POST')).toThrow(/local API/i);
  });
});

describe('ApiClientService cache', () => {
  let originalFetch: typeof window.fetch;
  let service: ApiClientService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = window.fetch;
    service = new ApiClientService();
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(['first']));
    window.fetch = fetchMock as typeof window.fetch;
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it('keeps successful JSON responses for the browser session', async () => {
    const first = await service.fetchJson<string[]>('/courses');
    const second = await service.fetchJson<string[]>('/courses');

    expect(first.body).toEqual(['first']);
    expect(second.body).toEqual(['first']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache private course responses when the server says no-store', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(['private']), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    }));
    await service.fetchJson('/courses', { headers: { authorization: 'Bearer session' } });
    await service.fetchJson('/courses', { headers: { authorization: 'Bearer session' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reloads cached JSON when bypassing the session cache', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(['first']))
      .mockResolvedValueOnce(jsonResponse(['second']));

    await service.fetchJson<string[]>('/courses');
    const result = await service.fetchJson<string[]>('/courses', {}, true);

    expect(result.body).toEqual(['second']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('invalidates cached JSON by path', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(['first']))
      .mockResolvedValueOnce(jsonResponse(['second']));

    await service.fetchJson<string[]>('/courses');
    service.invalidateCache('/courses');
    const result = await service.fetchJson<string[]>('/courses');

    expect(result.body).toEqual(['second']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('US-P008-AC03 local mutation safety (INV-015 / DEF-018)', () => {
  let originalFetch: typeof window.fetch;
  let originalConfig: typeof window.qiEducationConfig;
  let service: ApiClientService;
  let hostedWrites: string[];
  let requests: string[];

  beforeEach(() => {
    originalFetch = window.fetch;
    originalConfig = window.qiEducationConfig;
    delete window.qiEducationConfig;
    service = new ApiClientService();
    requests = [];
    hostedWrites = [];
    window.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push(String(url));
      if (!String(url).startsWith('https://qi-education.vercel.app/api')) {
        throw new TypeError('Isolated local API is unreachable');
      }
      if (!['GET', 'HEAD'].includes((init?.method ?? 'GET').toUpperCase())) hostedWrites.push(String(url));
      return jsonResponse({ saved: true });
    }) as typeof window.fetch;
  });
  afterEach(() => {
    window.fetch = originalFetch;
    window.qiEducationConfig = originalConfig;
  });

  it.each([
    ['POST', '/signup'], ['PATCH', '/courses/course-1'], ['POST', '/users/me/courses/course-1'],
    ['PUT', '/users/me/career-path'], ['DELETE', '/courses/course-1'], ['OPTIONS', '/courses'], ['post', '/login'],
  ])('fails %s %s locally without changing the hosted store', async (method, path) => {
    const response = await service.fetch(path, { method, body: method === 'OPTIONS' ? undefined : '{}' });
    expect(response.status).toBe(503);
    expect(response.ok).toBe(false);
    expect(await response.json()).toEqual({ message: expect.stringMatching(/local API.*unavailable/i) });
    expect(hostedWrites).toEqual([]);
    expect(requests).toHaveLength(1);
    expect(requests[0]).not.toContain('qi-education.vercel.app');
  });

  it.each(['GET', 'HEAD', undefined])('keeps the read fallback for %s', async (method) => {
    const response = await service.fetch('/courses', { method });
    expect(response.status).toBe(200);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toBe('https://qi-education.vercel.app/api/courses');
    expect(hostedWrites).toEqual([]);
  });

  it('rejects an explicit remote mutation override before sending', async () => {
    window.qiEducationConfig = { apiBaseUrl: 'https://qi-education.vercel.app/api' };
    const response = await service.fetch('/signup', { method: 'POST' });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: expect.stringMatching(/local API required/i) });
    expect(requests).toEqual([]);
    expect(hostedWrites).toEqual([]);
  });

  it('uses a configured local API exactly once for a successful mutation', async () => {
    window.qiEducationConfig = { apiBaseUrl: 'http://127.0.0.1:4307' };
    window.fetch = vi.fn().mockResolvedValue(jsonResponse({ saved: true }));
    expect((await service.fetch('/signup', { method: 'POST' })).status).toBe(200);
    expect(window.fetch).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:4307/signup', { method: 'POST' });
  });

  it('returns local HTTP failures and preserves current-session 401 notification without retry', async () => {
    const unauthorized = vi.fn();
    service.onUnauthorized(unauthorized);
    window.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Invalid email or password' }), { status: 401 }));
    const response = await service.fetch('/login', { method: 'POST' });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: 'Invalid email or password' });
    expect(unauthorized).toHaveBeenCalledOnce();
    expect(window.fetch).toHaveBeenCalledOnce();
  });

  it('passes actionable local failure messages through signup, login and enrollment to existing UI callers', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: ApiClientService, useValue: service }] });
    const auth = TestBed.inject(AuthService);
    const courses = TestBed.inject(CourseService);
    for (const result of [
      await auth.login('local@example.com', 'Testing42'),
      await auth.signup({ email: 'local@example.com', displayName: 'Local student', password: 'Testing42' }),
      await courses.enrollCourse('course-1', 'local-session'),
    ]) {
      expect(result).toEqual({ ok: false, message: expect.stringMatching(/Local API is unavailable\. Start the local API/) });
    }
    expect(hostedWrites).toEqual([]);
    expect(requests).toHaveLength(3);
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve(body),
  } as Response;
}
