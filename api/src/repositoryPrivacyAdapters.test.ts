import { describe, expect, it } from 'vitest';
import { InMemoryAccountProfileRepository, MongoAccountProfileRepository } from './accountProfileRepository.js';
import { InMemoryLearningProgressRepository, MongoLearningProgressRepository } from './learningProgressRepository.js';
import { InMemoryLessonNotesRepository, MongoLessonNotesRepository } from './lessonNotesRepository.js';
import { InMemoryAccountCareersRepository, MongoAccountCareersRepository } from './accountCareersRepository.js';
import { InMemoryInstructorProfileRepository, MongoInstructorProfileRepository } from './instructorProfileRepository.js';
import { InMemoryNotificationRepository, MongoNotificationRepository } from './notificationRepository.js';
import { InMemoryPaymentRepository, MongoPaymentRepository, type CoursePayment } from './paymentRepository.js';
import { InMemoryPasswordResetRepository, MongoPasswordResetRepository } from './passwordResetRepository.js';
import { InMemoryEmailConfirmationRepository, MongoEmailConfirmationRepository } from './emailConfirmationRepository.js';
import { fakeAccountMailTokenCollection } from '../test/fakeAccountMailTokenCollection.js';

// Only the external driver boundary is doubled; adapter scoping and mapping remain real.
function collectionStore() {
  const rows = new Map<string, Record<string, unknown>>();
  const matches = (row: Record<string, unknown>, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([key, value]) => row[key] === value);
  const collection = {
    async updateMany(filter: Record<string, unknown>, pipeline: { $project: Record<string, number> }[]) {
      let matchedCount = 0;
      for (const [id, row] of rows) if (matches(row, filter)) {
        rows.set(id, Object.fromEntries(Object.entries(row).filter(([field]) => pipeline[0].$project[field] === 1)));
        matchedCount++;
      }
      return { acknowledged: true, matchedCount };
    },
    async createIndex() { return 'index'; },
    async countDocuments(filter: Record<string, unknown>) { return [...rows.values()].filter(row => matches(row, filter)).length; },
    async findOne(filter: Record<string, unknown>) {
      return structuredClone([...rows.values()].find(row => matches(row, filter)) ?? null);
    },
    find(filter: Record<string, unknown>) {
      return { async toArray() { return structuredClone([...rows.values()].filter(row => matches(row, filter))); } };
    },
    async deleteOne(filter: Record<string, unknown>) {
      const row = [...rows.values()].find(row => matches(row, filter));
      return { acknowledged: true, deletedCount: row && rows.delete(String(row._id)) ? 1 : 0 };
    },
    async deleteMany(filter: Record<string, unknown>) {
      let deletedCount = 0;
      for (const [id, row] of rows) if (matches(row, filter)) { rows.delete(id); deletedCount++; }
      return { acknowledged: true, deletedCount };
    },
    async replaceOne(filter: Record<string, unknown>, document: Record<string, unknown>) {
      const row = [...rows.values()].find(row => matches(row, filter));
      if (row) rows.set(String(row._id), structuredClone(document));
      return { acknowledged: true, matchedCount: row ? 1 : 0 };
    },
  };
  return { rows, collection };
}
const profile = { bio: 'Private bio', jobTitle: 'Tester', company: 'QI', learningGoals: 'Learn', avatarColor: '#123456',
  notificationPrefs: { reviewActivity: true, organization: false, adminInbox: true } };
const careers = { followedPathIds: ['path'], focusPathId: 'path', achievements: [{ actionId: 'exam', provenance: 'cv' as const, declaredAt: '2026-01-01' }] };
const noteInput = { componentId: 'lesson', text: 'My note', videoSeconds: 12 };
const payment: CoursePayment = { _id: 'session', userId: 'one', courseId: 'course', amountDkk: 200,
  stripeCustomerId: 'cus_accounting', paidAt: '2026-01-01', refundedAt: '2026-02-01' };

describe.each(['memory', 'mongo'] as const)('US-P021 repository privacy (%s)', kind => {
  it('exports only the caller account profile and removes it safely twice', async () => {
    const { rows, collection } = collectionStore();
    const repo = kind === 'memory' ? new InMemoryAccountProfileRepository() : new MongoAccountProfileRepository(async () => collection as never);
    if (kind === 'memory') { await repo.save('one', profile); await repo.save('two', profile); }
    else for (const id of ['one', 'two']) rows.set(id, { _id: id, ...profile, updatedAt: '2026-01-01', passwordHash: 'secret' });
    const exported = await repo.collectForExport('one');
    expect(exported).toMatchObject({ _id: 'one', ...profile });
    expect(exported).not.toHaveProperty('passwordHash');
    exported!.notificationPrefs.organization = true;
    expect((await repo.collectForExport('one'))?.notificationPrefs.organization).toBe(false);
    await repo.removeForUser('one'); await repo.removeForUser('one');
    expect(await repo.collectForExport('one')).toBeNull();
    expect(await repo.collectForExport('two')).toMatchObject({ _id: 'two', ...profile });
  });
  it('exports and deletes progress across every caller course with isolated snapshots', async () => {
    const { rows, collection } = collectionStore();
    const repo = kind === 'memory' ? new InMemoryLearningProgressRepository() : new MongoLearningProgressRepository(async () => collection as never);
    for (const [userId, courseId] of [['one', 'a'], ['one', 'b'], ['two', 'a']]) {
      if (kind === 'memory') { await repo.complete(userId, courseId, 'lesson'); await repo.recordPass(userId, courseId, 'proof'); }
      else rows.set(JSON.stringify([userId, courseId]), { _id: JSON.stringify([userId, courseId]), userId, courseId, completedIds: ['lesson'], passedQuizzes: ['proof'], token: 'secret' });
    }
    const exported = await repo.collectForExport('one');
    expect(exported.map(row => row.courseId).sort()).toEqual(['a', 'b']);
    expect(exported.every(row => row.userId === 'one')).toBe(true);
    expect(JSON.stringify(exported)).not.toContain('secret');
    exported[0].completedIds.push('forged');
    expect((await repo.collectForExport('one'))[0].completedIds).toEqual(['lesson']);
    await repo.removeForUser('one'); await repo.removeForUser('one');
    expect(await repo.collectForExport('one')).toEqual([]);
    expect(await repo.collectForExport('two')).toHaveLength(1);
  });
  it('exports and deletes notes across every caller course without touching another learner', async () => {
    const { rows, collection } = collectionStore();
    const repo = kind === 'memory' ? new InMemoryLessonNotesRepository() : new MongoLessonNotesRepository(async () => collection as never);
    for (const [userId, courseId] of [['one', 'a'], ['one', 'b'], ['two', 'a']]) {
      if (kind === 'memory') await repo.add(userId, courseId, noteInput);
      else rows.set(JSON.stringify([userId, courseId]), { _id: JSON.stringify([userId, courseId]), userId, courseId, notes: [
        { ...noteInput, id: courseId, courseId, createdAt: '2026-01-01', updatedAt: '2026-01-01', token: 'secret' }], passwordHash: 'secret' });
    }
    const exported = await repo.collectForExport('one');
    expect(exported.map(row => row.courseId).sort()).toEqual(['a', 'b']);
    expect(exported.map(row => row.text)).toEqual(['My note', 'My note']);
    expect(JSON.stringify(exported)).not.toContain('secret');
    exported[0].text = 'forged';
    expect((await repo.collectForExport('one'))[0].text).toBe('My note');
    await repo.removeForUser('one'); await repo.removeForUser('one');
    expect(await repo.collectForExport('one')).toEqual([]);
    expect(await repo.collectForExport('two')).toHaveLength(1);
  });
  it('exports careers and declarations, then removes only the caller record', async () => {
    const { rows, collection } = collectionStore();
    const repo = kind === 'memory' ? new InMemoryAccountCareersRepository() : new MongoAccountCareersRepository(async () => collection as never);
    for (const id of ['one', 'two']) {
      if (kind === 'memory') await repo.mutate(id, careers, () => {});
      else rows.set(id, { _id: id, ...careers, version: 1, token: 'secret' });
    }
    const exported = await repo.collectForExport('one');
    expect(exported).toEqual({ _id: 'one', ...careers, version: 1 });
    exported!.achievements[0].actionId = 'forged';
    expect((await repo.collectForExport('one'))?.achievements[0].actionId).toBe('exam');
    await repo.removeForUser('one'); await repo.removeForUser('one');
    expect(await repo.collectForExport('one')).toBeNull();
    expect(await repo.collectForExport('two')).toMatchObject({ _id: 'two', ...careers });
  });
  it('clears the caller instructor description without changing another instructor', async () => {
    const { rows, collection } = collectionStore();
    const repo = kind === 'memory' ? new InMemoryInstructorProfileRepository() : new MongoInstructorProfileRepository(async () => collection as never);
    if (kind === 'memory') { await repo.save('one', 'Private biography'); await repo.save('two', 'Other biography'); }
    else { rows.set('one', { _id: 'one', description: 'Private biography', token: 'secret' }); rows.set('two', { _id: 'two', description: 'Other biography' }); }
    const exported = await repo.collectForExport('one');
    expect(exported).toEqual({ _id: 'one', description: 'Private biography' });
    exported!.description = 'forged';
    expect((await repo.collectForExport('one'))?.description).toBe('Private biography');
    await repo.anonymizeForUser('one'); await repo.anonymizeForUser('one');
    expect(await repo.collectForExport('one')).toBeNull();
    expect(await repo.collectForExport('two')).toEqual({ _id: 'two', description: 'Other biography' });
  });
  it('exports and deletes all notifications beyond the normal fifty-row page', async () => {
    const { rows, collection } = collectionStore();
    const repo = kind === 'memory' ? new InMemoryNotificationRepository() : new MongoNotificationRepository(async () => collection as never);
    for (let i = 0; i < 62; i++) {
      const userId = i === 61 ? 'two' : 'one';
      const input = { userId, type: 'org-invitation' as const, title: String(i), link: '/organization' };
      if (kind === 'memory') await repo.create(input);
      else rows.set(String(i), { _id: String(i), id: String(i), ...input, createdAt: '2026-01-01', readAt: null, token: 'secret' });
    }
    const exported = await repo.collectForExport('one');
    expect(exported).toHaveLength(61);
    expect(exported.every(row => row.userId === 'one')).toBe(true);
    expect(JSON.stringify(exported)).not.toContain('secret');
    exported[0].title = 'forged';
    expect((await repo.collectForExport('one')).some(row => row.title === 'forged')).toBe(false);
    await repo.removeForUser('one'); await repo.removeForUser('one');
    expect(await repo.collectForExport('one')).toEqual([]);
    expect(await repo.countUnread('two')).toBe(1);
  });
  it('whitelists purchase exports and retained accounting fields, removing legacy identity data', async () => {
    const { rows, collection } = collectionStore();
    const repo = kind === 'memory' ? new InMemoryPaymentRepository() : new MongoPaymentRepository(async () => collection as never);
    const legacy = { ...payment, name: 'Private name', email: 'private@example.test', token: 'secret' };
    const other = { ...payment, _id: 'other-session', userId: 'two' };
    if (kind === 'memory') { await repo.add(legacy); await repo.add(other); }
    else { rows.set('session', legacy); rows.set('other-session', other); }
    const exported = await repo.collectForExport('one');
    expect(exported).toEqual([payment]);
    exported[0].stripeCustomerId = 'forged';
    expect((await repo.collectForExport('one'))[0].stripeCustomerId).toBe('cus_accounting');
    await repo.anonymizeForUser('one'); await repo.anonymizeForUser('one');
    expect(await repo.findById('session')).toEqual(payment);
    expect(await repo.findById('other-session')).toEqual(other);
  });
  it.each(['reset', 'confirmation'] as const)('removes all caller %s tokens including pending links and leaves other accounts usable', async tokenKind => {
    const fake = fakeAccountMailTokenCollection();
    const repo = tokenKind === 'reset'
      ? kind === 'memory' ? new InMemoryPasswordResetRepository() : new MongoPasswordResetRepository(async () => fake.collection)
      : kind === 'memory' ? new InMemoryEmailConfirmationRepository() : new MongoEmailConfirmationRepository(async () => fake.collection);
    await repo.reserve('one', 'active', 100); await repo.activate('one', 'active');
    await repo.reserve('one', 'pending', 100);
    await repo.reserve('two', 'other', 100); await repo.activate('two', 'other');
    await repo.removeForUser('one'); await repo.removeForUser('one');
    expect(await repo.findActive('active', 101)).toBeNull();
    expect(await repo.activate('one', 'pending')).toBe(false);
    expect(await repo.findActive('other', 101)).toEqual({ userId: 'two', hash: 'other' });
    if (kind === 'mongo') expect(fake.documents.has('one')).toBe(false);
  });
});

it('US-P021 preserves a refund arriving during Mongo payment anonymization', async () => {
  let current: CoursePayment & { email?: string } = { ...payment, refundedAt: undefined, email: 'private@example.test' };
  const collection = {
    async createIndex() { return 'index'; },
    find() { return { async toArray() { return [structuredClone(current)]; } }; },
    async replaceOne(_filter: unknown, replacement: CoursePayment) {
      current.refundedAt = '2026-03-01';
      current = structuredClone(replacement);
      return { acknowledged: true, matchedCount: 1 };
    },
    async updateMany(filter: { userId: string }, pipeline: { $project: Record<string, number> }[]) {
      current.refundedAt = '2026-03-01';
      if (current.userId === filter.userId) current = Object.fromEntries(Object.entries(current)
        .filter(([field]) => pipeline[0].$project[field] === 1)) as typeof current;
      return { acknowledged: true, matchedCount: 1 };
    },
  };
  await new MongoPaymentRepository(async () => collection as never).anonymizeForUser('one');
  expect(current).toEqual({ ...payment, refundedAt: '2026-03-01' });
});
