import { resolveApiBaseUrls } from './api-client.service';

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
