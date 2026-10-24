import { describe, expect, it, vi } from 'vitest';
import { createSheetsClient } from './googleSheets.js';
const fixture = vi.hoisted(() => ({ clients: 0, loaded: 0 }));
vi.mock('googleapis', () => {
  fixture.loaded++;
  return { google: {
    auth: { JWT: class {} },
    sheets: () => { fixture.clients++; return {}; },
  } };
});

describe('feedback Google client', () => {
  it('X8 F9 loads googleapis only when feedback first needs Sheets', async () => {
    expect(fixture.loaded).toBe(0);
    await createSheetsClient();
    expect(fixture.loaded).toBe(1);
  });

  it('INV-005 shares one client across callers, also when they start together', async () => {
    const [first, second] = await Promise.all([createSheetsClient(), createSheetsClient()]);
    expect(first).toBe(second);
    expect(await createSheetsClient()).toBe(first);
    expect(fixture.clients).toBe(1);
  });
});
