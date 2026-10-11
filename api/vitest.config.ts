import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests must never load api/.env: with real settings, default stores would be the shared services.
    env: { NODE_ENV: 'test' },
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**']
  }
});
