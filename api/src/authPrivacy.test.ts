import { describe, expect, it } from 'vitest';
import { InMemoryAuthRepository, ReadOnlyAuthRepository } from './authRepository.js';
import { MongoAuthRepository } from './mongoAuthRepository.js';
import { fakeAuthCollection } from '../test/fakeAuthCollection.js';
import { signupSchema, toAuthenticatedUser, verifyPassword, type AuthUser } from './auth.js';

const ada: AuthUser = { id: 'ada', email: 'ada@example.test', displayName: 'Ada Lovelace', passwordHash: 'original-hash',
  role: 'teacher', status: 'active', createdAt: '2026-10-17T10:00:00.000Z', enrolledCourseIds: ['course'], emailConfirmed: true };
const bob: AuthUser = { ...ada, id: 'bob', email: 'bob@example.test', displayName: 'Bob', enrolledCourseIds: ['course', 'other'] };

describe.each(['memory', 'mongo'])('US-P021 account privacy (%s)', kind => {
  async function setup() {
    const fake = fakeAuthCollection();
    const repository = kind === 'mongo' ? new MongoAuthRepository(async () => fake.collection) : new InMemoryAuthRepository();
    await repository.createUser(structuredClone(ada));
    await repository.createUser(structuredClone(bob));
    return { repository, fake };
  }

  it('exports only the caller account and excludes credentials and internal erasure state', async () => {
    const { repository } = await setup();
    await repository.beginErasure('ada', 'original-hash');
    expect(await repository.collectForExport('ada')).toEqual({ id: 'ada', email: 'ada@example.test', displayName: 'Ada Lovelace',
      role: 'teacher', status: 'disabled', createdAt: '2026-10-17T10:00:00.000Z', enrolledCourseIds: ['course'], emailConfirmed: true });
    expect(await repository.collectForExport('missing')).toBeNull();
    expect(await repository.findById('bob')).toEqual(bob);
  });

  it('atomically refuses stale credentials, closes immediately, and resumes the same pending erasure', async () => {
    const { repository } = await setup();
    expect(await repository.beginErasure('ada', 'wrong-hash')).toBeNull();
    expect(await repository.findById('ada')).toEqual(ada);
    await repository.updatePasswordHash('ada', 'new-hash', 'original-hash');
    expect(await repository.beginErasure('ada', 'original-hash')).toBeNull();
    const [first, second] = await Promise.all([repository.beginErasure('ada', 'new-hash'), repository.beginErasure('ada', 'new-hash')]);
    expect(first).toMatchObject({ status: 'disabled', passwordHash: 'new-hash', privacyErasure: { state: 'pending', startedAt: expect.any(String) } });
    expect(second).toEqual(first);
    expect(await repository.beginErasure('ada', 'wrong-hash')).toBeNull();
    expect(await repository.updateRole('ada', 'admin')).toBeNull();
    expect(await repository.updateStatus('ada', 'active')).toBeNull();
    expect(await repository.updateRoleWithChange('ada', 'teacher')).toBeNull();
    expect(await repository.updateStatusWithChange('ada', 'disabled')).toBeNull();
    expect(await repository.updatePasswordHash('ada', 'revive')).toBeNull();
    expect(await repository.confirmEmail('ada')).toBeNull();
  });

  it('creates unique irreversible tombstones and preserves enrollment counts', async () => {
    const { repository, fake } = await setup();
    const started = await repository.beginErasure('ada', 'original-hash');
    await repository.anonymizeForUser('ada');
    await repository.anonymizeForUser('ada');
    await repository.beginErasure('bob', 'original-hash');
    await repository.anonymizeForUser('bob');
    expect(await repository.findById('ada')).toEqual({ id: 'ada', email: 'erased:ada', displayName: 'Deleted user', passwordHash: '',
      role: 'student', status: 'disabled', createdAt: '2026-10-17T10:00:00.000Z', enrolledCourseIds: ['course'], emailConfirmed: false,
      privacyErasure: { state: 'complete', startedAt: started!.privacyErasure!.startedAt } });
    expect((await repository.findById('bob'))?.email).toBe('erased:bob');
    expect(await repository.findByEmail('ada@example.test')).toBeNull();
    expect(await repository.countEnrolledUsers('course')).toBe(2);
    expect(await repository.beginErasure('ada', '')).toBeNull();
    expect(await repository.updateRole('ada', 'admin')).toBeNull();
    expect(await repository.updateStatus('ada', 'active')).toBeNull();
    expect(await repository.updatePasswordHash('ada', 'revive')).toBeNull();
    expect(await repository.confirmEmail('ada')).toBeNull();
    if (kind === 'mongo') {
      expect(fake.calls.writes.every(write => (write as { options: { writeConcern?: { w: string } } }).options.writeConcern?.w === 'majority')).toBe(true);
    }
  });

  it('admits concurrent active mutations, preserves leases when closing, and releases only the specified lease', async () => {
    const { repository, fake } = await setup();
    const other = kind === 'mongo' ? new MongoAuthRepository(async () => fake.collection) : repository;
    const first = 'ed5b3472-429f-4ba3-8062-2049cbeb2a01', second = 'ed5b3472-429f-4ba3-8062-2049cbeb2a02';
    expect(await Promise.all([repository.beginPrivacyMutation('ada', first, 2000), other.beginPrivacyMutation('ada', second, 3000)])).toEqual([true, true]);
    expect((await repository.findById('ada'))?.privacyMutations).toEqual({ [first]: 2000, [second]: 3000 });
    expect(await repository.collectForExport('ada')).not.toHaveProperty('privacyMutations');
    expect(toAuthenticatedUser((await repository.findById('ada'))!)).not.toHaveProperty('privacyMutations');
    const pending = await repository.beginErasure('ada', 'original-hash');
    expect(pending?.privacyMutations).toEqual({ [first]: 2000, [second]: 3000 });
    expect(await repository.beginPrivacyMutation('ada', 'ed5b3472-429f-4ba3-8062-2049cbeb2a03', 4000)).toBe(false);
    await repository.finishPrivacyMutation('ada', 'ed5b3472-429f-4ba3-8062-2049cbeb2a03');
    expect((await repository.findById('ada'))?.privacyMutations).toEqual({ [first]: 2000, [second]: 3000 });
    await other.finishPrivacyMutation('ada', first);
    expect((await repository.findById('ada'))?.privacyMutations).toEqual({ [second]: 3000 });
    expect((await repository.findById('bob'))?.privacyMutations).toBeUndefined();
    await repository.anonymizeForUser('ada');
    expect((await repository.findById('ada'))?.privacyMutations).toBeUndefined();
    await repository.finishPrivacyMutation('ada', second);
    expect((await repository.findById('ada'))?.privacyMutations).toBeUndefined();
  });

  it('rejects unsafe lease IDs and blocks admission for inactive, missing and frozen accounts', async () => {
    const { repository } = await setup();
    const lease = 'ed5b3472-429f-4ba3-8062-2049cbeb2a01';
    for (const invalid of ['nested.path', '$set', '', 'not-a-uuid']) {
      await expect(repository.beginPrivacyMutation('ada', invalid, 2000)).rejects.toThrow('mutation ID');
      await expect(repository.finishPrivacyMutation('ada', invalid)).rejects.toThrow('mutation ID');
    }
    expect((await repository.findById('ada'))?.privacyMutations).toBeUndefined();
    await repository.updateStatus('ada', 'disabled');
    expect(await repository.beginPrivacyMutation('ada', lease, 2000)).toBe(false);
    expect(await repository.beginPrivacyMutation('missing', lease, 2000)).toBe(false);
    const frozen = new ReadOnlyAuthRepository(repository);
    await expect(frozen.beginPrivacyMutation('bob', lease, 2000)).rejects.toThrow('read-only');
    await expect(frozen.finishPrivacyMutation('bob', lease)).rejects.toThrow('read-only');
  });

  it('can cancel only a pending erasure with its same credential before cleanup starts', async () => {
    const { repository } = await setup();
    await repository.beginErasure('ada', 'original-hash');
    expect(await repository.cancelErasure('ada', 'stale-hash')).toBe(false);
    expect((await repository.findById('ada'))?.status).toBe('disabled');
    expect(await repository.cancelErasure('ada', 'original-hash')).toBe(true);
    expect(await repository.findById('ada')).toEqual(ada);
    expect(await repository.cancelErasure('ada', 'original-hash')).toBe(false);
    await expect(repository.markErasureCleaning('ada')).rejects.toThrow('not pending');
    const frozen = new ReadOnlyAuthRepository(repository);
    await expect(frozen.cancelErasure('ada', 'original-hash')).rejects.toThrow('read-only');
    await expect(frozen.markErasureCleaning('ada')).rejects.toThrow('read-only');
  });

  it('marks destructive cleanup durably and refuses cancellation across adapter instances and retries', async () => {
    const { repository, fake } = await setup();
    const other = kind === 'mongo' ? new MongoAuthRepository(async () => fake.collection) : repository;
    const pending = await repository.beginErasure('ada', 'original-hash');
    await other.markErasureCleaning('ada');
    expect(await repository.beginErasure('ada', 'original-hash')).toMatchObject({ status: 'disabled',
      privacyErasure: { state: 'pending', startedAt: pending!.privacyErasure!.startedAt, cleanupStarted: true } });
    expect(await repository.cancelErasure('ada', 'original-hash')).toBe(false);
    expect((await repository.findById('ada'))?.status).toBe('disabled');
    expect(await repository.collectForExport('ada')).not.toHaveProperty('privacyErasure');
    await repository.anonymizeForUser('ada');
    expect(await repository.cancelErasure('ada', '')).toBe(false);
    expect((await repository.findById('ada'))?.status).toBe('disabled');
  });

  it('finishes erasure despite reserved-email accounts created before signup validation changed', async () => {
    const { repository } = await setup();
    await repository.createUser({ ...bob, id: 'old-attacker', email: 'ada@erased.invalid' });
    await repository.beginErasure('ada', 'original-hash');
    await repository.anonymizeForUser('ada');
    expect(await repository.findById('ada')).toMatchObject({ email: 'erased:ada', privacyErasure: { state: 'complete' } });
    expect((await repository.findById('old-attacker'))?.email).toBe('ada@erased.invalid');
  });

  it('does not erase a disabled account using its old password and refuses frozen erasure while allowing export', async () => {
    const { repository } = await setup();
    await repository.updateStatus('ada', 'disabled');
    expect(await repository.beginErasure('ada', 'original-hash')).toBeNull();
    const frozen = new ReadOnlyAuthRepository(repository);
    expect(await frozen.collectForExport('bob')).toMatchObject({ id: 'bob', email: 'bob@example.test' });
    await expect(frozen.beginErasure('bob', 'original-hash')).rejects.toThrow('read-only');
    await expect(frozen.anonymizeForUser('bob')).rejects.toThrow('read-only');
    expect(await repository.findById('bob')).toEqual(bob);
  });
});

it('US-P021 session projection whitelists safe fields even when new internal fields are stored', () => {
  const internal = { ...ada, privacyErasure: { state: 'pending' as const, startedAt: '2026-10-31T10:00:00.000Z' }, futureSecret: 'secret' };
  expect(toAuthenticatedUser(internal)).toEqual({ id: 'ada', email: 'ada@example.test', displayName: 'Ada Lovelace', role: 'teacher', status: 'active',
    createdAt: '2026-10-17T10:00:00.000Z', enrolledCourseIds: ['course'], emailConfirmed: true });
});

describe.each(['memory', 'mongo'])('US-P021 system account (%s)', kind => {
  it('seeds lazily once under concurrent calls and permanently refuses login-enabling writes', async () => {
    const { ensureSystemAccount, SYSTEM_ACCOUNT_ID } = await import('./systemAccount.js');
    const fake = fakeAuthCollection();
    const repository = kind === 'mongo' ? new MongoAuthRepository(async () => fake.collection) : new InMemoryAuthRepository();
    const second = kind === 'mongo' ? new MongoAuthRepository(async () => fake.collection) : repository;
    expect(await repository.findById(SYSTEM_ACCOUNT_ID)).toBeNull();
    await Promise.all([ensureSystemAccount(repository), ensureSystemAccount(second), ensureSystemAccount(repository)]);
    const system = await repository.findById(SYSTEM_ACCOUNT_ID);
    expect(system).toMatchObject({ id: SYSTEM_ACCOUNT_ID, status: 'disabled', role: 'admin', passwordHash: '' });
    expect(system?.email).toBe('system:qi-academy-system');
    expect(verifyPassword('Password123!', system!.passwordHash)).toBe(false);
    expect((await repository.listUsers()).filter(user => user.id === SYSTEM_ACCOUNT_ID)).toHaveLength(1);
    expect(await repository.updateStatus(SYSTEM_ACCOUNT_ID, 'active')).toBeNull();
    expect(await repository.updateRole(SYSTEM_ACCOUNT_ID, 'student')).toBeNull();
    expect(await repository.updatePasswordHash(SYSTEM_ACCOUNT_ID, 'usable-hash')).toBeNull();
    expect(await repository.beginErasure(SYSTEM_ACCOUNT_ID, '')).toBeNull();
    await repository.anonymizeForUser(SYSTEM_ACCOUNT_ID);
    expect(await repository.findById(SYSTEM_ACCOUNT_ID)).toEqual(system);
  });

  it('seeds despite a pre-existing account claiming the former reserved email', async () => {
    const { ensureSystemAccount, SYSTEM_ACCOUNT_ID } = await import('./systemAccount.js');
    const fake = fakeAuthCollection();
    const repository = kind === 'mongo' ? new MongoAuthRepository(async () => fake.collection) : new InMemoryAuthRepository();
    await repository.createUser({ ...ada, id: 'old-attacker', email: 'system@qi-academy.invalid' });
    expect(await ensureSystemAccount(repository)).toMatchObject({ id: SYSTEM_ACCOUNT_ID, email: 'system:qi-academy-system', status: 'disabled' });
    expect((await repository.findById('old-attacker'))?.email).toBe('system@qi-academy.invalid');
  });
});

it.each(['system@qi-academy.invalid', 'ada@erased.invalid', 'user@other.invalid', 'USER@ERASED.INVALID', 'erased:ada', 'system:qi-academy-system'])(
  'US-P021 rejects reserved signup address %s', email => {
    expect(signupSchema.safeParse({ displayName: 'Person', email, password: 'Password123!' }).success).toBe(false);
  });
