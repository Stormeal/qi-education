import { describe, expect, it } from 'vitest';
import { InMemoryAuthRepository, DuplicateAccountError } from './authRepository.js';
import { MongoAuthRepository } from './mongoAuthRepository.js';
import { fakeAuthCollection } from '../test/fakeAuthCollection.js';
import type { AuthUser } from './auth.js';

const user: AuthUser = { id: 'ada', email: 'ada@example.test', displayName: 'Ada', passwordHash: 'unchanged-hash', role: 'student', status: 'active', createdAt: '2026-10-17T10:00:00.000Z', enrolledCourseIds: ['old'] };
describe.each(['memory', 'mongo'])('US-P014 account repository contract (%s)', kind => {
  async function setup() {
    const fake = fakeAuthCollection();
    const repository = kind === 'mongo' ? new MongoAuthRepository(async () => fake.collection) : new InMemoryAuthRepository();
    await repository.createUser({ ...user, enrolledCourseIds: [...user.enrolledCourseIds] });
    return { repository, fake };
  }
  it('keeps all account fields, normalizes addresses, looks up by ID and lists accounts', async () => {
    const { repository } = await setup();
    expect(await repository.findById('ada')).toEqual(user);
    expect(await repository.findByEmail(' ADA@EXAMPLE.TEST ')).toEqual(user);
    expect(await repository.listUsers()).toContainEqual(user);
    expect(await repository.findById('missing')).toBeNull();
    expect(await repository.findByEmail('missing@example.test')).toBeNull();
    await expect(repository.createUser({ ...user, id: 'duplicate', email: ' ADA@EXAMPLE.TEST ' })).rejects.toBeInstanceOf(DuplicateAccountError);
  });
  it('AC04 unions enrollments while replacing only the password and refuses disabled password writes', async () => {
    const { repository } = await setup();
    await Promise.all([repository.enrollUserInCourse('ada', 'new'), repository.updatePasswordHash('ada', 'new-hash'), repository.enrollUserInCourse('ada', 'other')]);
    await repository.enrollUserInCourse('ada', 'new');
    expect(await repository.findById('ada')).toEqual({ ...user, passwordHash: 'new-hash', enrolledCourseIds: ['old', 'new', 'other'] });
    expect(await repository.countEnrolledUsers('new')).toBe(1);
    await repository.updateStatus('ada', 'disabled');
    expect(await repository.updatePasswordHash('ada', 'ignored')).toBeNull();
    expect(await repository.enrollUserInCourse('missing', 'new')).toBeNull();
  });
  it('AC02 preserves previous role/status snapshots for the existing change log and no-ops unchanged values', async () => {
    const { repository } = await setup();
    expect(await repository.updateRoleWithChange('ada', 'teacher')).toEqual({ previous: user, user: { ...user, role: 'teacher' } });
    expect(await repository.updateRoleWithChange('ada', 'teacher')).toEqual({ previous: null, user: { ...user, role: 'teacher' } });
    expect(await repository.updateStatusWithChange('ada', 'disabled')).toEqual({ previous: { ...user, role: 'teacher' }, user: { ...user, role: 'teacher', status: 'disabled' } });
    expect(await repository.updateStatusWithChange('ada', 'disabled')).toEqual({ previous: null, user: { ...user, role: 'teacher', status: 'disabled' } });
    expect(await repository.updateRole('missing', 'teacher')).toBeNull();
    expect(await repository.updateStatus('missing', 'active')).toBeNull();
  });
});

describe('US-P014 Mongo multi-instance guarantees', () => {
  it('AC03 unique normalized email and AC04 independent updates hold across instances sharing a collection', async () => {
    const fake = fakeAuthCollection();
    const one = new MongoAuthRepository(async () => fake.collection), two = new MongoAuthRepository(async () => fake.collection);
    const results = await Promise.allSettled([one.createUser(user), two.createUser({ ...user, id: 'other', email: ' ADA@EXAMPLE.TEST ' })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateAccountError);
    await Promise.all([one.enrollUserInCourse('ada', 'new'), two.updatePasswordHash('ada', 'new-hash')]);
    expect(await one.findById('ada')).toEqual({ ...user, passwordHash: 'new-hash', enrolledCourseIds: ['old', 'new'] });
    await two.updateStatus('ada', 'disabled');
    expect((await one.findById('ada'))?.status).toBe('disabled');
    await two.updateRole('ada', 'admin');
    expect((await one.findByEmail('ada@example.test'))?.role).toBe('admin');
    expect(fake.calls.indexes).toEqual(expect.arrayContaining([
      { keys: { email: 1 }, options: expect.objectContaining({ unique: true }) },
      { keys: { enrolledCourseIds: 1 }, options: expect.any(Object) },
    ]));
  });
  it('AC01 every lookup reads a document, count uses a query and returned snapshots cannot mutate storage', async () => {
    const fake = fakeAuthCollection(); const repository = new MongoAuthRepository(async () => fake.collection);
    await repository.createUser(user);
    const first = await repository.findById('ada'); first!.displayName = 'Forged';
    expect(await repository.findById('ada')).toEqual(user);
    expect(await repository.findByEmail('ada@example.test')).toEqual(user);
    expect(fake.calls.finds).toEqual([{ _id: 'ada' }, { _id: 'ada' }, { email: 'ada@example.test' }]);
    expect(await repository.countEnrolledUsers('old')).toBe(1);
    expect(fake.calls.counts).toEqual([{ enrolledCourseIds: 'old' }]);
    const failure = new MongoAuthRepository(async () => { throw new Error('Unavailable'); });
    await expect(failure.findById('ada')).rejects.toThrow('Unavailable');
    await expect(failure.updateRole('ada', 'teacher')).rejects.toThrow('Unavailable');
  });
});
