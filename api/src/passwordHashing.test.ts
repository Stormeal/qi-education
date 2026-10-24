import { describe, expect, it } from 'vitest';
import { hashPassword, hashPasswordAsync, verifyPassword, verifyPasswordAsync } from './auth.js';

describe('X8 F7 password hashing off the event loop', () => {
  it('async hashes verify with the sync helper and the other way round', async () => {
    const asyncHash = await hashPasswordAsync('Password123!');
    expect(verifyPassword('Password123!', asyncHash)).toBe(true);
    expect(await verifyPasswordAsync('Password123!', hashPassword('Password123!'))).toBe(true);
    expect(await verifyPasswordAsync('Wrong123!', asyncHash)).toBe(false);
    expect(await verifyPasswordAsync('Password123!', 'not-a-hash')).toBe(false);
  });

  it('other work runs while a password is being checked', async () => {
    const hash = hashPassword('Password123!');
    const order: string[] = [];
    const check = verifyPasswordAsync('Password123!', hash).then(() => order.push('verified'));
    setImmediate(() => order.push('other request'));
    await check;
    expect(order[0]).toBe('other request');
  });
});
