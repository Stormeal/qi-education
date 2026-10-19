import { authStoreDouble } from '../test/authStoreDouble.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from './auth.js';
import { createAuthRepository, InMemoryAuthRepository } from './authRepository.js';
import * as config from './config.js';
describe('Reset password AuthRepository update', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  it.each(['memory', 'mongodb'])('writes the new hash, preserving identity and enrollment in %s', async kind => {
    const memory = new InMemoryAuthRepository(); const user = (await memory.findByEmail('student@qi-education.local'))!;
    const before = structuredClone(user); const store = authStoreDouble([user]);
    const repository = kind === 'memory' ? memory : store.repository();
    const newHash = hashPassword('Changed456!');
    expect(await repository.updatePasswordHash(user.id, newHash)).toEqual({ ...before, passwordHash: newHash });
    const stored = await repository.findById(user.id);
    expect(stored).toEqual({ ...before, passwordHash: newHash }); expect(verifyPassword('Changed456!', stored!.passwordHash)).toBe(true);
  });
  it('does not write a missing or disabled user', async () => {
    const memory = new InMemoryAuthRepository(); const user = (await memory.findByEmail('student@qi-education.local'))!; user.status = 'disabled';
    expect(await memory.updatePasswordHash(user.id, 'hash')).toBeNull(); expect(await memory.updatePasswordHash('missing', 'hash')).toBeNull();
    const repository = authStoreDouble([user]).repository();
    expect(await repository.updatePasswordHash(user.id, 'hash')).toBeNull(); expect(await repository.updatePasswordHash('missing', 'hash')).toBeNull();
  });
  it('retains a reset password when an enrollment write read the old hash first', async () => {
    const memory = new InMemoryAuthRepository(); const user = (await memory.findByEmail('student@qi-education.local'))!;
    const store = authStoreDouble([user]);
    let release!: () => void; let entered!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; });
    const enrollmentStarted = new Promise<void>(resolve => { entered = resolve; });
    store.beforeWrite = async field => {
      if (field === 'enrolledCourseIds') { entered(); await paused; }
    };
    const repository = store.repository(); const enrollment = repository.enrollUserInCourse(user.id, 'new-course');
    await enrollmentStarted;
    const newHash = hashPassword('Changed456!'); await repository.updatePasswordHash(user.id, newHash);
    release(); await enrollment;
    const stored = (await repository.findById(user.id))!;
    expect(stored.passwordHash).toBe(newHash); expect(stored.enrolledCourseIds).toEqual(['new-course']);
  });
  it('fails closed for an unavailable production store', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.spyOn(config, 'hasMongoConfig').mockReturnValue(false);
    await expect(createAuthRepository().updatePasswordHash('user', 'hash')).rejects.toThrow();
  });
  it('fresh credential reads do not join a lookup that captured the hash before another write', async () => {
    const memory = new InMemoryAuthRepository(); const user = (await memory.findByEmail('student@qi-education.local'))!;
    const store = authStoreDouble([user]);
    let entered!: () => void; let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const paused = new Promise<void>(resolve => { release = resolve; });
    store.beforeRead = async () => { entered(); await paused; };
    const repository = store.repository(); const stale = repository.findById(user.id); await started;
    try {
      // Mimic another instance writing the password without invalidating this instance's read.
      const newHash = hashPassword('Changed456!'); store.fake.documents.get(user.id)!.passwordHash = newHash;
      const fresh = repository.findById(user.id, { fresh: true }); release();
      expect((await fresh)!.passwordHash).toBe(newHash); expect((await stale)!.passwordHash).toBe(user.passwordHash);
    } finally { release(); await stale; }
  });
});
