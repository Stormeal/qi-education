import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { clientAddressKey } from './clientLimit.js';

function request(remoteAddress?: string, forwarded?: string | string[]) {
  return { socket: { remoteAddress }, headers: { 'x-forwarded-for': forwarded } } as Pick<Request, 'headers' | 'socket'>;
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

describe('US-P008 private client identity', () => {
  it.each(['isolated', 'shared'] as const)('ignores spoofed forwarding in %s mode', mode => {
    expect(clientAddressKey('reset', request('127.0.0.1', '198.51.100.1'), mode)).toBe(hash('reset:127.0.0.1'));
    expect(clientAddressKey('reset', request('127.0.0.1', '198.51.100.2'), mode)).toBe(hash('reset:127.0.0.1'));
  });
  it('hosted mode hashes only the first trimmed forwarding entry, for string and array headers', () => {
    for (const forwarded of [' 198.51.100.1 , 198.51.100.2', ['198.51.100.1, 198.51.100.2', '198.51.100.3']]) {
      expect(clientAddressKey('reset', request('127.0.0.1', forwarded), 'hosted')).toBe(hash('reset:198.51.100.1'));
    }
    expect(clientAddressKey('signup', request('127.0.0.1', '198.51.100.1'), 'hosted')).toBe(hash('signup:198.51.100.1'));
  });
  it('uses the connection without forwarding, and one unknown key when there is no address', () => {
    expect(clientAddressKey('reset', request('127.0.0.1'), 'hosted')).toBe(hash('reset:127.0.0.1'));
    expect(clientAddressKey('reset', request(), 'hosted')).toBe(hash('reset:unknown'));
    expect(clientAddressKey('reset', request(undefined, '198.51.100.1'), 'shared')).toBe(hash('reset:unknown'));
  });
});
