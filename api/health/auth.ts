import type { IncomingMessage, ServerResponse } from 'node:http';
import { apiConfig } from '../src/config.js';

export default function handler(_request: IncomingMessage, response: ServerResponse) {
  response.setHeader('Content-Type', 'application/json');

  if (!apiConfig.AUTH_TOKEN_SECRET) {
    response.statusCode = 503;
    response.end(
      JSON.stringify({
        status: 'unavailable',
        message: 'AUTH_TOKEN_SECRET is required for authentication.',
      }),
    );
    return;
  }

  response.end(JSON.stringify({ status: 'ok' }));
}
