import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAccountProfileRepository, AccountProfileUnavailableError } from './accountProfileRepository.js';
import { InMemoryInstructorProfileRepository } from './instructorProfileRepository.js';
import { createSessionToken, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

const original = { bio: 'Private bio', jobTitle: 'Tester', company: 'QI', learningGoals: 'Learn testing', avatarColor: '#aBc123' };
const defaults = { bio: '', jobTitle: '', company: '', learningGoals: '', avatarColor: '#2f4f43', updatedAt: null };
const textLimits = [['bio', 280], ['jobTitle', 120], ['company', 120], ['learningGoals', 280]] as const;
const fields = ['bio', 'jobTitle', 'company', 'learningGoals', 'avatarColor'] as const;

describe.each(['', '/api'])('US-L003 account profile HTTP (%s)', prefix => {
  let server: Server;
  let base: string;
  let student: AuthUser;
  let teacher: AuthUser;
  let admin: AuthUser;
  let auth: InMemoryAuthRepository;
  let profiles: InMemoryAccountProfileRepository;
  let instructors: InMemoryInstructorProfileRepository;
  let now: Date;

  beforeEach(async () => {
    auth = new InMemoryAuthRepository();
    student = (await auth.findByEmail('student@qi-education.local'))!;
    teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    now = new Date('2026-10-13T10:00:00.000Z');
    profiles = new InMemoryAccountProfileRepository({ now: () => now });
    instructors = new InMemoryInstructorProfileRepository();
    server = createServer({ authRepository: auth, accountProfileRepository: profiles,
      instructorProfileRepository: instructors,
    }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  function request(user: AuthUser | undefined, method = 'GET', body?: unknown, path = '/users/me/profile', token?: string) {
    return fetch(base + prefix + path, { method, headers: {
      'Content-Type': 'application/json',
      ...(token !== undefined ? { authorization: `Bearer ${token}` } : user ? {
        authorization: `Bearer ${createSessionToken(user, apiConfig.AUTH_TOKEN_SECRET!)}`,
      } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }

  function expectPrivate(response: Response) {
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')?.split(/,\s*/)).toContain('Authorization');
  }

  it('AC03 returns exact never-saved defaults without creating a profile', async () => {
    const response = await request(student);
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(await response.json()).toEqual(defaults);
    expect(await profiles.get(student.id)).toBeNull();
  });

  it.each(['student', 'teacher', 'admin'] as const)('AC01/04 lets %s save and read from a fresh authenticated client', async role => {
    const user = { student, teacher, admin }[role];
    const saved = await request(user, 'PUT', original);
    expect(saved.status).toBe(200);
    expectPrivate(saved);
    expect(await saved.json()).toEqual({ ...original, updatedAt: '2026-10-13T10:00:00.000Z' });
    const loaded = await request(user);
    expect(loaded.status).toBe(200);
    expectPrivate(loaded);
    expect(await loaded.json()).toEqual({ ...original, updatedAt: '2026-10-13T10:00:00.000Z' });
  });

  it('AC04 trims all texts, replaces all fields and regenerates server updatedAt', async () => {
    await profiles.save(student.id, original);
    now = new Date('2026-10-13T10:01:00.000Z');
    const saved = await request(student, 'PUT', {
      bio: ' \nNew bio\t ', jobTitle: '  New title ', company: '\t New company \n', learningGoals: ' New goal ',
      avatarColor: '#FFFFFF', updatedAt: 'forged', userId: teacher.id, _id: teacher.id, email: 'ignored', passwordHash: 'ignored',
    });
    expect(saved.status).toBe(200);
    const expected = { bio: 'New bio', jobTitle: 'New title', company: 'New company', learningGoals: 'New goal',
      avatarColor: '#FFFFFF', updatedAt: '2026-10-13T10:01:00.000Z' };
    expect(await saved.json()).toEqual(expected);
    expect(await profiles.get(student.id)).toEqual({ _id: student.id, ...expected });
    expect(await profiles.get(teacher.id)).toBeNull();
  });

  it.each(textLimits)('AC05 accepts %s at its trimmed limit %i', async (field, limit) => {
    const body = { ...original, [field]: ` \n${'x'.repeat(limit)}\t ` };
    const response = await request(student, 'PUT', body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...original, [field]: 'x'.repeat(limit), updatedAt: '2026-10-13T10:00:00.000Z' });
  });

  it.each(textLimits)('AC02/05 rejects %s over its trimmed limit %i without changing any stored field', async (field, limit) => {
    const before = await profiles.save(student.id, original);
    now = new Date('2026-10-13T10:01:00.000Z');
    const response = await request(student, 'PUT', { ...original, [field]: ` ${'x'.repeat(limit + 1)} ` });
    expect(response.status).toBe(400);
    expectPrivate(response);
    expect(await response.json()).toEqual({ message: expect.any(String) });
    expect(await profiles.get(student.id)).toEqual(before);
  });

  it.each(fields)('AC05 requires %s even when texts are empty', async field => {
    const body: Record<string, unknown> = { ...original };
    delete body[field];
    const response = await request(student, 'PUT', body);
    expect(response.status).toBe(400);
    expectPrivate(response);
    expect(await response.json()).toEqual({ message: expect.any(String) });
    expect(await profiles.get(student.id)).toBeNull();
  });

  it.each(fields.flatMap(field => [null, 1, false, [], {}].map(value => ({ field, value }))))(
    'AC05 rejects non-string $field=$value without writing', async ({ field, value }) => {
      const before = await profiles.save(student.id, original);
      const response = await request(student, 'PUT', { ...original, [field]: value });
      expect(response.status).toBe(400);
      expectPrivate(response);
      expect(await response.json()).toEqual({ message: expect.any(String) });
      expect(await profiles.get(student.id)).toEqual(before);
    },
  );

  it.each([undefined, null, [], 'text', 42, {}])('AC05 rejects an incomplete/non-object body %j', async body => {
    const response = await request(student, 'PUT', body);
    expect(response.status).toBe(400);
    expectPrivate(response);
    expect(await response.json()).toEqual({ message: expect.any(String) });
    expect(await profiles.get(student.id)).toBeNull();
  });

  it.each(['', '#abc', '#1234567', '123456', '#gg0000', ' #123456', '#123456 ', '#123456\n', '#１２３４５６']) (
    'AC05 rejects avatarColor %j without altering a saved profile', async avatarColor => {
      const before = await profiles.save(student.id, original);
      const response = await request(student, 'PUT', { ...original, avatarColor });
      expect(response.status).toBe(400);
      expectPrivate(response);
      expect(await response.json()).toEqual({ message: expect.any(String) });
      expect(await profiles.get(student.id)).toEqual(before);
    },
  );

  it.each(['#000000', '#ffffff', '#ABCDEF', '#aB09fF'])('AC05 accepts six hex digits %s and preserves their case', async avatarColor => {
    const response = await request(student, 'PUT', { ...original, avatarColor });
    expect(response.status).toBe(200);
    expect((await response.json()).avatarColor).toBe(avatarColor);
  });

  it('AC09 persists whitespace-only texts with a non-null timestamp', async () => {
    const response = await request(student, 'PUT', { bio: ' \t\n', jobTitle: '', company: ' ', learningGoals: '\n', avatarColor: '#2f4f43' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...defaults, updatedAt: '2026-10-13T10:00:00.000Z' });
    expect(await (await request(student)).json()).toEqual({ ...defaults, updatedAt: '2026-10-13T10:00:00.000Z' });
  });

  it('AC04 stores plain text without interpreting markup', async () => {
    const response = await request(student, 'PUT', { ...original, bio: '  <b>testing</b> & notes  ' });
    expect(response.status).toBe(200);
    expect((await response.json()).bio).toBe('<b>testing</b> & notes');
  });

  it('AC06 keeps accounts private even for admin, spoofed identifiers and query parameters', async () => {
    const first = await request(student, 'PUT', original);
    expect(first.status).toBe(200);
    const second = await request(admin, 'GET', undefined, `/users/me/profile?userId=${student.id}`);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(defaults);
    const other = await request(admin, 'PUT', { ...original, bio: 'Admin only', userId: student.id, _id: student.id });
    expect(other.status).toBe(200);
    expect((await other.json()).bio).toBe('Admin only');
    expect(await (await request(student)).json()).toEqual({ ...original, updatedAt: '2026-10-13T10:00:00.000Z' });
    for (const path of [`/users/${student.id}/profile`, `/admin/users/${student.id}/profile`, '/admin/profiles']) {
      const denied = await request(admin, 'GET', undefined, path);
      expect(denied.status).toBe(404);
    }
  });

  it.each(['GET', 'PUT'])('AC07 refuses missing, invalid, expired, forged, unknown and disabled sessions on %s before storage', async method => {
    const read = vi.spyOn(profiles, 'get');
    const write = vi.spyOn(profiles, 'save');
    const tokenCases = [undefined, 'invalid', createSessionToken(student, apiConfig.AUTH_TOKEN_SECRET!, -1),
      createSessionToken(student, 'forged-secret'), createSessionToken({ ...student, id: 'unknown-user' }, apiConfig.AUTH_TOKEN_SECRET!)];
    for (const token of tokenCases) {
      const response = await request(undefined, method, method === 'PUT' ? original : undefined, undefined, token);
      expect(response.status).toBe(401);
      expectPrivate(response);
      expect(await response.json()).toEqual({ message: expect.any(String) });
    }
    const valid = createSessionToken(student, apiConfig.AUTH_TOKEN_SECRET!);
    await auth.updateStatus(student.id, 'disabled');
    const disabled = await request(undefined, method, method === 'PUT' ? original : undefined, undefined, valid);
    expect(disabled.status).toBe(401);
    expectPrivate(disabled);
    expect(await disabled.json()).toEqual({ message: expect.any(String) });
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['GET', 'PUT'])('AC08 returns a safe message-only 503 on %s store failures without logging provider or profile content', async method => {
    const before = await profiles.save(student.id, original);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(profiles, method === 'GET' ? 'get' : 'save').mockRejectedValueOnce(new Error('Provider password and private bio'));
    const response = await request(student, method, method === 'PUT' ? original : undefined);
    expect(response.status).toBe(503);
    expectPrivate(response);
    expect(await response.json()).toEqual({ message: 'Account profile storage is temporarily unavailable.' });
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(await profiles.get(student.id)).toEqual(before);
  });

  it('AC02/08 permits retry after an unavailable save and leaves defaults until success', async () => {
    vi.spyOn(profiles, 'save').mockRejectedValueOnce(new AccountProfileUnavailableError());
    const failed = await request(student, 'PUT', original);
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ message: 'Account profile storage is temporarily unavailable.' });
    expect(await (await request(student)).json()).toEqual(defaults);
    const retry = await request(student, 'PUT', original);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ ...original, updatedAt: '2026-10-13T10:00:00.000Z' });
  });

  it('AC04 waits for successful persistence before responding', async () => {
    const save = profiles.save.bind(profiles);
    let started!: () => void;
    let finish!: () => void;
    const saving = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { finish = resolve; });
    vi.spyOn(profiles, 'save').mockImplementationOnce(async (userId, input) => {
      started(); await gate; return save(userId, input);
    });
    let answered = false;
    const pending = request(student, 'PUT', original).then(response => { answered = true; return response; });
    await saving;
    try {
      expect(answered).toBe(false);
      expect(await profiles.get(student.id)).toBeNull();
    } finally { finish(); }
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await profiles.get(student.id)).toEqual({ _id: student.id, ...original, updatedAt: '2026-10-13T10:00:00.000Z' });
  });

  it('AC10 returns private no-store message-only 400 for malformed JSON', async () => {
    const response = await fetch(base + prefix + '/users/me/profile', { method: 'PUT', headers: {
      authorization: `Bearer ${createSessionToken(student, apiConfig.AUTH_TOKEN_SECRET!)}`, 'Content-Type': 'application/json',
    }, body: '{"bio":' });
    expect(response.status).toBe(400);
    expectPrivate(response);
    expect(await response.json()).toEqual({ message: expect.any(String) });
    expect(await profiles.get(student.id)).toBeNull();
  });

  it('AC10 leaves instructor profiles independent and their existing status/shape unchanged', async () => {
    for (const user of [teacher, admin]) {
      const publicSave = await request(user, 'PUT', { description: 'Public description' }, '/users/me/instructor-profile');
      expect(publicSave.status).toBe(200);
      expect(await publicSave.json()).toEqual({ description: 'Public description' });
      const privateSave = await request(user, 'PUT', { ...original, bio: 'Private description' });
      expect(privateSave.status).toBe(200);
      const publicRead = await request(user, 'GET', undefined, '/users/me/instructor-profile');
      expect(publicRead.status).toBe(200);
      expect(await publicRead.json()).toEqual({ description: 'Public description' });
      await request(user, 'PUT', { description: '' }, '/users/me/instructor-profile');
      expect((await (await request(user)).json()).bio).toBe('Private description');
    }
    for (const method of ['GET', 'PUT']) {
      const denied = await request(student, method, method === 'PUT' ? { description: 'Denied' } : undefined, '/users/me/instructor-profile');
      expect(denied.status).toBe(403);
      expect(await denied.json()).toEqual({ message: expect.any(String) });
    }
    expect(await (await request(undefined, 'GET', undefined, '/instructors')).json()).toEqual([]);
    expect(await (await request(admin, 'GET', undefined, '/admin/instructor-profiles')).json()).toEqual([]);
  });
});
