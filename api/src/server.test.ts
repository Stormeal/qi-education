import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from './server.js';

describe('QI-Education API', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    server = createServer().listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server.close();
  });

  it('reports health with the active storage mode', async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok', storage: 'memory' });
  });

  it('lists courses from the configured repository', async () => {
    const response = await fetch(`${baseUrl}/courses`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body[0]).toMatchObject({
      title: 'Career Discovery Workshop',
      status: 'published'
    });
  });

  it('rejects invalid course input', async () => {
    const response = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'No' })
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('Invalid request body');
  });
});
