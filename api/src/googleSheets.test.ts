import { describe, expect, it, vi } from 'vitest';
import { createSheetsClient } from './googleSheets.js';
const fixture = vi.hoisted(() => ({ clients: 0 }));
vi.mock('googleapis', () => ({ google: {
  auth: { JWT: class {} },
  sheets: () => { fixture.clients++; return {}; },
} }));

describe('feedback Google client', () => {
  it('INV-005 shares one client across callers', () => {
    expect(createSheetsClient()).toBe(createSheetsClient());
    expect(fixture.clients).toBe(1);
  });
});
