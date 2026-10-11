import { afterEach, describe, expect, it, vi } from 'vitest';
import { authSheetHeaders, authUserToSheetRow, hashPassword, verifyPassword } from './auth.js';
import { createAuthRepository, GoogleSheetsAuthRepository, InMemoryAuthRepository } from './authRepository.js';
import * as config from './config.js';
const sheet = vi.hoisted(() => ({ rows: [] as string[][], update: vi.fn(), beforeRead: async () => {} }));
vi.mock('./googleSheets.js', () => ({ ensureWorksheetHeaders: async () => {}, createSheetsClient: () => ({ spreadsheets: { values: {
  get: async () => { const values = structuredClone(sheet.rows); await sheet.beforeRead(); return { data: { values } }; },
  update: sheet.update,
} } }) }));
describe('Reset password AuthRepository update', () => {
  afterEach(() => { sheet.beforeRead = async () => {}; vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  it.each(['memory', 'sheets'])('writes the new hash, preserving identity and enrollment in %s', async kind => {
    const memory = new InMemoryAuthRepository(); const user = (await memory.findByEmail('student@qi-education.local'))!;
    const before = structuredClone(user); sheet.rows = [[...authSheetHeaders], authUserToSheetRow(user)];
    sheet.update.mockImplementation(async ({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) => {
      expect(range).toMatch(/!D2$/); sheet.rows[1][3] = requestBody.values[0][0]; return {};
    });
    const repository = kind === 'memory' ? memory : new GoogleSheetsAuthRepository();
    const newHash = hashPassword('Changed456!');
    expect(await repository.updatePasswordHash(user.id, newHash)).toEqual({ ...before, passwordHash: newHash });
    const stored = await repository.findById(user.id);
    expect(stored).toEqual({ ...before, passwordHash: newHash }); expect(verifyPassword('Changed456!', stored!.passwordHash)).toBe(true);
  });
  it('does not write a missing or disabled user', async () => {
    const memory = new InMemoryAuthRepository(); const user = (await memory.findByEmail('student@qi-education.local'))!; user.status = 'disabled';
    expect(await memory.updatePasswordHash(user.id, 'hash')).toBeNull(); expect(await memory.updatePasswordHash('missing', 'hash')).toBeNull();
    sheet.rows = [[...authSheetHeaders], authUserToSheetRow(user)]; const repository = new GoogleSheetsAuthRepository();
    expect(await repository.updatePasswordHash(user.id, 'hash')).toBeNull(); expect(await repository.updatePasswordHash('missing', 'hash')).toBeNull();
  });
  it('retains a reset password when an enrollment write read the old hash first', async () => {
    const memory = new InMemoryAuthRepository(); const user = (await memory.findByEmail('student@qi-education.local'))!;
    sheet.rows = [[...authSheetHeaders], authUserToSheetRow(user)];
    let release!: () => void; let entered!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; });
    const enrollmentStarted = new Promise<void>(resolve => { entered = resolve; });
    sheet.update.mockImplementation(async ({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) => {
      if (range.endsWith('!D2')) { sheet.rows[1][3] = requestBody.values[0][0]; return {}; }
      entered(); await paused;
      if (range.endsWith('!H2')) sheet.rows[1][7] = requestBody.values[0][0];
      else sheet.rows[1] = requestBody.values[0];
      return {};
    });
    const repository = new GoogleSheetsAuthRepository(); const enrollment = repository.enrollUserInCourse(user.id, 'new-course');
    await enrollmentStarted;
    const newHash = hashPassword('Changed456!'); await repository.updatePasswordHash(user.id, newHash);
    release(); await enrollment;
    const stored = (await repository.findById(user.id))!;
    expect(stored.passwordHash).toBe(newHash); expect(stored.enrolledCourseIds).toEqual(['new-course']);
  });
  it('fails closed for an unavailable production store', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.spyOn(config, 'hasGoogleSheetsConfig').mockReturnValue(false);
    await expect(createAuthRepository().updatePasswordHash('user', 'hash')).rejects.toThrow();
  });
  it('fresh credential reads do not join a lookup that captured the hash before another write', async () => {
    const memory = new InMemoryAuthRepository(); const user = (await memory.findByEmail('student@qi-education.local'))!;
    sheet.rows = [[...authSheetHeaders], authUserToSheetRow(user)];
    let entered!: () => void; let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const paused = new Promise<void>(resolve => { release = resolve; });
    sheet.beforeRead = async () => { sheet.beforeRead = async () => {}; entered(); await paused; };
    const repository = new GoogleSheetsAuthRepository(); const stale = repository.findById(user.id); await started;
    try {
      // Mimic another instance writing the password without invalidating this instance's read.
      const newHash = hashPassword('Changed456!'); sheet.rows[1][3] = newHash;
      const fresh = repository.findById(user.id, { fresh: true }); release();
      expect((await fresh)!.passwordHash).toBe(newHash); expect((await stale)!.passwordHash).toBe(user.passwordHash);
    } finally { release(); await stale; }
  });
});
