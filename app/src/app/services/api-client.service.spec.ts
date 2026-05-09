import { ApiClientService, resolveApiBaseUrls } from './api-client.service';

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

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response;
}
